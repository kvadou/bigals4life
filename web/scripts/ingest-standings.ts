// bun scripts/ingest-standings.ts <standings.pdf ...>   Idempotent: re-running a week upserts it.
import { basename } from "node:path";
import { database } from "../lib/scorebook-server";
import { matchRosterName, parseStandings } from "../lib/league/bls-parse";
import { reconcileNight } from "../lib/league/reconcile";
import { nightSchema } from "../lib/scorebook";

const files = process.argv.slice(2);
if (!files.length) { console.error("Usage: bun scripts/ingest-standings.ts <pdf...>"); process.exit(1); }
const upsert = (table: string, rows: unknown, onConflict: string) => database(`${table}?on_conflict=${onConflict}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });

for (const file of files) {
  const proc = Bun.spawn(["pdftotext", "-layout", file, "-"], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  if (await proc.exited) { console.error(`${basename(file)}: pdftotext failed`); continue; }
  let week; try { week = parseStandings(text); } catch (e) { console.error(`${basename(file)}: ${(e as Error).message}`); continue; }

  const [season] = await upsert("league_seasons", { name: week.season, house: week.house, weeks_total: week.weeksTotal }, "name");
  const teams = await upsert("league_teams", week.teams.map(t => ({ season_id: season.id, number: t.number, name: t.name })), "season_id,number");
  const teamId = (n: number) => teams.find((t: { number: number }) => t.number === n)?.id ?? null;
  // Roster page has the untruncated team names; prefer them.
  for (const r of week.rosters) if (teamId(r.number) && teams.find((t: { number: number }) => t.number === r.number).name !== r.name) await database(`league_teams?id=eq.${teamId(r.number)}`, { method: "PATCH", body: JSON.stringify({ name: r.name }) });
  const rosterRows = week.rosters.flatMap(r => r.bowlers);
  const bowlers = await upsert("league_bowlers", rosterRows.map(b => ({ season_id: season.id, bls_id: b.blsId, name: b.name, hand: b.hand, team_id: teamId(b.teamNumber) })), "season_id,bls_id");
  const bowlerId = (blsId: number) => bowlers.find((b: { bls_id: number }) => b.bls_id === blsId)?.id;
  const [row] = await upsert("league_weeks", { season_id: season.id, week: week.week, bowled_on: week.date, source_file: basename(file), warnings: week.warnings, ingested_at: new Date().toISOString() }, "season_id,week");

  await upsert("league_team_weeks", week.teams.map(t => { const r = week.results.find(x => x.number === t.number); return {
    week_id: row.id, team_id: teamId(t.number), place: t.place, percent_won: t.percentWon, points_won: t.pointsWon, points_lost: t.pointsLost, unearned_points: t.unearnedPoints,
    ytd_percent_won: t.ytdPercentWon, ytd_won: t.ytdWon, ytd_lost: t.ytdLost, games_won: t.gamesWon, scratch_pins: t.scratchPins, pins_plus_hdcp: t.pinsPlusHdcp,
    lanes: r?.lanes ?? null, opponent_team_id: r ? teamId(r.opponentNumber) : null, hdcp_games: r?.hdcpGames ?? null, hdcp_total: r?.hdcpTotal ?? null, week_points_won: r?.pointsWon ?? null };
  }), "week_id,team_id");
  const names = rosterRows.map(b => b.name);
  const points = new Map(week.matchPoints.map(m => [matchRosterName(m.name, names), m.points]));
  await upsert("league_bowler_weeks", rosterRows.map(b => ({
    week_id: row.id, bowler_id: bowlerId(b.blsId), team_id: teamId(b.teamNumber), average: b.average, handicap: b.handicap, pins: b.pins, games: b.games, to_raise: b.toRaise, to_drop: b.toDrop,
    scratch_games: b.scratchGames, scratch_total: b.scratchTotal, hdcp_total: b.hdcpTotal, match_points_ytd: points.get(b.name) ?? null, warning: b.warning ?? null })), "week_id,bowler_id");

  // Reconcile any live scorebook for this week against Gary's sheet. Gary stays canonical; differences are stored for the league page.
  const ourNumber = week.rosters.find(r => r.bowlers.some(b => /^DOUG KVAMME$/i.test(b.name)))?.number;
  let reconciled = "";
  if (ourNumber) {
    const nights: { id: string; state: unknown }[] = await database(`scorebooks?select=id,state&state->match->>season=eq.${encodeURIComponent(week.season)}&state->match->>week=eq.${week.week}`);
    const results = nights.flatMap(n => { const parsed = nightSchema.safeParse(n.state); if (!parsed.success) return []; const r = reconcileNight(n.id, parsed.data, week, ourNumber); return r ? [r] : []; });
    if (results.length) {
      await database(`league_team_weeks?week_id=eq.${row.id}&team_id=eq.${teamId(ourNumber)}`, { method: "PATCH", body: JSON.stringify({ discrepancies: results }) });
      reconciled = `, reconciled ${results.length} night(s): ${results.reduce((s, r) => s + r.discrepancies.length, 0)} difference(s)`;
    }
  }
  if (process.env.BAFL_RECAP_ORIGIN !== "off") {
    const origin = process.env.BAFL_RECAP_ORIGIN ?? "https://strike-ceiling-web.vercel.app";
    try { const r = await fetch(`${origin}/api/league/recap`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ season: week.season, week: week.week }), signal: AbortSignal.timeout(50_000) }); reconciled += r.ok ? ", recap written" : `, recap skipped (${r.status})`; } catch { reconciled += ", recap skipped"; }
  }
  const us = week.teams.find(t => t.number === ourNumber);
  console.log(`${basename(file)}: ${week.season} week ${week.week}/${week.weeksTotal}, ${week.teams.length} teams, ${rosterRows.length} bowlers${us ? `, Big Al's ${us.place}${["st","nd","rd"][us.place - 1] ?? "th"} (${us.pointsWon}-${us.pointsLost}), last week ${week.results.find(r => r.number === us.number)?.pointsWon ?? "?"} pts` : ""}${week.warnings.length ? `, ${week.warnings.length} warning(s): ${week.warnings.join("; ")}` : ""}${reconciled}`);
}

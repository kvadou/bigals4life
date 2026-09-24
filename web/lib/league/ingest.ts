import { basename } from "node:path";
import { database } from "../scorebook-server";
import { matchRosterName, parseStandings, usedHandicap } from "./bls-parse";
import type { RosterBowler } from "./types";
import { reconcileNight } from "./reconcile";
import { nightSchema } from "../scorebook";

type Row = Record<string, any>;

const upsert = (table: string, rows: unknown, onConflict: string) => database(`${table}?on_conflict=${onConflict}`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(rows),
});

/** The handicap Gary used for this lineup name that week, or null when the name is not on the roster. */
function officialHandicap(name: string, rows: RosterBowler[]) {
  const needle = name.trim().toUpperCase();
  const row = rows.find(row => {
    const official = row.name.replace(/\s+[A-Z]\.\s+/g, " ").toUpperCase();
    return official === needle || official.startsWith(`${needle} `);
  });
  return row ? usedHandicap(row) : null;
}

/** Apply official handicaps to a saved match so its points recalculate from handicap totals. */
function syncMatchHandicaps(state: unknown, sheet: ReturnType<typeof parseStandings>, ourTeamNumber: number) {
  const parsed = nightSchema.safeParse(state);
  if (!parsed.success || !parsed.data.match) return null;
  const next = structuredClone(parsed.data);
  const match = next.match!;
  const oldOpponentNumber = match.opponent.number;
  const ours = sheet.rosters.find(r => r.number === ourTeamNumber)?.bowlers ?? [];
  const theirsNumber = sheet.results.find(r => r.number === ourTeamNumber)?.opponentNumber ?? match.opponent.number;
  const theirs = sheet.rosters.find(r => r.number === theirsNumber)?.bowlers ?? [];
  let changed = false;
  match.ours = match.ours.map(b => {
    const handicap = officialHandicap(b.name, ours);
    if (handicap == null || handicap === b.handicap) return b;
    changed = true;
    return { ...b, handicap };
  });
  match.opponent = { ...match.opponent, number: theirsNumber || match.opponent.number, bowlers: match.opponent.bowlers.map(b => {
    const handicap = officialHandicap(b.name, theirs);
    if (handicap == null || handicap === b.handicap) return b;
    changed = true;
    return { ...b, handicap };
  }) };
  if (theirsNumber && oldOpponentNumber !== theirsNumber) changed = true;
  return changed ? next : null;
}

export type IngestSummary = {
  season: string;
  week: number;
  weeksTotal: number;
  teams: number;
  bowlers: number;
  warnings: string[];
  ours: { place: number; pointsWon: number; pointsLost: number } | null;
  reconciled: number;
  recapWritten: boolean;
};

/** Persist one parsed BLS sheet. Gary's sheet remains the canonical source. */
export async function ingestStandingsText(text: string, sourceFile: string, options: { writeRecap?: boolean } = {}): Promise<IngestSummary> {
  const week = parseStandings(text);
  const [season] = await upsert("league_seasons", { name: week.season, house: week.house, weeks_total: week.weeksTotal }, "name");
  const teams = await upsert("league_teams", week.teams.map(t => ({ season_id: season.id, number: t.number, name: t.name })), "season_id,number");
  const teamId = (n: number) => teams.find((t: Row) => t.number === n)?.id ?? null;

  for (const roster of week.rosters) {
    const team = teams.find((t: Row) => t.number === roster.number);
    if (team && team.name !== roster.name) await database(`league_teams?id=eq.${team.id}`, { method: "PATCH", body: JSON.stringify({ name: roster.name }) });
  }
  const rosterRows = week.rosters.flatMap(r => r.bowlers);
  const bowlers = await upsert("league_bowlers", rosterRows.map(b => ({ season_id: season.id, bls_id: b.blsId, name: b.name, hand: b.hand, team_id: teamId(b.teamNumber) })), "season_id,bls_id");
  const bowlerId = (blsId: number) => bowlers.find((b: Row) => b.bls_id === blsId)?.id;
  const weekRow = { season_id: season.id, week: week.week, bowled_on: week.date, source_file: basename(sourceFile), warnings: week.warnings, ingested_at: new Date().toISOString() };
  // next_matchups arrives with migration 202609240001; until it is applied, ingest the week without it.
  const [row] = await upsert("league_weeks", { ...weekRow, next_matchups: week.nextMatchups.length ? week.nextMatchups : null }, "season_id,week")
    .catch(e => { if (/next_matchups/.test(String(e))) return upsert("league_weeks", weekRow, "season_id,week"); throw e; });

  await upsert("league_team_weeks", week.teams.map(t => {
    const result = week.results.find(x => x.number === t.number);
    return {
      week_id: row.id, team_id: teamId(t.number), place: t.place, percent_won: t.percentWon, points_won: t.pointsWon, points_lost: t.pointsLost, unearned_points: t.unearnedPoints,
      ytd_percent_won: t.ytdPercentWon, ytd_won: t.ytdWon, ytd_lost: t.ytdLost, games_won: t.gamesWon, scratch_pins: t.scratchPins, pins_plus_hdcp: t.pinsPlusHdcp,
      lanes: result?.lanes ?? null, opponent_team_id: result ? teamId(result.opponentNumber) : null, hdcp_games: result?.hdcpGames ?? null, hdcp_total: result?.hdcpTotal ?? null, week_points_won: result?.pointsWon ?? null,
    };
  }), "week_id,team_id");

  const names = rosterRows.map(b => b.name);
  const points = new Map(week.matchPoints.map(m => [matchRosterName(m.name, names), m.points]));
  await upsert("league_bowler_weeks", rosterRows.map(b => ({
    week_id: row.id, bowler_id: bowlerId(b.blsId), team_id: teamId(b.teamNumber), average: b.average, handicap: b.handicap, pins: b.pins, games: b.games, to_raise: b.toRaise, to_drop: b.toDrop,
    scratch_games: b.scratchGames, scratch_total: b.scratchTotal, hdcp_total: b.hdcpTotal, match_points_ytd: points.get(b.name) ?? null, warning: b.warning ?? null,
  })), "week_id,bowler_id");

  const ourNumber = week.rosters.find(r => r.bowlers.some(b => /^DOUG KVAMME$/i.test(b.name)))?.number;
  let reconciled = 0;
  if (ourNumber) {
    const nights: { id: string; state: unknown; revision: number }[] = await database(`scorebooks?select=id,state,revision&state->match->>season=eq.${encodeURIComponent(week.season)}&state->match->>week=eq.${week.week}`);
    const reconciliationRows = nights.map(n => {
      const parsed = nightSchema.safeParse(n.state); if (!parsed.success) return [];
      const synced = syncMatchHandicaps(parsed.data, week, ourNumber);
      const effectiveState = synced ?? parsed.data;
      const result = reconcileNight(n.id, effectiveState, week, ourNumber); if (!result) return [];
      if (synced) return [{ result, update: database(`scorebooks?id=eq.${n.id}&revision=eq.${n.revision}`, { method: "PATCH", body: JSON.stringify({ state: synced, revision: n.revision + 1, updated_at: new Date().toISOString() }) }) }];
      return [{ result, update: Promise.resolve() }];
    });
    await Promise.all(reconciliationRows.flat().map(x => x.update));
    const results = reconciliationRows.flatMap(rows => rows.map(x => x.result));
    reconciled = results.length;
    if (results.length) await database(`league_team_weeks?week_id=eq.${row.id}&team_id=eq.${teamId(ourNumber)}`, { method: "PATCH", body: JSON.stringify({ discrepancies: results }) });
  }

  let recapWritten = false;
  if (options.writeRecap !== false && process.env.BAFL_RECAP_ORIGIN !== "off") {
    const origin = process.env.BAFL_RECAP_ORIGIN ?? "https://strike-ceiling-web.vercel.app";
    try {
      const response = await fetch(`${origin}/api/league/recap`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ season: week.season, week: week.week }), signal: AbortSignal.timeout(50_000) });
      recapWritten = response.ok;
    } catch { /* The standings are already saved if recap generation is unavailable. */ }
  }
  const ours = week.teams.find(t => t.number === ourNumber);
  return { season: week.season, week: week.week, weeksTotal: week.weeksTotal, teams: week.teams.length, bowlers: rosterRows.length, warnings: week.warnings, ours: ours ? { place: ours.place, pointsWon: ours.pointsWon, pointsLost: ours.pointsLost } : null, reconciled, recapWritten };
}

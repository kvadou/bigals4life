import { generateText } from "ai";
import { database } from "@/lib/scorebook-server";
import { displayName } from "./bls-parse";

type Row = Record<string, any>;
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");

/** Everything the writer needs about one week, as plain text facts. Numbers only; no invention possible. */
export async function weekFacts(seasonName: string, weekNumber: number) {
  const [season]: Row[] = await database(`league_seasons?select=*&name=eq.${encodeURIComponent(seasonName)}`);
  if (!season) return null;
  const [week]: Row[] = await database(`league_weeks?select=*&season_id=eq.${season.id}&week=eq.${weekNumber}`);
  if (!week) return null;
  const [teams, teamWeeks, bowlers, bowlerWeeks]: Row[][] = await Promise.all([
    database(`league_teams?select=id,number,name&season_id=eq.${season.id}`),
    database(`league_team_weeks?select=*&week_id=eq.${week.id}&order=place.asc`),
    database(`league_bowlers?select=id,name,team_id&season_id=eq.${season.id}`),
    database(`league_bowler_weeks?select=*&week_id=eq.${week.id}`),
  ]);
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? "";
  const me = bowlers.find(b => /^DOUG KVAMME$/i.test(b.name));
  const ourTeam = bowlerWeeks.find(bw => bw.bowler_id === me?.id)?.team_id ?? me?.team_id;
  const ours = teamWeeks.find(tw => tw.team_id === ourTeam);
  const lines: string[] = [];
  lines.push(`League: ${season.name} at ${season.house}. Week ${week.week} of ${season.weeks_total}, bowled ${week.bowled_on}. 36 match points per week.`);
  lines.push("Standings after this week (place, team, points won-lost, last week's result):");
  for (const tw of teamWeeks) lines.push(`  ${tw.place}. ${teamName(tw.team_id)} ${fmt(Number(tw.points_won))}-${fmt(Number(tw.points_lost))}${tw.opponent_team_id ? `, took ${fmt(Number(tw.week_points_won))} of 36 vs ${teamName(tw.opponent_team_id)} (hdcp games ${(tw.hdcp_games ?? []).join(", ")})` : ""}`);
  if (ours) lines.push(`Our team is ${teamName(ours.team_id)}.`);
  lines.push("Bowlers this week (team, name, average, handicap, scratch games, series, season match points):");
  for (const bw of bowlerWeeks.filter(bw => bw.scratch_games)) { const b = bowlers.find(x => x.id === bw.bowler_id); lines.push(`  ${teamName(bw.team_id)} | ${displayName(b?.name ?? "")} | avg ${bw.average} | hdcp ${bw.handicap} | ${bw.scratch_games.join(", ")} = ${bw.scratch_total}${bw.match_points_ytd != null ? ` | ${fmt(Number(bw.match_points_ytd))} match pts` : ""}`); }
  const absent = bowlerWeeks.filter(bw => !bw.scratch_games && bw.team_id === ourTeam).map(bw => displayName(bowlers.find(x => x.id === bw.bowler_id)?.name ?? ""));
  if (absent.length) lines.push(`Our bowlers who did not bowl: ${absent.join(", ")}.`);
  for (const bw of bowlerWeeks.filter(bw => bw.team_id === ourTeam && bw.scratch_games)) { const b = bowlers.find(x => x.id === bw.bowler_id); const over = bw.scratch_games.map((g: number) => g - bw.average); lines.push(`  ${displayName(b?.name ?? "")}: games vs average ${over.map((v: number) => (v >= 0 ? "+" : "") + v).join(", ")}; needs a ${bw.to_raise} series to raise average, drops below ${bw.to_drop}.`); }
  return { season, week, text: lines.join("\n"), ourTeamName: ours ? teamName(ours.team_id) : "" };
}

export async function writeRecap(seasonName: string, weekNumber: number, force = false): Promise<{ recap: string; cached: boolean } | null> {
  const facts = await weekFacts(seasonName, weekNumber);
  if (!facts) return null;
  if (facts.week.recap && !force) return { recap: facts.week.recap, cached: true };
  const { text } = await generateText({
    model: "google/gemini-2.5-flash",
    maxOutputTokens: 4000,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(45_000),
    system: `You write a short, funny, warm weekly recap for a four-man bowling team (${facts.ourTeamName || "our team"}) in a Thursday night league. Audience: the four teammates, later the whole league. Plain text only, no markdown, no headers, no bullet symbols. 120 to 180 words. Use only the numbers given; never invent scores, names, or events. Lead with our result and where we sit. Call out one or two standout games (ours or anyone's) with the actual numbers. One light joke at most, never mean. End with one concrete thing to aim for next week that comes from the numbers (a series needed to raise an average, points needed to move up a place). Sign off as "BA4L Recap".`,
    prompt: facts.text,
  });
  const recap = text.trim();
  try { await database(`league_weeks?id=eq.${facts.week.id}`, { method: "PATCH", body: JSON.stringify({ recap, recap_at: new Date().toISOString() }) }); } catch { /* recap column may not exist yet; still return the text */ }
  return { recap, cached: false };
}

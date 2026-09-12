import type { Night } from "@/lib/scorebook";
import { BOWLERS, summarizeGames } from "@/lib/season";
import { gameStats, statLine, type GameStats } from "./stats";
import type { Profile, Review } from "./schema";

export type GameFacts = { game: number; complete: boolean; stats: GameStats };

/** Per-game numbers for one bowler, from the rolls already in the scorebook. */
export function bowlerGames(night: Night, bowler: number): GameFacts[] {
  const all = [...night.history.map(h => ({ game: h.game, rolls: h.rolls, finals: h.finals })), { game: night.game, rolls: night.rolls, finals: night.finals }];
  const summary = summarizeGames(night);
  return all.map((e, i) => {
    const stats = gameStats(e.rolls[bowler]);
    const final = e.finals?.[bowler];
    if (final != null) stats.score = final;
    return { game: e.game, complete: summary[i].complete[bowler], stats };
  }).filter(g => g.stats.framesPlayed > 0 || g.complete);
}

/** Plain-text facts for the coach. Numbers, tags and the bowler's own words only; nothing the model could mistake for permission to invent. */
export function factsText(night: Night, bowler: number, review: Review, profile: Profile, average: number | null): string {
  const games = bowlerGames(night, bowler);
  const lines: string[] = [];
  const week = night.prebowl?.week ?? night.match?.week;
  lines.push(`Bowler: ${BOWLERS[bowler]}${profile.hand === "left" ? " (left-handed)" : ""}. ${week ? `Week ${week}. ` : ""}${night.prebowl ? "Pre-bowl, bowled alone ahead of league night. " : ""}${average ? `Season average ${average}.` : "No season average yet."}`);
  const done = games.filter(g => g.complete);
  if (done.length) lines.push(`Series: ${done.reduce((s, g) => s + g.stats.score, 0)} over ${done.length} game${done.length === 1 ? "" : "s"}.`);
  games.forEach((g, i) => {
    const r = review.games[i];
    const bits = [`Game ${g.game}: ${g.stats.score}${g.complete ? "" : " (unfinished)"}, ${g.stats.framesPlayed ? `${statLine(g.stats)}, first ball avg ${g.stats.firstBallAvg}${g.stats.tenth ? `, tenth ${g.stats.tenth}` : ""}` : "score only, no frame detail"}`];
    if (r?.ball) bits.push(`ball ${r.ball}`);
    if (r?.tags.length) bits.push(`noticed: ${r.tags.join(", ")}`);
    if (r?.note) bits.push(`bowler said: "${r.note.replace(/"/g, "'")}"`);
    lines.push(bits.join("; ") + ".");
  });
  const c = review.context;
  const ctx = [c.lanes ? `lanes ${c.lanes}` : null, c.onPair ? `${c.onPair} bowlers on the pair` : null, c.lefties ? "lefties on the pair" : null, c.highRev ? "high-rev bowlers on the pair" : null, c.oil ? `oil: ${c.oil}` : null].filter(Boolean);
  if (ctx.length) lines.push(`Lane context: ${ctx.join(", ")}.`);
  if (night.match) lines.push(`Opponent: ${night.match.opponent.name}.`);
  return lines.join("\n");
}

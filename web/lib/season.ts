import { analyze } from "./bowling";
import type { Night } from "./scorebook";

export const BOWLERS = ["Doug", "Mustafa", "Kyle", "Pete"];

export type GameSummary = { game: number; scores: (number | null)[]; complete: boolean[]; team: number | null; hasRolls: boolean };
export type Split = [number, number];
export type PointsSummary = { /** From Gary's sheet rather than our live scoring. */ official: boolean; ours: number; theirs: number; remaining: number; team: Split; individual: Split; games: { game: number; split: Split; ours: number | null; theirs: number | null }[]; series: { split: Split; ours: number | null; theirs: number | null }; bowlers: { name: string; opponent: string; games: Split[]; series: Split; total: Split }[] };
export type WeekSummary = {
  id: string; bowledOn: string; week: number | null; opponent: string | null; opponentGames: (number | null)[][];
  ourHandicaps: number[] | null;
  /** Who bowled this night. Fewer than four means a pre-bowl, and the team lines stay empty on purpose. */
  prebowl: { week: number; bowlers: number[] } | null;
  games: GameSummary[]; series: (number | null)[]; gamesBowled: number[]; teamSeries: number | null; finishedGames: number; recordedGames: number;
  points: PointsSummary | null;
};

export function summarizeGames(night: Night): GameSummary[] {
  const all = [...night.history.map(h => ({ game: h.game, rolls: h.rolls, finals: h.finals })), { game: night.game, rolls: night.rolls, finals: night.finals }];
  return all.map(e => {
    const complete = BOWLERS.map((_, i) => e.finals?.[i] != null || analyze(e.rolls[i]).complete);
    const scores = BOWLERS.map((_, i) => { const f = e.finals?.[i]; if (f != null) return f; const s = analyze(e.rolls[i]); return s.complete ? s.score : (e.rolls[i].length ? s.score : null); });
    const finished = complete.every(Boolean);
    return { game: e.game, scores, complete, team: finished ? scores.reduce<number>((s, v) => s + (v ?? 0), 0) : null, hasRolls: e.rolls.some(r => r.length > 0) };
  });
}

/** Calendar date of the night in league-local time, not UTC. */
export const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** One night's headline numbers. A bowler's series counts the games that bowler finished, so a pre-bowl alone still reads. Team lines still wait for all four. */
export function summarizeWeek(id: string, night: Night, updatedAt: string, week: number | null): WeekSummary {
  const games = summarizeGames(night);
  const finished = games.filter(g => g.team != null);
  const mine = BOWLERS.map((_, i) => games.filter(g => g.complete[i] && g.scores[i] != null));
  const series = mine.map((gs, i) => gs.length ? gs.reduce((s, g) => s + (g.scores[i] ?? 0), 0) : null);
  return {
    id, bowledOn: localDate(updatedAt), week: night.prebowl?.week ?? night.match?.week ?? week, opponent: night.match?.opponent.name ?? null, opponentGames: night.match?.opponentGames ?? [],
    ourHandicaps: night.match ? night.match.ours.map(b => b.handicap) : null,
    prebowl: night.prebowl ?? null,
    games, series, gamesBowled: mine.map(gs => gs.length),
    teamSeries: finished.length ? finished.reduce((s, g) => s + (g.team ?? 0), 0) : null,
    finishedGames: finished.length, recordedGames: games.filter(g => g.complete.some(Boolean)).length, points: null,
  };
}

import { nightMatchPoints } from "./league/night-points";
import { officialMatchPoints, type OfficialWeek } from "./league/official";
/** Match points for a night, shaped for pages. Gary's sheet wins once it exists; before that, the live scoring. Null when no match is set up. */
export function pointsSummary(night: Night, sheet?: OfficialWeek | null): PointsSummary | null {
  const p = sheet ? officialMatchPoints(night, sheet) : nightMatchPoints(night); if (!p) return null;
  return { official: !!sheet, ours: p.total[0], theirs: p.total[1], remaining: p.remaining, team: p.team, individual: p.individual,
    games: p.games.map(g => ({ game: g.game, split: g.split, ours: g.ours, theirs: g.theirs })), series: { split: p.series.split, ours: p.series.ours, theirs: p.series.theirs },
    bowlers: p.bowlers.map(b => ({ name: b.name, opponent: b.opponent, games: b.games, series: b.series, total: b.total })) };
}

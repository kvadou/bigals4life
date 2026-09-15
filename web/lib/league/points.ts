// Thursday Men's Early match points: 36 per week.
// Team: 5 per game x3 + 5 for series = 20. Individual: 1 per game x4 bowlers x3 + 1 per bowler series = 16. Ties split.
export const TEAM_GAME = 5, TEAM_SERIES = 5, BOWLER_GAME = 1, BOWLER_SERIES = 1, WEEK_TOTAL = 36;
export const HANDICAP_BASE = 210, HANDICAP_PERCENT = 0.9;

export const handicapFor = (average: number) => Math.max(0, Math.floor(HANDICAP_PERCENT * (HANDICAP_BASE - average)));

export type LineupBowler = { name: string; handicap: number; games: (number | null)[] };
export type TeamNight = { name: string; bowlers: LineupBowler[] };
type Split = [number, number];
export const contest = (a: number | null, b: number | null, value: number): Split => a == null || b == null ? [0, 0] : a > b ? [value, 0] : a < b ? [0, value] : [value / 2, value / 2];
const add = (x: Split, y: Split): Split => [x[0] + y[0], x[1] + y[1]];
const sum = (v: (number | null)[]) => v.reduce<number>((s, x) => s + (x ?? 0), 0);
const played = (v: (number | null)[]) => v.every(x => x != null);

export type MatchPoints = {
  team: Split; individual: Split; total: Split;
  games: { game: number; ours: number | null; theirs: number | null; split: Split }[];
  series: { ours: number | null; theirs: number | null; split: Split };
  bowlers: { name: string; opponent: string; games: Split[]; series: Split; total: Split }[];
  remaining: number;
};

/** Bowlers are paired by lineup order (index 0 vs index 0). Handicap is added to every game. */
export function matchPoints(ours: TeamNight, theirs: TeamNight, gamesPerNight = 3): MatchPoints {
  const hdcp = (t: TeamNight, g: number) => t.bowlers.every(b => b.games[g] != null) ? t.bowlers.reduce((s, b) => s + (b.games[g] ?? 0) + b.handicap, 0) : null;
  const games = Array.from({ length: gamesPerNight }, (_, g) => { const o = hdcp(ours, g), t = hdcp(theirs, g); return { game: g + 1, ours: o, theirs: t, split: contest(o, t, TEAM_GAME) }; });
  const complete = (t: TeamNight) => t.bowlers.every(b => played(b.games.slice(0, gamesPerNight)) && b.games.length >= gamesPerNight);
  const seriesOurs = complete(ours) ? sum(games.map(g => g.ours)) : null, seriesTheirs = complete(theirs) ? sum(games.map(g => g.theirs)) : null;
  const series = { ours: seriesOurs, theirs: seriesTheirs, split: contest(seriesOurs, seriesTheirs, TEAM_SERIES) };
  const bowlers = ours.bowlers.map((b, i) => {
    const o = theirs.bowlers[i];
    const gs = Array.from({ length: gamesPerNight }, (_, g) => contest(b.games[g] == null ? null : b.games[g]! + b.handicap, o?.games[g] == null ? null : o.games[g]! + o.handicap, BOWLER_GAME));
    const bs = played(b.games.slice(0, gamesPerNight)) && b.games.length >= gamesPerNight && o && played(o.games.slice(0, gamesPerNight)) && o.games.length >= gamesPerNight
      ? contest(sum(b.games) + b.handicap * gamesPerNight, sum(o.games) + o.handicap * gamesPerNight, BOWLER_SERIES) : [0, 0] as Split;
    return { name: b.name, opponent: o?.name ?? "", games: gs, series: bs, total: gs.reduce(add, bs) };
  });
  const team = games.reduce((s, g) => add(s, g.split), series.split);
  const individual = bowlers.reduce((s, b) => add(s, b.total), [0, 0] as Split);
  const total = add(team, individual);
  return { team, individual, total, games, series, bowlers, remaining: WEEK_TOTAL - total[0] - total[1] };
}

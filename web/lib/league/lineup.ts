import { BOWLER_GAME, BOWLER_SERIES } from "./points";

/**
 * Lineup strategy. Head-to-head points pair slot k of our lineup with slot k of theirs (points.ts),
 * so the order we hand in decides who bowls whom. The odd lane enters names first, the even lane
 * second: on the even lane we see their four before we commit ours, and that is the whole edge.
 */
export type LineupBowler = {
  name: string; average: number; handicap: number;
  /** A pre-bowled bowler's games are already known: no variance, and the games matter per slot. */
  known?: number[];
};
export type Pairing = { ours: LineupBowler; theirs: LineupBowler; expected: number; edge: number; pGame: number };
export type Lineup = { order: LineupBowler[]; expected: number; pairings: Pairing[]; max: number };

/** Night-to-night spread of one bowler's game around their average. League bowlers are ~25 to 30 pins. */
export const GAME_SD = 28;
const GAMES = 3;
const cdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x: number) { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a); return s * y; }

/** Chance our bowler beats theirs in one game with handicap. A known (pre-bowled) score has no spread. */
export function winProbability(ours: LineupBowler, theirs: LineupBowler, game?: number): number {
  const mine = ours.known?.[game ?? 0] != null && game != null ? ours.known[game] : ours.average;
  const diff = (mine + ours.handicap) - (theirs.average + theirs.handicap);
  const sd = Math.sqrt((ours.known && game != null ? 0 : GAME_SD ** 2) + GAME_SD ** 2);
  return cdf(diff / sd);
}

/** Expected head-to-head points from one pairing: 1 per game and 1 for series. */
export function pairingValue(ours: LineupBowler, theirs: LineupBowler): Pairing {
  const games = Array.from({ length: GAMES }, (_, g) => winProbability(ours, theirs, g));
  const pGame = games.reduce((a, b) => a + b, 0) / GAMES;
  const seriesDiff = (ours.known ? ours.known.reduce((a, b) => a + b, 0) / GAMES : ours.average) + ours.handicap - (theirs.average + theirs.handicap);
  const seriesSd = Math.sqrt(((ours.known ? 0 : GAME_SD ** 2) + GAME_SD ** 2) / GAMES);
  const pSeries = cdf(seriesDiff / seriesSd);
  const expected = games.reduce((a, p) => a + p * BOWLER_GAME, 0) + pSeries * BOWLER_SERIES;
  return { ours, theirs, expected: round(expected), edge: round((ours.average + ours.handicap) - (theirs.average + theirs.handicap)), pGame: round(pGame) };
}

const permutations = <T,>(xs: T[]): T[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));

/** Best order for our four against their four in lane order. 24 permutations; no need to be clever. */
export function bestLineup(ours: LineupBowler[], theirs: LineupBowler[]): Lineup {
  const options = permutations(ours).map(order => evaluate(order, theirs));
  options.sort((a, b) => b.expected - a.expected);
  return options[0];
}

export function evaluate(order: LineupBowler[], theirs: LineupBowler[]): Lineup {
  const pairings = order.map((b, k) => pairingValue(b, theirs[k]));
  const expected = round(pairings.reduce((s, p) => s + p.expected, 0));
  return { order, expected, pairings, max: order.length * (GAMES * BOWLER_GAME + BOWLER_SERIES) };
}

/**
 * When we hand names in first, every order has the same expected points against an unknown order,
 * so there is no edge to find. Handicap flattens averages, so the honest advice is about steadiness:
 * the higher raw averages swing less night to night, and they belong at lead and anchor.
 */
export function firstMoverNote(ours: LineupBowler[]): string {
  const steady = [...ours].sort((a, b) => b.average - a.average);
  return `We hand names in first, so no order beats another on paper: the other team stacks against whatever we write. Lead with ${steady[0].name} and anchor with ${steady[1].name}; let the two in the middle take the matchups they draw.`;
}

const round = (n: number) => Math.round(n * 100) / 100;

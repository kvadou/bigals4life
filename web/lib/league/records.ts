import { handicapFor } from "./points";

/**
 * The record book. Gary's software prints a standings sheet every week but never a career page,
 * so highs, trends and coverage are computed here from the weeks we have ingested.
 *
 * Only a week with three scratch games counts toward a record. An absent bowler still gets a
 * scratch_total on the sheet (their absent score), and a two-game night gets one too; neither is
 * a real game, and both arrive with scratch_games null.
 */

export type BowlerWeek = {
  seasonName: string;
  week: number;
  bowledOn: string;
  teamName: string;
  opponent: string | null;
  average: number | null;
  handicap: number | null;
  pins: number | null;
  games: number | null;
  toRaise: number | null;
  toDrop: number | null;
  scratchGames: number[] | null;
  scratchTotal: number | null;
  matchPointsYtd: number | null;
};

export type Mark = { value: number; seasonName: string; week: number; bowledOn: string };
export type BowlerRecord = {
  blsId: number;
  name: string;
  teamName: string;
  seasons: string[];
  highGame: Mark | null;
  highSeries: Mark | null;
  average: number | null;
  handicap: number | null;
  gamesBowled: number;
  pins: number;
  nightsCounted: number;
  matchPoints: number | null;
  trend: { seasonName: string; week: number; average: number }[];
  nights: (BowlerWeek & { series: number })[];
};

const counts = (w: BowlerWeek) => Array.isArray(w.scratchGames) && w.scratchGames.length === 3;
/** A bowler who joins mid-season is listed at average 0 until his first night; that is not an average. */
const hasAverage = (w: BowlerWeek) => w.average != null && w.average > 0;
const seriesOf = (w: BowlerWeek) => w.scratchGames!.reduce((sum, game) => sum + game, 0);
const byWeek = (a: { seasonName: string; week: number }, b: { seasonName: string; week: number }) =>
  a.seasonName === b.seasonName ? a.week - b.week : a.seasonName.localeCompare(b.seasonName);

/** Highest value wins; the earliest night keeps the record when two nights tie. */
function best(nights: BowlerWeek[], value: (w: BowlerWeek) => number): Mark | null {
  let mark: Mark | null = null;
  for (const night of [...nights].sort(byWeek)) {
    const v = value(night);
    if (!mark || v > mark.value) mark = { value: v, seasonName: night.seasonName, week: night.week, bowledOn: night.bowledOn };
  }
  return mark;
}

export function bowlerRecord(blsId: number, name: string, weeks: BowlerWeek[]): BowlerRecord {
  const ordered = [...weeks].sort(byWeek);
  const scored = ordered.filter(counts);
  const latest = [...ordered].reverse();
  const withAverage = latest.find(hasAverage);
  // Games and pins are cumulative within a season and reset at the next one, so a career total is the sum of each season's last figure.
  const seasonTotals = [...new Set(ordered.map(w => w.seasonName))]
    .map(name => latest.find(w => w.seasonName === name && w.games != null && w.pins != null));
  return {
    blsId,
    name,
    teamName: latest.find(w => w.teamName)?.teamName ?? "",
    seasons: [...new Set(ordered.map(w => w.seasonName))],
    highGame: best(scored, w => Math.max(...w.scratchGames!)),
    highSeries: best(scored, seriesOf),
    average: withAverage?.average ?? null,
    handicap: withAverage?.handicap ?? (withAverage ? handicapFor(withAverage.average!) : null),
    gamesBowled: seasonTotals.reduce((sum, w) => sum + (w?.games ?? 0), 0),
    pins: seasonTotals.reduce((sum, w) => sum + (w?.pins ?? 0), 0),
    nightsCounted: scored.length,
    matchPoints: latest.find(w => w.matchPointsYtd != null)?.matchPointsYtd ?? null,
    trend: ordered.filter(hasAverage).map(w => ({ seasonName: w.seasonName, week: w.week, average: w.average! })),
    nights: scored.map(w => ({ ...w, series: seriesOf(w) })).reverse(),
  };
}

/** Ties share a place and the next bowler takes the place the count implies (1, 1, 3), the way a results sheet reads. */
export function topBy(records: BowlerRecord[], mark: (r: BowlerRecord) => Mark | null, limit = 10) {
  const held = records.filter(r => mark(r)).sort((a, b) => mark(b)!.value - mark(a)!.value || a.name.localeCompare(b.name));
  const out: { place: number; record: BowlerRecord; mark: Mark }[] = [];
  for (const record of held) {
    const value = mark(record)!.value;
    const place = out.find(o => o.mark.value === value)?.place ?? out.length + 1;
    if (out.length >= limit && place > limit) break;
    out.push({ place, record, mark: mark(record)! });
  }
  return out;
}

/** Weeks the sheet should have versus weeks we parsed, so the page can admit what it is missing. */
export function coverage(seasons: { name: string; weeksTotal: number; weeks: number[] }[]) {
  return seasons.map(s => {
    const have = new Set(s.weeks);
    const missing = Array.from({ length: s.weeksTotal }, (_, i) => i + 1).filter(w => !have.has(w));
    // Weeks past the last one bowled have not happened yet; they are not gaps in the record.
    const bowled = Math.max(0, ...s.weeks);
    return { name: s.name, weeksTotal: s.weeksTotal, have: s.weeks.length, missing: missing.filter(w => w < bowled) };
  });
}

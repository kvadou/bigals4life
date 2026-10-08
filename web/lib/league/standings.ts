// Pure standings math shared by the standings API. Mirrored natively in ios/Sources/LeagueView.swift (NativeLeagueMath).
export const WEEK_POINTS = 36;

export type TeamLine = { place: number; pointsWon: number };

/** Points behind the team one place up in the published order. Null for the top team. */
export function gapToAbove(teams: TeamLine[], index: number): number | null {
  if (index <= 0 || index >= teams.length) return null;
  return round(teams[index - 1].pointsWon - teams[index].pointsWon);
}

/** previousPlace - place: positive climbed, negative fell, 0 held, null when there is no earlier week. */
export function movement(place: number | null | undefined, previousPlace: number | null | undefined): number | null {
  if (place == null || previousPlace == null) return null;
  return previousPlace - place;
}

export type WeekTotals = { week: number; won: number | null; cumulativeLost: number | null };

/** Weekly points lost from the sheet's cumulative totals; 36 minus won when the earlier week is missing. */
export function weeklyLost(rows: WeekTotals[]): Map<number, number | null> {
  const byWeek = new Map(rows.map(r => [r.week, r]));
  const out = new Map<number, number | null>();
  for (const row of rows) {
    const earlier = byWeek.get(row.week - 1);
    if (row.cumulativeLost != null && (row.week === 1 || earlier?.cumulativeLost != null)) {
      out.set(row.week, round(row.cumulativeLost - (earlier?.cumulativeLost ?? 0)));
    } else if (row.won != null) {
      out.set(row.week, round(WEEK_POINTS - row.won));
    } else out.set(row.week, null);
  }
  return out;
}

const round = (n: number) => Math.round(n * 2) / 2;

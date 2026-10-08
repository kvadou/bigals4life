import { describe, expect, test } from "bun:test";
import { gapToAbove, movement, weeklyLost } from "@/lib/league/standings";

const week4 = [
  { place: 1, pointsWon: 99 }, { place: 2, pointsWon: 90 }, { place: 3, pointsWon: 81 }, { place: 4, pointsWon: 71.5 },
  { place: 5, pointsWon: 70.5 }, { place: 6, pointsWon: 67 }, { place: 7, pointsWon: 57 }, { place: 8, pointsWon: 40 },
];

describe("standings math", () => {
  test("gap to the team above, none for first place", () => {
    expect(gapToAbove(week4, 0)).toBeNull();
    expect(gapToAbove(week4, 1)).toBe(9);
    expect(gapToAbove(week4, 4)).toBe(1);
    expect(gapToAbove(week4, 5)).toBe(3.5);
    expect(gapToAbove(week4, 8)).toBeNull();
  });

  test("movement is places climbed", () => {
    expect(movement(6, 7)).toBe(1);
    expect(movement(3, 1)).toBe(-2);
    expect(movement(4, 4)).toBe(0);
    expect(movement(4, null)).toBeNull();
    expect(movement(null, 2)).toBeNull();
  });

  test("weekly lost comes from cumulative totals, else 36 minus won", () => {
    const lost = weeklyLost([
      { week: 1, won: 30, cumulativeLost: 6 },
      { week: 2, won: 7, cumulativeLost: 35 },
      { week: 4, won: 24, cumulativeLost: 77 }, // week 3 sheet missing
      { week: 5, won: null, cumulativeLost: null },
    ]);
    expect(lost.get(1)).toBe(6);
    expect(lost.get(2)).toBe(29);
    expect(lost.get(4)).toBe(12);
    expect(lost.get(5)).toBeNull();
  });
});

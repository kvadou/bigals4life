import { test, expect } from "bun:test";
import { nightSchema } from "../lib/scorebook";
import { summarizeWeek } from "../lib/season";

const strikes = Array(12).fill(10);
const solo = () => nightSchema.parse({ game: 2, rolls: [[], [], [], strikes], history: [{ game: 1, rolls: [[], [], [], strikes] }], prebowl: { week: 2, bowlers: [3] } });

test("a lone pre-bowl still has a series, a week, and shows up", () => {
  const w = summarizeWeek("x", solo(), "2026-09-12T18:00:00Z", null);
  expect(w.week).toBe(2);
  expect(w.prebowl).toEqual({ week: 2, bowlers: [3] });
  expect(w.series).toEqual([null, null, null, 600]);
  expect(w.gamesBowled).toEqual([0, 0, 0, 2]);
  expect(w.recordedGames).toBe(2);
  expect(w.finishedGames).toBe(0);
  expect(w.teamSeries).toBeNull();
});

test("each bowler's series sums their own column", () => {
  const n = nightSchema.parse({ game: 1, rolls: [strikes, Array(20).fill(9).map((v, i) => i % 2 ? 0 : 9), [], []], history: [] });
  const w = summarizeWeek("x", n, "2026-09-12T18:00:00Z", null);
  expect(w.series).toEqual([300, 90, null, null]);
});

test("prebowl schema rejects nobody and out-of-range bowlers", () => {
  expect(nightSchema.safeParse({ game: 1, rolls: [[], [], [], []], history: [], prebowl: { week: 2, bowlers: [] } }).success).toBe(false);
  expect(nightSchema.safeParse({ game: 1, rolls: [[], [], [], []], history: [], prebowl: { week: 2, bowlers: [4] } }).success).toBe(false);
});

import { describe, expect, test } from "bun:test";
import { isWeekFinished } from "../app/components/match-hero";
import { summarizeWeek, type PointsSummary } from "../lib/season";
import type { Night } from "../lib/scorebook";

const empty = (): Night => ({ rolls: [[], [], [], []], game: 1, history: [] });
const summary = (night: Night) => summarizeWeek("test", night, "2026-09-12T12:00:00Z", 1);

describe("team night action state", () => {
  test("fresh and partly completed games keep scoring available", () => {
    expect(isWeekFinished(summary(empty()))).toBe(false);
    expect(isWeekFinished(summary({ ...empty(), finals: [120, null, null, null] }))).toBe(false);
  });
  test("completed scorecards lead to review", () => {
    expect(isWeekFinished(summary({ ...empty(), finals: [120, 130, 140, 150] }))).toBe(true);
  });
  test("prebowl completion depends on the selected bowlers", () => {
    const night = { ...empty(), prebowl: { week: 1, bowlers: [2, 3] }, finals: [null, null, 140, null] };
    expect(isWeekFinished(summary(night))).toBe(false);
    expect(isWeekFinished(summary({ ...night, finals: [null, null, 140, 150] }))).toBe(true);
  });
  test("unsettled match points keep a match live", () => {
    const week = summary({ ...empty(), finals: [120, 130, 140, 150] });
    week.points = { remaining: 10 } as PointsSummary;
    expect(isWeekFinished(week)).toBe(false);
    week.points.remaining = 0;
    expect(isWeekFinished(week)).toBe(true);
  });
});

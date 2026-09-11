import { describe, expect, test } from "bun:test";
import { bowlerRecord, topBy, coverage, type BowlerWeek } from "@/lib/league/records";

const night = (over: Partial<BowlerWeek> & { week: number }): BowlerWeek => ({
  seasonName: "Thursday Men's Early 2025-26", bowledOn: "2026-01-08", teamName: "BIG AL'S 4 LIFE", opponent: "HERE 4 BEER",
  average: 150, handicap: 54, pins: 1500, games: 10, toRaise: 400, toDrop: 350,
  scratchGames: [150, 150, 150], scratchTotal: 450, matchPointsYtd: 20, ...over });

describe("record book", () => {
  test("high game and high series come from the counted nights", () => {
    const r = bowlerRecord(41, "Pete Anderson", [
      night({ week: 24, scratchGames: [180, 190, 170], scratchTotal: 540 }),
      night({ week: 26, scratchGames: [253, 112, 143], scratchTotal: 508 }),
      night({ week: 25, scratchGames: [200, 210, 220], scratchTotal: 630 }),
    ]);
    expect(r.highGame).toMatchObject({ value: 253, week: 26 });
    expect(r.highSeries).toMatchObject({ value: 630, week: 25 });
    expect(r.nightsCounted).toBe(3);
  });

  test("an absent night carries a total but is not a game, a series, or a counted night", () => {
    const r = bowlerRecord(41, "Pete", [
      night({ week: 4, scratchGames: [120, 120, 120], scratchTotal: 360 }),
      night({ week: 5, scratchGames: null, scratchTotal: 408 }), // absent score off the sheet
      night({ week: 6, scratchGames: null, scratchTotal: null }), // did not bowl
    ]);
    expect(r.highSeries!.value).toBe(360);
    expect(r.highGame!.value).toBe(120);
    expect(r.nightsCounted).toBe(1);
    expect(r.nights).toHaveLength(1);
  });

  test("a two-game night is not a series", () => {
    const r = bowlerRecord(1, "Doug", [night({ week: 9, scratchGames: null, scratchTotal: 300 })]);
    expect(r.highSeries).toBeNull();
    expect(r.highGame).toBeNull();
  });

  test("the earliest night keeps a tied record", () => {
    const r = bowlerRecord(1, "Doug", [
      night({ week: 12, scratchGames: [230, 100, 100], scratchTotal: 430 }),
      night({ week: 3, scratchGames: [230, 100, 100], scratchTotal: 430 }),
    ]);
    expect(r.highGame!.week).toBe(3);
  });

  test("averages, totals and match points come from the most recent week that has them", () => {
    const r = bowlerRecord(1, "Doug", [
      night({ week: 20, average: 145, handicap: 58, pins: 8700, games: 60, matchPointsYtd: 40 }),
      night({ week: 28, average: 152, handicap: 52, pins: 12768, games: 84, matchPointsYtd: 55.5 }),
      night({ week: 29, average: null, handicap: null, pins: null, games: null, matchPointsYtd: null, scratchGames: null, scratchTotal: null }),
    ]);
    expect(r.average).toBe(152); expect(r.handicap).toBe(52);
    expect(r.gamesBowled).toBe(84); expect(r.pins).toBe(12768); expect(r.matchPoints).toBe(55.5);
  });

  test("the handicap falls back to the league formula when the sheet omits it", () => {
    const r = bowlerRecord(1, "Doug", [night({ week: 5, average: 143, handicap: null })]);
    expect(r.handicap).toBe(60);
  });

  test("the trend runs oldest to newest and nights run newest first", () => {
    const r = bowlerRecord(1, "Doug", [night({ week: 9, average: 141 }), night({ week: 3, average: 138 }), night({ week: 6, average: 140 })]);
    expect(r.trend.map(t => t.week)).toEqual([3, 6, 9]);
    expect(r.trend.map(t => t.average)).toEqual([138, 140, 141]);
    expect(r.nights.map(n => n.week)).toEqual([9, 6, 3]);
  });

  test("career rows from two seasons order by season then week", () => {
    const r = bowlerRecord(1, "Doug", [
      night({ week: 9, seasonName: "Thursday Men's Early 2025-26", average: 150 }),
      night({ week: 20, seasonName: "Thursday Men's Early 2024-25", average: 134 }),
    ]);
    expect(r.seasons).toEqual(["Thursday Men's Early 2024-25", "Thursday Men's Early 2025-26"]);
    expect(r.trend.map(t => t.average)).toEqual([134, 150]);
    expect(r.average).toBe(150); // the later season is the current one
  });

  test("a bowler listed at average 0 before his first night is not on the trend line", () => {
    const r = bowlerRecord(1, "Pete", [
      night({ week: 22, average: 0, handicap: 189, scratchGames: null, scratchTotal: null, pins: 0, games: 0 }),
      night({ week: 23, average: 170, handicap: 36, pins: 510, games: 3 }),
    ]);
    expect(r.trend.map(t => t.week)).toEqual([23]);
    expect(r.average).toBe(170);
  });

  test("a career total is each season's last figure added up, not the newest season's alone", () => {
    const r = bowlerRecord(1, "Pete", [
      night({ week: 30, seasonName: "Thursday Men's Early 2024-25", games: 24, pins: 3816 }),
      night({ week: 3, seasonName: "Thursday Men's Early 2025-26", games: 3, pins: 531 }),
      night({ week: 30, seasonName: "Thursday Men's Early 2025-26", games: 84, pins: 14868 }),
    ]);
    expect(r.gamesBowled).toBe(108);
    expect(r.pins).toBe(18684);
  });

  test("ties share a place and the next bowler drops past them", () => {
    const rec = (name: string, high: number) => bowlerRecord(name.length, name, [night({ week: 5, scratchGames: [high, 100, 100], scratchTotal: high + 200 })]);
    const ranked = topBy([rec("Ann", 230), rec("Bo", 230), rec("Cy", 200)], r => r.highGame);
    expect(ranked.map(r => [r.record.name, r.place])).toEqual([["Ann", 1], ["Bo", 1], ["Cy", 3]]);
  });

  test("a bowler with no counted night is left off the leaderboard", () => {
    const absent = bowlerRecord(7, "Ghost", [night({ week: 5, scratchGames: null, scratchTotal: null })]);
    expect(topBy([absent], r => r.highGame)).toEqual([]);
  });

  test("coverage names the missing weeks but not the ones not yet bowled", () => {
    const [season] = coverage([{ name: "2025-26", weeksTotal: 31, weeks: [3, 4, 5, 6] }]);
    expect(season.missing).toEqual([1, 2]); // weeks 7-31 have not happened
    expect(season.have).toBe(4);
  });
});

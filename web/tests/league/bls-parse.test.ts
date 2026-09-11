import { describe, expect, test } from "bun:test";
import { displayName, matchRosterName, parseStandings } from "@/lib/league/bls-parse";

const week = parseStandings(await Bun.file(new URL("./fixtures/week-26.txt", import.meta.url)).text());

describe("BLS standings parser", () => {
  test("header", () => {
    expect(week.week).toBe(26); expect(week.weeksTotal).toBe(31); expect(week.date).toBe("2026-03-19");
    expect(week.season).toBe("Thursday Men's Early 2025-26"); expect(week.house).toBe("Big Al's Bar and Bowling");
  });
  test("team standings", () => {
    expect(week.teams).toHaveLength(6);
    const us = week.teams.find(t => t.name === "BIG AL'S 4 LIFE")!;
    expect(us).toMatchObject({ place: 2, number: 5, percentWon: 54.9, pointsWon: 217.5, pointsLost: 178.5, ytdPercentWon: 48, ytdWon: 449.5, ytdLost: 486.5, gamesWon: 19, scratchPins: 46022, pinsPlusHdcp: 63068 });
    expect(week.teams[0].name).toBe("SPLIT HAPPENS");
    expect(week.teams.find(t => t.number === 3)!.name).toBe("SPLIT PERSONALITIE");
  });
  test("last week's results and opponents", () => {
    expect(week.results).toHaveLength(6);
    const us = week.results.find(r => r.number === 5)!;
    expect(us).toMatchObject({ lanes: "3-4", hdcpGames: [845, 677, 791], hdcpTotal: 2313, pointsWon: 16, opponentNumber: 1 });
    const them = week.results.find(r => r.number === 1)!;
    expect(them).toMatchObject({ name: "HERE 4 BEER", hdcpGames: [789, 826, 772], hdcpTotal: 2387, pointsWon: 20, opponentNumber: 5 });
    expect(week.results.find(r => r.number === 3)!).toMatchObject({ name: "SPLIT PERSONALITIE", opponentNumber: 6, pointsWon: 24 });
    expect(week.results.find(r => r.number === 4)!.pointsWon + week.results.find(r => r.number === 2)!.pointsWon).toBe(36);
  });
  test("rosters", () => {
    expect(week.rosters).toHaveLength(6);
    const us = week.rosters.find(r => r.number === 5)!;
    expect(us.lane).toBe(6);
    expect(us.bowlers.map(b => b.name)).toEqual(["KYLE A. DICKHAUS", "DOUG KVAMME", "MUSTAFA M. SAKHI", "PETE ANDERSON"]);
    expect(us.bowlers[1]).toMatchObject({ blsId: 19, hand: "R", average: 136, handicap: 66, pins: 10675, games: 78, toRaise: 422, toDrop: 340, scratchGames: [145, 99, 121], scratchTotal: 365, hdcpTotal: 560 });
    expect(us.bowlers[3]).toMatchObject({ average: 178, handicap: 28, scratchGames: [253, 112, 143], scratchTotal: 508, hdcpTotal: 592 });
  });
  test("misaligned roster row is recovered from the total", () => {
    const greg = week.rosters.find(r => r.number === 2)!.bowlers.find(b => b.name === "GREG P. DAHL")!;
    expect(greg.scratchGames).toEqual([91, 115, 114]); expect(greg.scratchTotal).toBe(320); expect(greg.hdcpTotal).toBe(578);
    const absent = week.rosters.find(r => r.number === 2)!.bowlers.find(b => b.name === "GRANGE K. FARR")!;
    expect(absent.scratchGames).toBeNull(); expect(absent.warning).toBeUndefined();
  });
  test("individual match points", () => {
    expect(week.matchPoints.find(m => m.name === "KYLE DICKHAUS")!.points).toBe(57);
    expect(week.matchPoints.find(m => m.name === "DOUG KVAMME")!.points).toBe(43.5);
    expect(week.matchPoints.find(m => m.name === "GREG DAHL")!.points).toBe(26.5);
    expect(week.matchPoints).toHaveLength(27);
    expect(week.warnings).toEqual([]);
  });
  test("name matching handles middle initials and truncation", () => {
    const names = week.rosters.flatMap(r => r.bowlers.map(b => b.name));
    expect(displayName("GARY D. DORUMSGAARD")).toBe("GARY DORUMSGAARD");
    expect(matchRosterName("GARY DORUMSGAA", names)).toBe("GARY D. DORUMSGAARD");
    expect(matchRosterName("COLTON HOMBERG", names)).toBe("COLTON M. HOMBERGER");
    expect(matchRosterName("DAN FARR", names)).toBe("DAN J. FARR");
    for (const m of week.matchPoints) expect(matchRosterName(m.name, names)).not.toBeNull();
  });
});

const old = parseStandings(await Bun.file(new URL("./fixtures/2024-25-sheet-16.txt", import.meta.url)).text());
describe("2024-25 sheet (8 teams, blank columns, absent scores)", () => {
  test("header with single-digit month", () => { expect(old.week).toBe(16); expect(old.date).toBe("2024-12-26"); expect(old.season).toBe("Thursday Men's Early 2024-25"); });
  test("rows with blank %won, unearned, or games-won columns", () => {
    expect(old.teams).toHaveLength(8);
    expect(old.teams[0]).toMatchObject({ name: "GUTTER WHORE'S", percentWon: 94.4, pointsWon: 34, pointsLost: 2, unearnedPoints: 2, ytdPercentWon: 53.2, ytdWon: 268, ytdLost: 236, gamesWon: 3, scratchPins: 20785, pinsPlusHdcp: 34639 });
    expect(old.teams[6]).toMatchObject({ name: "HOWLING HOOK-AH", percentWon: 22.2, pointsWon: 8, gamesWon: 0, scratchPins: 26088 });
    expect(old.teams[7]).toMatchObject({ name: "LIL' EXPLODERS", percentWon: 0, pointsWon: 0, pointsLost: 36, ytdPercentWon: 46.2, ytdWon: 199.5, ytdLost: 232.5, gamesWon: 0, scratchPins: 16881, pinsPlusHdcp: 26940 });
    expect(old.results).toHaveLength(8); expect(old.results.reduce((s, r) => s + r.pointsWon, 0)).toBe(142);
  });
  test("absent scores, blank hand, and book averages", () => {
    const us = old.rosters.find(r => r.name === "LIL' EXPLODERS")!;
    const doug = us.bowlers.find(b => b.name === "DOUG KVAMME")!;
    expect(doug).toMatchObject({ blsId: 19, average: 117, handicap: 83, absent: true, scratchGames: null, scratchTotal: 321, hdcpTotal: 570 });
    expect(us.bowlers.find(b => b.name === "KYLE A. DICKHAUS")).toMatchObject({ scratchGames: [113, 156, 138], scratchTotal: 407, hdcpTotal: 614 });
    expect(us.bowlers.find(b => b.name === "MITCH D. LABORDE")!.hand).toBe("R");
    expect(old.warnings).toEqual([]);
  });
});

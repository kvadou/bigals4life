import { describe, expect, test } from "bun:test";
import { handicapFor, matchPoints, type TeamNight } from "@/lib/league/points";

// Week 26 of 2025-26: Big Al's 4 Life (16) vs Here 4 Beer (20), from Gary's sheet. Handicaps are the ones applied that night (hdcp total minus scratch, over 3).
const bigAls: TeamNight = { name: "BIG AL'S 4 LIFE", bowlers: [
  { name: "Kyle", handicap: 60, games: [127, 125, 195] }, { name: "Doug", handicap: 65, games: [145, 99, 121] },
  { name: "Mustafa", handicap: 71, games: [96, 117, 108] }, { name: "Pete", handicap: 28, games: [253, 112, 143] } ] };
const here4beer: TeamNight = { name: "HERE 4 BEER", bowlers: [
  { name: "Brett", handicap: 54, games: [163, 152, 132] }, { name: "Noah", handicap: 60, games: [145, 151, 97] },
  { name: "Tyler", handicap: 43, games: [148, 158, 192] }, { name: "Ryan", handicap: 18, games: [158, 190, 176] } ] };

describe("match points", () => {
  test("handicap is 90% of 210 minus average, fraction dropped", () => {
    expect(handicapFor(136)).toBe(66); expect(handicapFor(143)).toBe(60); expect(handicapFor(178)).toBe(28); expect(handicapFor(198)).toBe(10); expect(handicapFor(230)).toBe(0);
  });
  test("reproduces Week 26: Big Al's 16, Here 4 Beer 20", () => {
    const m = matchPoints(bigAls, here4beer);
    expect(m.games.map(g => g.ours)).toEqual([845, 677, 791]); expect(m.games.map(g => g.theirs)).toEqual([789, 826, 772]);
    expect(m.team).toEqual([10, 10]); expect(m.individual).toEqual([6, 10]); expect(m.total).toEqual([16, 20]); expect(m.remaining).toBe(0);
    expect(m.bowlers.map(b => b.total[0])).toEqual([2, 2, 0, 2]);
  });
  test("ties split the points", () => {
    const a: TeamNight = { name: "A", bowlers: [{ name: "x", handicap: 0, games: [100, 100, 100] }] };
    const m = matchPoints(a, { name: "B", bowlers: [{ name: "y", handicap: 0, games: [100, 100, 100] }] });
    expect(m.team).toEqual([10, 10]); expect(m.individual).toEqual([2, 2]);
  });
  test("mid-night: only finished games count, series waits", () => {
    const partial = { ...bigAls, bowlers: bigAls.bowlers.map(b => ({ ...b, games: [b.games[0], null, null] })) };
    const m = matchPoints(partial, { ...here4beer, bowlers: here4beer.bowlers.map(b => ({ ...b, games: [b.games[0]] })) });
    expect(m.total).toEqual([5 + 2, 0 + 2]); expect(m.series.split).toEqual([0, 0]); expect(m.remaining).toBe(27);
  });
});

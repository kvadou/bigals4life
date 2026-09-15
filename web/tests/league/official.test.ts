import { describe, expect, test } from "bun:test";
import { usedHandicap } from "@/lib/league/bls-parse";
import { officialMatchPoints, type OfficialWeek } from "@/lib/league/official";
import { pointsSummary } from "@/lib/season";
import { nightSchema } from "@/lib/scorebook";

// Week 1, 2026-27 vs Nordeast as saved live: handicaps never entered, so live scoring read it 26-10 scratch.
const night = nightSchema.parse({
  game: 3, rolls: [[], [], [], []], finals: [184, 107, 139, 180],
  history: [{ game: 1, rolls: [[], [], [], []], finals: [168, 90, 138, 156] }, { game: 2, rolls: [[], [], [], []], finals: [191, 124, 176, 196] }],
  match: { season: "Thursday Men's Early 2026-27", week: 1,
    opponent: { number: 8, name: "TEAM 8", bowlers: [{ name: "JEFF", handicap: 0 }, { name: "ANGELA", handicap: 0 }, { name: "BRIAN", handicap: 0 }, { name: "KYLE", handicap: 0 }] },
    ours: [{ name: "Doug", handicap: 0 }, { name: "Mustafa", handicap: 0 }, { name: "Kyle", handicap: 0 }, { name: "Pete", handicap: 0 }],
    opponentGames: [[112, 104, 161, 166], [156, 150, 140, 237], [133, 111, 142, 222]] },
});

// Gary's sheet for the same week.
const sheet: OfficialWeek = {
  pointsWon: 12, ourHdcpGames: [752, 887, 810], theirHdcpGames: [749, 889, 814],
  ours: [
    { name: "DOUG KVAMME", handicap: 26, games: [168, 191, 184] }, { name: "MUSTAFA M. SAKHI", handicap: 92, games: [90, 124, 107] },
    { name: "KYLE A. DICKHAUS", handicap: 53, games: [138, 176, 139] }, { name: "PETE ANDERSON", handicap: 29, games: [156, 196, 180] },
  ],
  theirs: [
    { name: "JEFF SIEBER", handicap: 69, games: [112, 156, 133] }, { name: "ANGELA SIEBER", handicap: 80, games: [104, 150, 111] },
    { name: "BRIAN J. DURHAM", handicap: 56, games: [161, 140, 142] }, { name: "KYLE A. TOERING", handicap: 1, games: [166, 237, 222] },
    { name: "GARY D. DORUMSGAARD", handicap: 15, games: [211, 197, 171] },
  ],
};

describe("Gary's sheet is the source of truth for a published week", () => {
  test("live scoring without handicaps disagrees", () => { expect(pointsSummary(night)!.ours).toBe(26); });

  test("week 1 reads 12-24, every split from Gary's numbers", () => {
    const p = officialMatchPoints(night, sheet)!;
    expect(p.total).toEqual([12, 24]);
    expect(p.team).toEqual([5, 15]);
    expect(p.individual).toEqual([7, 9]);
    expect(p.remaining).toBe(0);
    expect(p.games.map(g => [g.ours, g.theirs])).toEqual([[752, 749], [887, 889], [810, 814]]);
    expect(p.bowlers.map(b => b.total[0])).toEqual([3, 1, 2, 1]);
  });

  test("the headline is Gary's total even if our pairing math would differ", () => {
    const p = officialMatchPoints(night, { ...sheet, pointsWon: 14 })!;
    expect(p.total).toEqual([14, 22]);
    expect(p.individual).toEqual([9, 7]);
  });

  test("pointsSummary marks official numbers", () => {
    const s = pointsSummary(night, sheet)!;
    expect(s.official).toBe(true);
    expect([s.ours, s.theirs]).toEqual([12, 24]);
    expect(pointsSummary(night)!.official).toBe(false);
  });
});

describe("usedHandicap", () => {
  test("derives the handicap bowled with from the totals, not next week's column", () => {
    // Week 26 of 2025-26: Doug's Hdcp column reads 66, but 560 - 365 = 195 over 3 games is 65.
    expect(usedHandicap({ handicap: 66, scratchGames: [145, 99, 121], scratchTotal: 365, hdcpTotal: 560 })).toBe(65);
  });
  test("falls back to the column when games are missing", () => {
    expect(usedHandicap({ handicap: 40, scratchGames: null, scratchTotal: null, hdcpTotal: null })).toBe(40);
  });
});

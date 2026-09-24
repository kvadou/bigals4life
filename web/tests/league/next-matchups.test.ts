import { describe, expect, test } from "bun:test";
import { nextMatchups, parseStandings } from "@/lib/league/bls-parse";
import { ourMatchup } from "@/lib/league/tonight";

const week2 = parseStandings(await Bun.file(new URL("./fixtures/2026-27-week-2.txt", import.meta.url)).text());

describe("next week's pairings", () => {
  test("read from roster lane headers, matching Week 1's printed Next Week row (5-4 1-8 7-3 2-6)", () => {
    expect(week2.nextMatchups).toEqual([{ lanes: "1-2", odd: 5, even: 4 }, { lanes: "3-4", odd: 1, even: 8 }, { lanes: "5-6", odd: 7, even: 3 }, { lanes: "7-8", odd: 2, even: 6 }]);
  });
  test("Week 3: Big Al's (7) on odd lane 5 against Balls Deep (3)", () => {
    expect(ourMatchup(week2.nextMatchups, 7)).toEqual({ lanes: "5-6", lane: "odd", opponent: 3 });
    expect(ourMatchup(week2.nextMatchups, 3)).toEqual({ lanes: "5-6", lane: "even", opponent: 7 });
  });
  test("a lane with no partner is warned about, not paired", () => {
    const warnings: string[] = [];
    expect(nextMatchups([{ number: 1, lane: 1 }, { number: 2, lane: 2 }, { number: 3, lane: 3 }], warnings)).toEqual([{ lanes: "1-2", odd: 1, even: 2 }]);
    expect(warnings).toHaveLength(1);
  });
});

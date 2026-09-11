import { describe, expect, test } from "bun:test";
import { nightMatchPoints, ourGames } from "@/lib/league/night-points";
import { nightSchema, type Night } from "@/lib/scorebook";

const strikes = Array(12).fill(10);
const night: Night = nightSchema.parse({
  game: 2,
  rolls: [strikes, [9, 0, 9, 0], [], []],
  finals: [null, null, 150, null],
  history: [{ game: 1, rolls: [[], [], [], []], finals: [168, 90, 138, 156] }],
  match: {
    season: "Thursday Men's Early 2026-27", week: 1,
    opponent: { number: 1, name: "HERE 4 BEER", bowlers: [{ name: "Brett", handicap: 54 }, { name: "Noah", handicap: 60 }, { name: "Tyler", handicap: 43 }, { name: "Ryan", handicap: 18 }] },
    ours: [{ name: "Doug", handicap: 66 }, { name: "Mustafa", handicap: 72 }, { name: "Kyle", handicap: 60 }, { name: "Pete", handicap: 28 }],
    opponentGames: [[112, 104, 161, 166], [156, null, 140, 237]],
  },
});

describe("night match points", () => {
  test("our games come from history finals, current finals, or completed rolls", () => {
    expect(ourGames(night)).toEqual([[168, 90, 138, 156], [300, null, 150, null], [null, null, null, null]]);
  });
  test("points update as games finish", () => {
    const m = nightMatchPoints(night)!;
    // Game 1 with handicap: ours 168+66, 90+72, 138+60, 156+28 = 778 vs theirs 112+54, 104+60, 161+43, 166+18 = 718 -> team 5
    expect(m.games[0]).toMatchObject({ ours: 778, theirs: 718, split: [5, 0] });
    expect(m.games[1].split).toEqual([0, 0]); // game 2 still open on both sides
    expect(m.bowlers[0].games[1]).toEqual([1, 0]); // Doug 300+66 beat Brett 156+54 already
    expect(m.bowlers[2].games[1]).toEqual([1, 0]); // Kyle 150+60 beat Tyler 140+43
    expect(m.bowlers[1].games[1]).toEqual([0, 0]); // Mustafa and Noah both unfinished
    // Game 1 individuals: Doug won, Mustafa lost (162 v 164), Kyle lost (198 v 204), Pete tied (184 v 184)
    expect(m.total[0]).toBe(5 + 1.5 + 2); expect(m.total[1]).toBe(2.5); expect(m.remaining).toBe(36 - 11);
  });
  test("no match set up means no points", () => { expect(nightMatchPoints({ ...night, match: undefined })).toBeNull(); });
});

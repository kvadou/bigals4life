import { describe, expect, test } from "bun:test";
import { parseStandings } from "@/lib/league/bls-parse";
import { reconcileNight } from "@/lib/league/reconcile";
import { nightSchema } from "@/lib/scorebook";

const sheet = parseStandings(await Bun.file(new URL("./fixtures/week-26.txt", import.meta.url)).text());
// Week 26 as we might have entered it live: Kyle's game 3 typed as 159 instead of 195, Tyler's game 2 typed wrong.
const night = nightSchema.parse({
  game: 3, rolls: [[], [], [], []], finals: [121, 108, 159, 143],
  history: [{ game: 1, rolls: [[], [], [], []], finals: [145, 96, 127, 253] }, { game: 2, rolls: [[], [], [], []], finals: [99, 117, 125, 112] }],
  match: { season: "Thursday Men's Early 2025-26", week: 26,
    opponent: { number: 1, name: "HERE 4 BEER", bowlers: [{ name: "NOAH EVANS", handicap: 60 }, { name: "TYLER VOIGT", handicap: 43 }, { name: "BRETT ANDERSON", handicap: 54 }, { name: "RYAN MURPHY", handicap: 18 }] },
    ours: [{ name: "Doug", handicap: 65 }, { name: "Mustafa", handicap: 71 }, { name: "Kyle", handicap: 60 }, { name: "Pete", handicap: 28 }],
    opponentGames: [[145, 148, 163, 158], [151, 185, 152, 190], [97, 192, 132, 176]] },
});

describe("reconcile a live night against Gary's sheet", () => {
  test("flags typed-in differences and keeps Gary canonical", () => {
    const r = reconcileNight("n1", night, sheet, 5)!;
    expect(r.opponent).toBe("HERE 4 BEER");
    expect(r.discrepancies).toEqual(expect.arrayContaining([
      { who: "Kyle", field: "game 3", ours: "159", gary: "195" },
      { who: "TYLER VOIGT", field: "game 2", ours: "185", gary: "158" },
    ]));
    // Doug bowled week 26 with 65: (560 hdcp total - 365 scratch) / 3. The 66 in the Hdcp column is next week's.
    expect(r.discrepancies.find(d => d.who === "Doug" && d.field === "handicap")).toBeUndefined();
    expect(r.discrepancies.filter(d => d.field.startsWith("game"))).toHaveLength(2);
    expect(r.checked).toBeGreaterThan(20);
  });
  test("a clean night has no discrepancies", () => {
    const clean = { ...night, finals: [121, 108, 195, 143] as (number | null)[], match: { ...night.match!, opponentGames: [[145, 148, 163, 158], [151, 158, 152, 190], [97, 192, 132, 176]] } };
    expect(reconcileNight("n1", clean, sheet, 5)!.discrepancies).toEqual([]);
  });
  test("no match on the night means nothing to reconcile", () => { expect(reconcileNight("n1", { ...night, match: undefined }, sheet, 5)).toBeNull(); });
});

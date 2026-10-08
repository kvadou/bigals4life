import { test, expect } from "bun:test";
import { openingMessage } from "../lib/review/opening";
import { gameStats } from "../lib/review/stats";

const base = { name: "Doug", prebowl: false, opponent: "HERE 4 BEER", paired: { name: "RACHEL CARLSON", handicap: 86 }, handicap: 18, league: { average: 140, toRaise: 431 }, games: [], arsenal: ["Storm", "Spare"] };

test("before a game the coach names the pairing and the series to raise", () => {
  const o = openingMessage(base);
  expect(o.text).toBe("Tonight you're paired with Rachel Carlson (hdcp 86, yours 18). A 431 series raises your 140 average; 144 a game does it. I'll have something to say once a game is in.");
  expect(o.question).toBe("What ball are you starting with?");
  expect(openingMessage({ ...base, arsenal: [] }).question).toBeNull();
  expect(openingMessage({ ...base, prebowl: true, paired: null }).text).toStartWith("Pre-bowl night, Doug.");
  expect(openingMessage({ ...base, paired: null, league: null }).text).toBe("Tonight it's Here 4 Beer. I'll have something to say once a game is in.");
});

test("after three games it reports the series, the best game and the average", () => {
  const games = [
    { game: 1, complete: true, stats: gameStats([...Array(9).fill(10), 7, 2]) }, // 9 strikes, open tenth: 265
    { game: 2, complete: true, stats: { ...gameStats([]), score: 120 } },
    { game: 3, complete: true, stats: { ...gameStats([]), score: 110 } },
  ];
  const o = openingMessage({ ...base, games });
  expect(o.text).toBe("495 series over 3 games. Game 1 was the one: 265 with 9X · 0/ · 1 open, and an open tenth that cost a few. That raises your 140 average.");
  expect(o.question).toBe("Which game felt best, and why?");
  const low = openingMessage({ ...base, games: games.map(g => ({ ...g, stats: { ...g.stats, score: 100, opens: 4 } })) });
  expect(low.text).toContain("You needed 431 to raise the 140 average, so it dips.");
  expect(low.question).toBe("Was that the lane or the release?");
});

test("mid-night it says what is still needed", () => {
  const o = openingMessage({ ...base, games: [{ game: 1, complete: true, stats: { ...gameStats([]), score: 150 } }, { game: 2, complete: false, stats: gameStats([10]) }] });
  expect(o.text).toBe("150 series over 1 game. Game 1 was the high one at 150. 281 more over the last 2 games raises your average.");
});

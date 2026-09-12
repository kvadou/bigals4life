import { test, expect } from "bun:test";
import { gameStats } from "../lib/review/stats";
import { reviewSchema, profileSchema, emptyReview } from "../lib/review/schema";
import { candidateIdeas } from "../lib/review/ideas";

test("a 300 is twelve strikes and no opens", () => {
  const s = gameStats(Array(12).fill(10));
  expect(s).toMatchObject({ score: 300, strikes: 12, spares: 0, opens: 0, cleanFrames: 10, firstBallAvg: 10, tenth: "XXX" });
});

test("all nines and spares", () => {
  const rolls = Array.from({ length: 21 }, (_, i) => i % 2 ? 1 : 9); // 9/ every frame, 9 fill ball
  const s = gameStats(rolls);
  expect(s).toMatchObject({ score: 190, strikes: 0, spares: 10, opens: 0, firstBallAvg: 9, tenth: "/" });
});

test("an open tenth counts as open, and a partial game only counts played frames", () => {
  const open = gameStats([...Array(9).fill(10), 7, 2]);
  expect(open).toMatchObject({ strikes: 9, opens: 1, tenth: "open" });
  const partial = gameStats([10, 7, 2, 8]);
  expect(partial).toMatchObject({ strikes: 1, opens: 1, framesPlayed: 3, cleanFrames: 2, tenth: "" });
  expect(gameStats([])).toMatchObject({ score: 0, strikes: 0, framesPlayed: 0, firstBallAvg: 0, tenth: "" });
});

test("review and profile schemas fill defaults and reject junk", () => {
  const r = emptyReview();
  expect(r.games).toEqual([]); expect(r.context.lanes).toBe(""); expect(r.closed).toBe(false);
  expect(reviewSchema.safeParse({ games: [{ tags: ["nope"] }] }).success).toBe(false);
  expect(reviewSchema.parse({ games: [{ tags: ["high", "split"], note: "went high late" }] }).games[0].tags).toEqual(["high", "split"]);
  expect(profileSchema.parse({ arsenal: ["Storm Bionic"] })).toMatchObject({ arsenal: ["Storm Bionic"], hand: "right", language: "plain" });
  expect(profileSchema.safeParse({ arsenal: Array(13).fill("x") }).success).toBe(false);
});

test("ideas only come from tags the bowler chose, and every idea names a source", () => {
  expect(candidateIdeas(new Set())).toEqual([]);
  const high = candidateIdeas(new Set(["high"]));
  expect(high.map(i => i.key)).toContain("early-hook");
  expect(high.every(i => i.source && i.url.startsWith("https://") && i.agree >= 1)).toBe(true);
});

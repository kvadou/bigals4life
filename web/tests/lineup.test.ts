import { test, expect } from "bun:test";
import { bestLineup, evaluate, pairingValue, winProbability, firstMoverNote } from "../lib/league/lineup";

const b = (name: string, average: number, handicap = 0, known?: number[]) => ({ name, average, handicap, known });

test("even matchup is a coin flip; a 30 pin edge is a clear favorite", () => {
  expect(winProbability(b("a", 180), b("x", 180))).toBeCloseTo(0.5, 2);
  expect(winProbability(b("a", 200), b("x", 170))).toBeGreaterThan(0.75);
  // handicap counts
  expect(winProbability(b("a", 150, 54), b("x", 180, 27))).toBeCloseTo(0.47, 1);
});

test("a pre-bowled bowler is judged on his real games, with no spread", () => {
  const pete = b("Pete", 168, 37, [183, 191, 188]);
  const them = b("x", 175, 31);
  const p = pairingValue(pete, them);
  expect(p.expected).toBeGreaterThan(3); // 189 avg plus 37 vs 206: he wins all three most of the time
  expect(winProbability(pete, them, 0)).toBeGreaterThan(winProbability(b("Pete", 168, 37), them, 0));
});

test("best lineup stacks strength where it buys the most points, and beats the default order", () => {
  const ours = [b("Doug", 181, 26), b("Mustafa", 150, 54), b("Kyle", 160, 45), b("Pete", 168, 37)];
  const theirs = [b("T1", 200, 9), b("T2", 190, 18), b("T3", 165, 40), b("T4", 140, 63)];
  const best = bestLineup(ours, theirs);
  const def = evaluate(ours, theirs);
  expect(best.expected).toBeGreaterThanOrEqual(def.expected);
  expect(best.order.length).toBe(4);
  expect(new Set(best.order.map(o => o.name)).size).toBe(4);
  expect(best.max).toBe(16);
});

test("first mover note names the two steadiest by average plus handicap", () => {
  const note = firstMoverNote([b("Doug", 181, 26), b("Mustafa", 150, 54), b("Kyle", 160, 45), b("Pete", 168, 37)]);
  expect(note).toContain("Doug");
  expect(note).toContain("Pete");
});

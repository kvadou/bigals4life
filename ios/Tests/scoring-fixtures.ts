import { analyze, maximum, symbol } from "../../web/lib/bowling";

// Reproducible legal prefixes, with exhaustive tenth-frame rack combinations.
let seed = 0xBAF12026;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const sequences = new Map<string, number[]>();
function include(rolls: number[]) {
  for (let n = 0; n <= rolls.length; n++) {
    const prefix = rolls.slice(0, n);
    sequences.set(JSON.stringify(prefix), prefix);
  }
}
include(Array(12).fill(10));
include(Array(21).fill(5));
include(Array(20).fill(0));
include([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]);
for (let n = 0; n < 160; n++) {
  const rolls: number[] = [];
  while (!analyze(rolls).complete) rolls.push(random() % (analyze(rolls).available + 1));
  include(rolls);
}
const nineFrames = [10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10];
for (let first = 0; first <= 10; first++) {
  for (let second = 0; second <= (first === 10 ? 10 : 10 - first); second++) {
    const rolls = [...nineFrames, first, second];
    const state = analyze(rolls);
    if (state.complete) include(rolls);
    else for (let third = 0; third <= state.available; third++) include([...rolls, third]);
  }
}
const fixtures = [...sequences.values()].map(rolls => {
  const state = analyze(rolls);
  return {
    rolls, complete: state.complete, available: state.available,
    frame: state.frame, ball: state.ball, score: state.score,
    maximum: maximum(rolls),
    frames: state.frames.map(frame => frame.rolls),
    scores: state.frames.map(frame => frame.score),
    symbols: state.frames.map(frame => frame.rolls.map((_, i) => symbol(frame.rolls, i)).join("  ")),
  };
});
process.stdout.write(JSON.stringify(fixtures));

export type Frame = { rolls: number[]; complete: boolean; score: number | null };
export function analyze(rolls: number[]) {
  const frames: Frame[] = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10; f++) {
    const start = i;
    if (i >= rolls.length) { frames.push({ rolls: [], complete: false, score: null }); continue; }
    if (f === 9) {
      const r = rolls.slice(i);
      const complete = r.length === 3 || (r.length === 2 && r[0] + r[1] < 10);
      frames.push({ rolls: r, complete, score: complete ? total + r.reduce((a,b)=>a+b,0) : null });
      break;
    }
    if (rolls[i] === 10) {
      const score = i + 2 < rolls.length ? total + 10 + rolls[i+1] + rolls[i+2] : null;
      if (score !== null) total = score;
      frames.push({ rolls: [10], complete: true, score }); i++;
    } else {
      const r = rolls.slice(i, i+2), complete = r.length === 2;
      const sum = r.reduce((a,b)=>a+b,0);
      const score = complete && (sum !== 10 || i+2 < rolls.length) ? total + sum + (sum === 10 ? rolls[i+2] : 0) : null;
      if (score !== null) total = score;
      frames.push({ rolls: r, complete, score }); i = start + r.length;
    }
  }
  const complete = frames[9].complete;
  const currentIndex = complete ? 9 : frames.findIndex(f => !f.complete);
  const r = frames[currentIndex].rolls;
  let available = 10;
  if (complete) available = 0;
  else if (currentIndex < 9) available = r.length ? 10-r[0] : 10;
  else if (r.length === 1) available = r[0] === 10 ? 10 : 10-r[0];
  else if (r.length === 2) available = r[0] < 10 || r[1] === 10 ? 10 : 10-r[1];
  return { frames, complete, frame: currentIndex+1, ball: r.length+1, available, score: frames.reduce((last,f)=>f.score ?? last,0) };
}
export function maximum(rolls: number[]) {
  const projected = [...rolls];
  let state = analyze(projected);
  while (!state.complete) { projected.push(state.available); state = analyze(projected); }
  return state.score;
}
export function validRolls(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length > 21) return false;
  const prefix: number[] = [];
  for (const pin of value) {
    const state = analyze(prefix);
    if (!Number.isInteger(pin) || state.complete || pin < 0 || pin > state.available) return false;
    prefix.push(pin);
  }
  return true;
}
export function symbol(frame: number[], index: number) {
  const pin = frame[index];
  if (pin === undefined) return "";
  if ((index === 1 || (index === 2 && frame[0] === 10)) && frame[index-1] !== 10 && frame[index-1]+pin === 10) return "/";
  return pin === 10 ? "X" : pin === 0 ? "–" : String(pin);
}

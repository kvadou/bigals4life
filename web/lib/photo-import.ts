import { analyze, validRolls } from "./bowling";

export function parseRollText(text: string): number[] {
  const rolls: number[] = [];
  for (const raw of text.trim().split(/[\s,|]+/).filter(Boolean)) {
    const token = raw.toUpperCase();
    const state = analyze(rolls);
    const frame = state.frames[state.frame - 1].rolls;
    let pin: number;
    if (token === "X") pin = 10;
    else if (token === "/") {
      const spareAllowed = (frame.length === 1 && frame[0] !== 10) || (state.frame === 10 && frame.length === 2 && frame[0] === 10 && frame[1] !== 10);
      if (!spareAllowed) throw new Error("A spare needs the first ball of that rack. Check the marks before /.");
      pin = state.available;
    } else if (["-", "–", "F"].includes(token)) pin = 0;
    else if (/^(10|[0-9])$/.test(token)) pin = Number(token);
    else throw new Error(`Cannot read “${raw}”. Use numbers, X, /, or - separated by spaces.`);
    if (state.complete || pin > state.available) throw new Error(`“${raw}” is not possible in frame ${state.frame}. Check the roll order.`);
    rolls.push(pin);
  }
  if (!validRolls(rolls)) throw new Error("Check the roll sequence.");
  return rolls;
}

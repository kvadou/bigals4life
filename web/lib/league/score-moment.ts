import { analyze, validRolls } from "../bowling";
import type { Night } from "../scorebook";
import { BOWLERS } from "../season";

export type ScoreMoment = { id: string; label: string; observedAt: number };

/** This detects a fresh scorebook event, never the identity or timing of a filmed shot. */
export function scoreMoment(before: Night, after: Night, observedAt: number): ScoreMoment | null {
  if (!Number.isFinite(observedAt) || before.game !== after.game || before.game < 1 || after.game > 3) return null;
  if (JSON.stringify(before.history) !== JSON.stringify(after.history) || JSON.stringify(before.finals) !== JSON.stringify(after.finals)) return null;
  if (JSON.stringify(before.prebowl) !== JSON.stringify(after.prebowl)) return null;
  const changed = BOWLERS.map((_, i) => i).filter(i => JSON.stringify(before.rolls[i]) !== JSON.stringify(after.rolls[i]));
  if (changed.length !== 1) return null;
  const i = changed[0], previous = before.rolls[i], next = after.rolls[i];
  if (after.prebowl && !after.prebowl.bowlers.includes(i)) return null;
  if (after.finals?.[i] != null || !validRolls(previous) || !validRolls(next) || next.length !== previous.length + 1 || !previous.every((pin, index) => pin === next[index])) return null;
  const was = analyze(previous), now = analyze(next), pin = next.at(-1)!;
  if (was.complete) return null;
  let event: string;
  if (now.complete) event = `Game ${after.game} complete · ${now.score}`;
  else if (pin === 10 && (was.ball === 1 || (was.frame === 10 && was.frames[9].rolls[0] === 10))) event = `Strike · frame ${was.frame}`;
  else if (was.ball === 2 && was.frames[was.frame - 1].rolls[0] < 10 && was.frames[was.frame - 1].rolls[0] + pin === 10) event = `Spare · frame ${was.frame}`;
  else return null;
  return { id: `${after.game}:${i}:${next.join(",")}`, label: `${BOWLERS[i]} · ${event}`, observedAt };
}

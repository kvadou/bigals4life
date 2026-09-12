import { analyze } from "@/lib/bowling";

export type GameStats = {
  score: number; strikes: number; spares: number; opens: number; framesPlayed: number; cleanFrames: number;
  /** Average pins on the first ball of each frame, one decimal. 0 when nothing bowled. */
  firstBallAvg: number;
  /** How the tenth ended: "XXX" | "X" (at least one strike) | "/" (spare) | "open" | "" (not bowled). */
  tenth: "XXX" | "X" | "/" | "open" | "";
};

/** Strike/spare/open counts from the rolls already in the scorebook. Nothing to enter. */
export function gameStats(rolls: number[]): GameStats {
  const { frames, score } = analyze(rolls);
  let strikes = 0, spares = 0, opens = 0;
  const firstBalls: number[] = [];
  frames.forEach((f, i) => {
    if (!f.rolls.length) return;
    firstBalls.push(f.rolls[0]);
    if (i < 9) {
      if (f.rolls[0] === 10) strikes++;
      else if (f.rolls.length > 1 && f.rolls[0] + f.rolls[1] === 10) spares++;
      else if (f.complete) opens++;
      return;
    }
    // Tenth frame: every mark counts, and it is open only if the first two balls left pins.
    let standing = 10;
    for (const r of f.rolls) {
      if (r === 10 && standing === 10) { strikes++; standing = 10; continue; }
      if (r === standing) { spares++; standing = 10; continue; }
      standing -= r;
    }
    if (f.complete && f.rolls[0] < 10 && f.rolls[0] + (f.rolls[1] ?? 0) < 10) opens++;
  });
  const played = frames.filter(f => f.rolls.length).length;
  const avg = firstBalls.length ? Math.round(firstBalls.reduce((a, b) => a + b, 0) / firstBalls.length * 10) / 10 : 0;
  return { score: score ?? 0, strikes, spares, opens, framesPlayed: played, cleanFrames: played - opens, firstBallAvg: avg, tenth: tenthLabel(frames[9]) };
}

function tenthLabel(f: { rolls: number[]; complete: boolean } | undefined): GameStats["tenth"] {
  if (!f || !f.rolls.length) return "";
  if (f.rolls.length === 3 && f.rolls.every(r => r === 10)) return "XXX";
  if (f.rolls[0] === 10) return "X";
  if (f.rolls.length > 1 && f.rolls[0] + f.rolls[1] === 10) return "/";
  return f.complete ? "open" : "";
}

/** One line per game for the coach and the header chips. */
export const statLine = (s: GameStats) => s.framesPlayed ? `${s.strikes}X · ${s.spares}/ · ${s.opens} open` : "score only";

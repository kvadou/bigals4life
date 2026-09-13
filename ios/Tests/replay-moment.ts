import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "ba4l-replay-moment-"));
try {
 const file = await readFile("ios/Sources/LaneReplayView.swift", "utf8");
 const model = file.slice(file.indexOf("struct ReplayScoreMoment"), file.indexOf("private final class ReplayFrameSink"));
 const source = `import Foundation
${model}
@main struct Verify {
 static func main() {
  var prior = Night(); var next = prior
  next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next)?.contains("strike") == true)
  prior.rolls[0] = [7]; next = prior; next.rolls[0].append(3)
  precondition(ReplayScoreMoment.label(previous: prior, current: next)?.contains("spare") == true)
  prior.rolls[0] = [0]; next = prior; next.rolls[0].append(10)
  precondition(ReplayScoreMoment.label(previous: prior, current: next)?.contains("spare") == true)
  prior.rolls[0] = [7]; next.rolls[0] = [7,2]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  next = prior; next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  prior = Night(); next = prior; next.rolls[0] = [10,10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  next = prior; next.rolls[0] = [10]; next.rolls[1] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  next = prior; next.game = 2; next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  prior.finals = [200,nil,nil,nil]; next = prior; next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  prior = Night(); prior.game = 4; next = prior; next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  prior = Night(); prior.prebowl = Prebowl(week: 2, bowlers: [3]); next = prior; next.rolls[0] = [10]
  precondition(ReplayScoreMoment.label(previous: prior, current: next) == nil)
  prior = Night(); prior.rolls[0] = Array(repeating: 0, count: 19); next = prior; next.rolls[0].append(0)
  precondition(ReplayScoreMoment.label(previous: prior, current: next)?.contains("finished") == true)
  precondition(ReplayScoreMoment.label(previous: next, current: next) == nil)
  print("Replay moments: strict single-roll strike/spare/completion and correction/batch/game/final/prebowl exclusions passed")
 }
}`;
 const path = join(directory, "Verify.swift"), binary = join(directory, "verify");
 await writeFile(path, source);
 const compile = Bun.spawn(["xcrun", "swiftc", "-parse-as-library", "ios/Sources/BowlingGame.swift", path, "-o", binary], { stdout: "inherit", stderr: "inherit" });
 if (await compile.exited) throw new Error("Replay moment compilation failed");
 const run = Bun.spawn([binary], { stdout: "inherit", stderr: "inherit" });
 if (await run.exited) throw new Error("Replay moment verification failed");
} finally { await rm(directory, { recursive: true, force: true }); }

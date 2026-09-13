import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dir, "../..");
const scratch = mkdtempSync(join(tmpdir(), "bafl-ios-tests-"));
const fixtures = join(scratch, "scoring.json");
const payloads = join(scratch, "requests.json");
const binary = join(scratch, "tests");

function run(command: string, args: string[], capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, BOWLING_FIXTURES: fixtures, SCOREBOOK_PAYLOADS: payloads },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (${result.status})`);
  return result.stdout;
}

try {
  writeFileSync(fixtures, run("bun", ["ios/Tests/scoring-fixtures.ts"], true)!);
  run("swiftc", ["-O", "ios/Sources/BowlingGame.swift", "ios/Tests/main.swift", "-o", binary]);
  run(binary, []);
  run("bun", ["ios/Tests/validate-scorebook-payloads.ts", payloads]);
  const authBinary = join(scratch, "account-tests");
  run("swiftc", ["-parse-as-library", "ios/Sources/AccountSession.swift", "ios/Tests/account-session.swift", "-o", authBinary]);
  run(authBinary, []);
  const voiceBinary = join(scratch, "voice-tests");
  run("swiftc", ["-parse-as-library", "ios/Sources/BowlingGame.swift", "ios/Sources/VoiceRoll.swift", "ios/Tests/voice-roll.swift", "-o", voiceBinary]);
  run(voiceBinary, []);
  const liveContextBinary = join(scratch, "live-context-tests");
  run("swiftc", ["ios/Sources/LiveLaneContext.swift", "ios/Tests/live-lane-context.swift", "-o", liveContextBinary]);
  run(liveContextBinary, []);
  run("bun", ["ios/Tests/models.ts"]);
  run("bun", ["ios/Tests/match-insights.ts"]);
  run("bun", ["ios/Tests/tonight-profile.ts"]);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

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
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

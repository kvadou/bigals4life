import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Compiles the pure league math block out of LeagueView.swift and checks it against the web's standings math.
const root = resolve(import.meta.dir, "../..");
const temp = await mkdtemp(join(tmpdir(), "ba4l-league-math-"));
try {
  const file = await readFile(join(root, "ios/Sources/LeagueView.swift"), "utf8");
  const pure = file.split("// MARK: - Pure league math")[1].split("// MARK: - End pure league math")[0];
  const code = "import Foundation\n// " + pure + `
@main struct LeagueMath { static func main() {
  func check(_ ok: Bool, _ m: String) { if !ok { FileHandle.standardError.write(Data(("FAIL " + m + "\\n").utf8)); exit(1) } }
  check(NativeLeagueMath.ordinal(1) == "1st" && NativeLeagueMath.ordinal(2) == "2nd" && NativeLeagueMath.ordinal(3) == "3rd" && NativeLeagueMath.ordinal(4) == "4th", "ordinal 1-4")
  check(NativeLeagueMath.ordinal(11) == "11th" && NativeLeagueMath.ordinal(12) == "12th" && NativeLeagueMath.ordinal(13) == "13th" && NativeLeagueMath.ordinal(21) == "21st" && NativeLeagueMath.ordinal(112) == "112th", "ordinal teens")
  check(NativeLeagueMath.firstSentence("We snagged 24 against XXX. Pete rolled 285! Next week.") == "We snagged 24 against XXX.", "first sentence")
  check(NativeLeagueMath.firstSentence("  No punctuation at all ") == "No punctuation at all", "no sentence break keeps the text")
  check(NativeLeagueMath.firstSentence("Line one\\nLine two.") == "Line one", "newline ends the sentence")
  let week4: [(place: Int, points: Double)] = [(1, 99), (2, 90), (3, 81), (4, 71.5), (5, 70.5), (6, 67), (7, 57), (8, 40)]
  check(NativeLeagueMath.pointsTo(place: 4, ours: 67, teams: week4) == 4.5, "4.5 to fourth")
  check(NativeLeagueMath.pointsTo(place: 4, ours: 90, teams: week4) == 0, "already above fourth")
  check(NativeLeagueMath.pointsTo(place: 9, ours: 67, teams: week4) == nil, "no ninth place")
  check(NativeLeagueMath.points(9) == "9" && NativeLeagueMath.points(3.5) == "3.5" && NativeLeagueMath.points(71.5) == "71.5", "points formatting")
  print("Passed native league math (ordinals, first sentence, points to place).")
} }`;
  await writeFile(join(temp, "LeagueMath.swift"), code);
  const compile = Bun.spawn(["xcrun", "swiftc", "-parse-as-library", join(temp, "LeagueMath.swift"), "-o", join(temp, "league-math")], { stdout: "pipe", stderr: "pipe" });
  if (await compile.exited) throw Error(await new Response(compile.stderr).text());
  const run = Bun.spawn([join(temp, "league-math")], { stdout: "inherit", stderr: "pipe" });
  if (await run.exited) throw Error(await new Response(run.stderr).text());
} finally { await rm(temp, { recursive: true, force: true }); }

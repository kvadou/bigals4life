import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { nightMatchPoints } from "../../web/lib/league/night-points";
import type { Night } from "../../web/lib/scorebook";

const root = resolve(import.meta.dir, "../..");
const temp = await mkdtemp(join(tmpdir(), "ba4l-match-parity-"));
try {
  let seed = 42;
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const fixtures: Night[] = [];
  for (let n = 0; n < 700; n++) {
    const game = (number: number) => ({ game: number, rolls: Array.from({ length: 4 }, () => random(3) === 0 ? [10, 10] : []), finals: Array.from({ length: 4 }, () => n % 4 === 0 ? null : random(5) === 0 ? null : random(301)) });
    const current = game(3);
    const names = ["Doug", "Mustafa", "Kyle", "Pete"];
    for (let k = 3; k > 0; k--) { const j = random(k + 1); [names[k], names[j]] = [names[j], names[k]]; }
    const size = n % 13 === 0 ? 8 : n % 17 === 0 ? 1 : 4;
    const night: Night = { ...current, history: [game(1), game(2)], match: {season: "Fixture 2026-27", week: 1, ours: names.map(name => ({name, handicap: random(100)})), opponent:{number:1,name:"Fixture opponents",bowlers:Array.from({length:size},(_,i)=>({name:`Opponent ${i}`,handicap:random(100)}))},opponentGames:Array.from({length:3},()=>Array.from({length:size},()=>n % 4 === 0 ? null : random(6) === 0 ? null : random(301)))} };
    if (n === 1) { night.history = [{game:1,rolls:Array.from({length:4},()=>Array(12).fill(10))}]; night.game=2; night.rolls=Array.from({length:4},()=>Array(20).fill(0)); night.finals=undefined; }
    if (n === 2) { for (const g of [...night.history, night]) { g.finals = [0,0,0,0]; } night.match!.ours.forEach(b=>b.handicap=0); night.match!.opponent.bowlers.forEach(b=>b.handicap=0); night.match!.opponentGames=Array.from({length:3},()=>[0,0,0,0]); }
    fixtures.push(night);
  }
  const bowling = await readFile(join(root,"ios/Sources/BowlingGame.swift"),"utf8");
  const file = await readFile(join(root,"ios/Sources/MatchInsightsView.swift"),"utf8");
  const pure = file.split("// MARK: - Pure match scoring")[1].split("// MARK: - End pure match scoring")[0];
  const code = bowling + "\n// " + pure + `\n@main struct MatchParity { static func main() throws {
  // Head-to-head and spare legality (Score tab build 22): Pete in slot 3 vs Rachel, game 2 of the Week 4 night.
  func check(_ ok: Bool, _ m: String) { if !ok { FileHandle.standardError.write(Data(("FAIL " + m + "\\n").utf8)); exit(1) } }
  var n = Night(); n.game = 2; n.rolls[3] = Array(repeating: 10, count: 12); n.history = [RecordedGame(game: 1, rolls: [[], [], [], []], finals: [122, 107, 140, 227])]
  n.match = LeagueMatch(season: "s", week: 4, opponent: MatchOpponent(number: 2, name: "X X X", bowlers: [MatchBowler(name: "MICHAEL DOLS", handicap: 81), MatchBowler(name: "LIZ BOOTH", handicap: 88), MatchBowler(name: "ROSS CARLSON", handicap: 100), MatchBowler(name: "RACHEL CARLSON", handicap: 86)]), ours: [MatchBowler(name: "Doug", handicap: 60), MatchBowler(name: "Mustafa", handicap: 78), MatchBowler(name: "Kyle", handicap: 56), MatchBowler(name: "Pete", handicap: 18)], opponentGames: [[88, 145, 111, 107], [149, 124, 67, 108]], lane: .odd)
  let h = NativeMatchScoring.headToHead(n, bowler: 3)
  check(h == .init(opponent: "Rachel", theirScore: 108, theirHandicap: 86, ourHandicap: 18, margin: 300 + 18 - 194), "Pete vs Rachel game 2")
  check(NativeMatchScoring.headToHead(n, bowler: 0)?.theirScore == 149 && NativeMatchScoring.headToHead(n, bowler: 0)?.margin == 60 - 230, "Doug vs Michael, no pins yet")
  n.game = 3; check(NativeMatchScoring.headToHead(n, bowler: 3)?.theirScore == nil, "Game 3 has no opponent score yet")
  check(NativeMatchScoring.headToHead(Night(), bowler: 0) == nil, "No match, no pairing")
  func g(_ r: [Int]) -> BowlingGame { var b = BowlingGame(); r.forEach { b.add($0) }; return b }
  check(!NativeMatchScoring.spareLegal(g([])), "Ball 1 cannot spare")
  check(NativeMatchScoring.spareLegal(g([7])), "Ball 2 after a 7 can spare")
  check(!NativeMatchScoring.spareLegal(g([10])), "After a strike the next ball is ball 1")
  let nine = Array(repeating: 0, count: 18)
  check(!NativeMatchScoring.spareLegal(g(nine + [10])), "Tenth ball 2 after a strike is a fresh rack")
  check(NativeMatchScoring.spareLegal(g(nine + [10, 7])), "Tenth ball 3 after strike then 7 can spare")
  check(!NativeMatchScoring.spareLegal(g(nine + [7, 3])), "Tenth after a spare is a fresh rack")
  check(!NativeMatchScoring.spareLegal(g(nine + [7, 3, 4])), "Complete game")
  let nights = try JSONDecoder().decode([Night].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))); let values = nights.map { NativeMatchScoring.points($0) }; let data = try JSONEncoder().encode(values); FileHandle.standardOutput.write(data) } }`;
  await writeFile(join(temp,"MatchParity.swift"), code);
  await writeFile(join(temp,"fixtures.json"),JSON.stringify(fixtures));
  const compile = Bun.spawn(["xcrun","swiftc","-parse-as-library",join(temp,"MatchParity.swift"),"-o",join(temp,"match-parity")],{stdout:"pipe",stderr:"pipe"});
  if(await compile.exited) throw Error(await new Response(compile.stderr).text());
  const run = Bun.spawn([join(temp,"match-parity"),join(temp,"fixtures.json")],{stdout:"pipe",stderr:"pipe"});
  const output = await new Response(run.stdout).text();
  if(await run.exited) throw Error(await new Response(run.stderr).text());
  const values = JSON.parse(output);
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([,v])=>v != null).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
  fixtures.forEach((fixture,i)=>{ if(JSON.stringify(canonical(values[i])) !== JSON.stringify(canonical(nightMatchPoints(fixture)))) throw Error(`Native match point mismatch for fixture ${i}`); });
  console.log(`Passed ${fixtures.length} native/web match-point fixtures (lineup permutations, ties, partial games, handicaps, 1/4/8 opponents, completed rolls).`);
} finally { await rm(temp,{recursive:true,force:true}); }

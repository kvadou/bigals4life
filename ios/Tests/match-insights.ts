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
  const code = bowling + "\n// " + pure + `\n@main struct MatchParity { static func main() throws { let nights = try JSONDecoder().decode([Night].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))); let values = nights.map { NativeMatchScoring.points($0) }; let data = try JSONEncoder().encode(values); FileHandle.standardOutput.write(data) } }`;
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

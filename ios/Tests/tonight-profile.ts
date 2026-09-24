import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const temp = await mkdtemp(join(tmpdir(), "ba4l-profile-"));
try {
  const source = await readFile(join(root,"ios/Sources/TonightView.swift"),"utf8");
  const profile = source.slice(source.indexOf("struct TonightProfile"),source.indexOf("/// An account"));
  const code = `import Foundation\nenum Night { static let names=["Doug","Mustafa","Kyle","Pete"] }\n` + profile + `
@main struct VerifyProfile { static func main() throws {
func check(_ value: Bool) { precondition(value, "Personalized bowler selection failed") }
for (index,name) in Night.names.enumerated() { check(TonightProfile(displayName:name,bowlerName:" " + name.lowercased() + " ").bowlerIndex == index) }
check(TonightProfile(displayName:"Visitor",bowlerName:nil).bowlerIndex == nil)
check(TonightProfile(displayName:"Doug",bowlerName:nil).bowlerIndex == nil)
check(TonightProfile(displayName:"Visitor",bowlerName:"Someone else").bowlerIndex == nil)
check(TonightProfile(displayName:"",bowlerName:nil).greeting == "Ready for the lanes?")
check(TonightProfile(displayName:"Mustafa",bowlerName:"Mustafa").greeting == "Welcome, Mustafa Sakhi.")
check(TonightProfile(displayName:"dougkvamme",bowlerName:nil).greeting == "Welcome, Doug Kvamme.")
check(TonightProfile(displayName:"Douglas Kvamme",bowlerName:"Doug").greeting == "Welcome, Douglas Kvamme.")
check(TonightProfile(displayName:"Visitor",bowlerName:nil).greeting == "Welcome, Visitor.")
let first=UserDefaults(suiteName:"ba4l.profile.fixture.first")!, second=UserDefaults(suiteName:"ba4l.profile.fixture.second")!
defer { first.removePersistentDomain(forName:"ba4l.profile.fixture.first"); second.removePersistentDomain(forName:"ba4l.profile.fixture.second") }
first.set(2,forKey:"selectedBowler"); second.set(3,forKey:"selectedBowler")
check(first.integer(forKey:"selectedBowler") == 2 && second.integer(forKey:"selectedBowler") == 3)
print("Passed personal profile mapping and account-isolated selection checks")
} }`;
  await writeFile(join(temp,"Verify.swift"),code);
  const compile=Bun.spawn(["xcrun","swiftc","-parse-as-library",join(temp,"Verify.swift"),"-o",join(temp,"verify")],{stdout:"pipe",stderr:"pipe"});
  if(await compile.exited) throw Error(await new Response(compile.stderr).text());
  const run=Bun.spawn([join(temp,"verify")],{stdout:"pipe",stderr:"pipe"});
  const output=await new Response(run.stdout).text();
  if(await run.exited) throw Error(await new Response(run.stderr).text());
  console.log(output.trim());
} finally { await rm(temp,{recursive:true,force:true}); }

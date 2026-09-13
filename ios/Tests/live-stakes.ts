import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {liveStakes,finalScoreBounds} from "../../web/lib/league/live-stakes";
import {analyze} from "../../web/lib/bowling";
import type {Night} from "../../web/lib/scorebook";
const root=resolve(import.meta.dir,"../.."),dir=mkdtempSync(join(tmpdir(),"ba4l-stakes-"));
const fixture: {night:Night;cards:ReturnType<typeof liveStakes>;rolls:number[];bounds:ReturnType<typeof finalScoreBounds>}[]=[];
function add(rolls:number[],other:number,override:number|null=null,prebowl=false){
 const night:Night={game:1,rolls:[[],[],[],rolls],finals:[null,null,null,override],history:[],match:{season:"test",week:2,ours:["Pete","Doug","Mustafa","Kyle"].map(name=>({name,handicap:20})),opponent:{number:1,name:"Other",bowlers:Array(4).fill({name:"Other",handicap:10})},opponentGames:[[other,null,0,200]]}};
 if(prebowl)night.prebowl={week:2,bowlers:[3]};
 fixture.push({night,cards:liveStakes(night),rolls,bounds:finalScoreBounds(rolls)});
}
// Every legal tenth-frame prefix after strikes, plus boundary targets and overrides.
function walk(rolls:number[]){add(rolls,270);const state=analyze(rolls);if(!state.complete)for(let pins=0;pins<=state.available;pins++)walk([...rolls,pins]);}
walk(Array(9).fill(10));
for(const rolls of [[],[10,10],Array(18).fill(0),[5,5,10],Array(12).fill(10)])for(const other of [0,10,40,170,180,300]){add(rolls,other);add(rolls,other,0);add(rolls,other,170);add(rolls,other,null,true);}
try {
 const data=join(dir,"fixtures.json"),main=join(dir,"main.swift"),binary=join(dir,"stakes");writeFileSync(data,JSON.stringify(fixture));
 writeFileSync(main,`import Foundation
 struct Fixture: Decodable { var night: Night; var cards: [LiveStake]; var rolls: [Int]; var bounds: LiveStakes.Bounds? }
 let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
 for (i, fixture) in fixtures.enumerated() {
 precondition(LiveStakes.cards(for: fixture.night) == fixture.cards, "Card mismatch at \\(i)")
 precondition(LiveStakes.finalScoreBounds(fixture.rolls) == fixture.bounds, "Bounds mismatch at \\(i)")
 }
 print("Native live stakes: \\(fixtures.count) shared golden cases passed")
 `);
 for(const [command,args] of [["swiftc",["ios/Sources/BowlingGame.swift","ios/Sources/LiveStakes.swift",main,"-o",binary]],[binary,[data]]] as const){const r=spawnSync(command,args,{cwd:root,stdio:"inherit"});if(r.status!==0)throw Error(`${command} failed`);}
}finally{rmSync(dir,{recursive:true,force:true});}

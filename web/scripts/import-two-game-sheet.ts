import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
const id="6f71e01f-9681-4d19-8649-909d2ad03593";
const url=`https://strike-ceiling-web.vercel.app/api/nights/${id}`;
const response=await fetch(url);if(!response.ok)throw Error("Cannot read scorebook");
const current=await response.json();
const finals=[191,124,176,196];
const history=current.state.history;
const second=history.find((g:{game:number})=>g.game===2);
if(!second)throw Error("Missing archived Game 2");
if(JSON.stringify(second.finals)!==JSON.stringify(finals)){
  if(second.finals.some((v:number|null,i:number)=>v!==null&&v!==finals[i]))throw Error("Conflicting previously confirmed final");
  const state=nightSchema.parse({...current.state,history:history.map((g:{game:number})=>g.game===2?{...g,finals}:g)});
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({state,revision:current.revision})});
  if(!saved.ok)throw Error(`Scorebook save failed: ${saved.status}`);
}
const names=["Jeff","Angela","Brian","Kyle"];
for(const [index,scores] of [[112,104,161,166],[156,150,140,237]].entries()){
  const players=names.map((name,i)=>({name,score:scores[i]}));
  const team_total=scores.reduce((a,b)=>a+b,0);
  const path=`imported_team_results?scorebook_id=eq.${id}&team_number=eq.8&game_number=eq.${index+1}`;
  const existing=await database(path);
  if(!existing.length)await database("imported_team_results",{method:"POST",body:JSON.stringify({scorebook_id:id,team_number:8,game_number:index+1,players,team_total,source:"User handwritten two-game sheet 556E99D8-1C8F-4D47-8EC4-1DC4050A84BA"})});
  const verified=await database(path);
  if(verified[0]?.team_total!==team_total)throw Error("Opponent total mismatch");
}
const check=await fetch(url);const verified=await check.json();
if(JSON.stringify(verified.state.history.find((g:{game:number})=>g.game===2).finals)!==JSON.stringify(finals))throw Error("Finals verification failed");
if(JSON.stringify(verified.state.rolls)!==JSON.stringify(current.state.rolls)||verified.state.game!==current.state.game)throw Error("Current game changed during verification");
console.log(JSON.stringify({revision:verified.revision,game2Finals:finals,teamTotals:[552,687],opponentTotals:[543,683],currentGamePreserved:verified.state.game}));

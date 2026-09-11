import {analyze,maximum,validRolls} from "../lib/bowling";
import {database} from "../lib/scorebook-server";
const id="6f71e01f-9681-4d19-8649-909d2ad03593";
const url=`https://strike-ceiling-web.vercel.app/api/nights/${id}`;
const names=["Doug","Mustafa","Kyle","Pete"];
const rolls=[[6,0,10,0,8,0,10,10,10,7,3,8,2],[7,2,5,5,10,9,0,0,10,0,8,7,0,8,0],[6,4,9,0,6,3,9,1,10,7,2,8,2,7,3],[10,10,9,1,8,1,10,9,1,6,2]];
const expected=[[6,24,32,52,79,99,117,null],[9,29,48,57,67,75,82,90],[19,28,37,57,76,85,102,null],[29,49,67,76,96,112,120]];
for(let i=0;i<4;i++){
  if(!validRolls(rolls[i]))throw Error("Invalid rolls");
  if(JSON.stringify(analyze(rolls[i]).frames.slice(0,expected[i].length).map(f=>f.score))!==JSON.stringify(expected[i]))throw Error(`Frame mismatch: ${names[i]}`);
}
const response=await fetch(url);if(!response.ok)throw Error("Load failed");const current=await response.json();
if(current.state.game!==3)throw Error("Current game changed");
if(JSON.stringify(current.state.rolls)!==JSON.stringify(rolls)){
  if(current.revision!==6)throw Error("Newer data exists");
  for(let i=0;i<4;i++)if(current.state.rolls[i].some((v:number,j:number)=>rolls[i][j]!==v))throw Error("Existing roll conflict");
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({state:{...current.state,rolls},revision:current.revision})});
  if(!saved.ok)throw Error(`Save failed: ${saved.status}`);
}
const opponentPath=`imported_team_results?scorebook_id=eq.${id}&team_number=eq.8&game_number=eq.3`;
const opponents=[{name:"Jeff",score:119,complete:false},{name:"Angela",score:87,complete:false},{name:"Brian",score:119,complete:false},{name:"Kyle",score:106,complete:false}];
const previous=await database(opponentPath);
if(!previous.length)await database("imported_team_results",{method:"POST",body:JSON.stringify({scorebook_id:id,team_number:8,game_number:3,players:opponents,team_total:431,source:"IN PROGRESS, resolved scoreboard totals only. Photo 148BBE7D-A98F-4F0E-A40C-E3B1D665E1FA. Not final scores."})});
const checked=await fetch(url);const verified=await checked.json();
if(JSON.stringify(verified.state.rolls)!==JSON.stringify(rolls))throw Error("Read-back mismatch");
const opponentCheck=await database(opponentPath);if(opponentCheck[0]?.team_total!==431)throw Error("Opponent read-back mismatch");
console.log(JSON.stringify({revision:verified.revision,game:3,scores:rolls.map((r,i)=>({name:names[i],score:analyze(r).score,maximum:maximum(r)})),opponents:opponents,teamTotal:429,opponentTotal:431}));

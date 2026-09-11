import {analyze,maximum,validRolls} from "../lib/bowling";
const url="https://strike-ceiling-web.vercel.app/api/nights/6f71e01f-9681-4d19-8649-909d2ad03593";
const names=["Doug","Mustafa","Kyle","Pete"];
const rolls=[[6,0,10,0,8,0,10],[7,2,5,5,10,9,0],[6,4,9,0,6,3],[10,10,9,1]];
const expected=[[6,24,32,null],[9,29,48,57],[19,28,37],[29,49,null]];
for(let i=0;i<4;i++){
  if(!validRolls(rolls[i]))throw Error("Invalid roll sequence");
  const values=analyze(rolls[i]).frames.slice(0,expected[i].length).map(f=>f.score);
  if(JSON.stringify(values)!==JSON.stringify(expected[i]))throw Error(`Cumulative score mismatch for ${names[i]}`);
}
const response=await fetch(url);if(!response.ok)throw Error("Load failed");
const current=await response.json();
if(current.state.game!==3)throw Error("Current game changed");
if(JSON.stringify(current.state.rolls)!==JSON.stringify(rolls)){
  if(current.revision!==3)throw Error("Another update arrived; not overwriting newer scores");
  for(let i=0;i<4;i++)if(current.state.rolls[i].some((v:number,j:number)=>rolls[i][j]!==v))throw Error("Existing rolls differ from photo");
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({state:{...current.state,rolls},revision:current.revision})});
  if(!saved.ok)throw Error(`Save failed (${saved.status})`);
}
const verify=await fetch(url);if(!verify.ok)throw Error("Read-back failed");const actual=await verify.json();
if(JSON.stringify(actual.state.rolls)!==JSON.stringify(rolls))throw Error("Read-back mismatch");
console.log(JSON.stringify({game:actual.state.game,revision:actual.revision,scores:rolls.map((r,i)=>({name:names[i],score:analyze(r).score,maximum:maximum(r)}))}));

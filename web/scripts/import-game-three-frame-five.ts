import {analyze,maximum,validRolls} from "../lib/bowling";
const url="https://strike-ceiling-web.vercel.app/api/nights/6f71e01f-9681-4d19-8649-909d2ad03593";
const names=["Doug","Mustafa","Kyle","Pete"];
const rolls=[[6,0,10,0,8,0,10,10],[7,2,5,5,10,9,0,0,10],[6,4,9,0,6,3,9,1,10],[10,10,9,1,8,1,10]];
const expected=[52,57,57,76];
for(let i=0;i<4;i++)if(!validRolls(rolls[i])||analyze(rolls[i]).score!==expected[i])throw Error(`Invalid photo transcription: ${names[i]}`);
const response=await fetch(url);if(!response.ok)throw Error("Load failed");
const current=await response.json();
if(current.state.game!==3)throw Error("Current game changed");
if(JSON.stringify(current.state.rolls)!==JSON.stringify(rolls)){
  if(current.revision!==4)throw Error("Another update arrived; not overwriting newer scores");
  for(let i=0;i<4;i++)if(current.state.rolls[i].some((v:number,j:number)=>rolls[i][j]!==v))throw Error("Existing rolls differ from photo");
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({state:{...current.state,rolls},revision:current.revision})});
  if(!saved.ok)throw Error(`Save failed (${saved.status})`);
}
const verify=await fetch(url);if(!verify.ok)throw Error("Read-back failed");const actual=await verify.json();
if(JSON.stringify(actual.state.rolls)!==JSON.stringify(rolls))throw Error("Read-back mismatch");
console.log(JSON.stringify({game:actual.state.game,revision:actual.revision,scores:rolls.map((r,i)=>({name:names[i],score:analyze(r).score,maximum:maximum(r)}))}));

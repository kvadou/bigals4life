import {analyze,maximum,validRolls} from "../lib/bowling";
const url="https://strike-ceiling-web.vercel.app/api/nights/6f71e01f-9681-4d19-8649-909d2ad03593";
const rolls=[[6,0,10],[7,2,5],[6,4],[10]];
const names=["Doug","Mustafa","Kyle","Pete"];
if(!rolls.every(validRolls))throw Error("Invalid transcribed rolls");
if(JSON.stringify(rolls.map(r=>analyze(r).score))!==JSON.stringify([6,9,0,0]))throw Error("Displayed scores do not match");
const response=await fetch(url);if(!response.ok)throw Error("Could not load current game");
const current=await response.json();
if(current.state.game!==3)throw Error("Current game is no longer Game 3; left unchanged");
if(JSON.stringify(current.state.rolls)!==JSON.stringify(rolls)){
  if(current.revision!==2||current.state.rolls.some((r:number[])=>r.length))throw Error("Scores changed since review; not overwriting newer entries");
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({revision:current.revision,state:{...current.state,rolls}})});
  if(!saved.ok)throw Error(`Save failed: ${saved.status}`);
}
const verification=await fetch(url);if(!verification.ok)throw Error("Read-back failed");
const actual=await verification.json();
if(actual.state.game!==3||JSON.stringify(actual.state.rolls)!==JSON.stringify(rolls))throw Error("Read-back mismatch");
console.log(JSON.stringify({game:3,revision:actual.revision,bowlers:rolls.map((r,i)=>({name:names[i],rolls:r,score:analyze(r).score,maximum:maximum(r)}))}));

const url="https://strike-ceiling-web.vercel.app/api/nights/6f71e01f-9681-4d19-8649-909d2ad03593";
const finals=[184,107,139,180];
const response=await fetch(url);if(!response.ok)throw Error("Read failed");const current=await response.json();
if(current.state.game!==3)throw Error("Current game changed");
if(JSON.stringify(current.state.finals)!==JSON.stringify(finals)){
  if(current.revision!==7)throw Error("Newer data exists; review before changing");
  const saved=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://strike-ceiling-web.vercel.app"},body:JSON.stringify({state:{...current.state,finals},revision:current.revision})});
  if(!saved.ok)throw Error(`Save failed ${saved.status}`);
}
const check=await fetch(url);const verified=await check.json();
if(JSON.stringify(verified.state.finals)!==JSON.stringify(finals))throw Error("Read-back mismatch");
const ours=[[168,90,138,156],[191,124,176,196],finals];
const theirs=[[112,104,161,166],[156,150,140,237],[133,111,142,222]];
const total=(a:number[])=>a.reduce((s,v)=>s+v,0);
const series=(games:number[][])=>games[0].map((_,i)=>games.reduce((s,g)=>s+g[i],0));
const points=(a:number[],b:number[])=>({team:total(a)>total(b)?5:0,individual:a.reduce((s,v,i)=>s+(v>b[i]?1:0),0)});
console.log(JSON.stringify({revision:verified.revision,finals,gameTotals:ours.map(total),opponentTotals:theirs.map(total),series:series(ours),opponentSeries:series(theirs),pointsAssumingScratchRowMatchups:[...ours.map((g,i)=>points(g,theirs[i])),points(series(ours),series(theirs))]}));

import {expect,test} from "bun:test";
import {analyze} from "../lib/bowling";
import {finalScoreBounds,liveStakes} from "../lib/league/live-stakes";
import type {Night} from "../lib/scorebook";
const lineup=["Pete","Doug","Kyle","Mustafa"].map(name=>({name,handicap:20}));
function night():Night{return {game:1,rolls:[[],[],[],[]],history:[],match:{season:"test",week:2,ours:structuredClone(lineup),opponent:{number:1,name:"Rivals",bowlers:Array.from({length:4},(_,i)=>({name:`Opponent ${i}`,handicap:10}))},opponentGames:[[180,null,0,200]]}};}
test("current lineup maps to roster, adjusted score must be exceeded, unknown stays unknown",()=>{
 const cards=liveStakes(night());expect(cards).toHaveLength(4);
 expect(cards[0]).toMatchObject({name:"Pete",rosterIndex:3,targetScratch:171,status:"needs",game:1});
 expect(cards[1].status).toBe("waiting");expect(cards[1].targetScratch).toBeUndefined();
 expect(cards[2]).toMatchObject({status:"clinch",targetScratch:0});
});
test("final overrides including zero, ties, clinches and impossible targets",()=>{
 const n=night();n.finals=[null,null,null,170];expect(liveStakes(n)[0].status).toBe("tied");
 n.finals[3]=171;expect(liveStakes(n)[0].status).toBe("clinch");
 n.rolls[3]=Array(12).fill(10);n.finals[3]=0;expect(liveStakes(n)[0].status).toBe("outOfReach");
 n.finals=undefined;n.rolls[3]=Array(18).fill(0);expect(liveStakes(n)[0].status).toBe("outOfReach");
 n.match!.opponentGames[0][0]=40;expect(liveStakes(n)[0]).toMatchObject({status:"outOfReach",targetScratch:31});expect(liveStakes(n)[0].detail).toContain("can still tie");
 n.rolls[3]=Array(9).fill(10);expect(liveStakes(n)[0].status).toBe("clinch");
});
test("prebowls, nonleague games, unknown lineup and missing handicaps do not invent stakes",()=>{
 const n=night();n.prebowl={week:2,bowlers:[3]};expect(liveStakes(n)).toEqual([]);delete n.prebowl;
 n.game=4;expect(liveStakes(n)).toEqual([]);n.game=1;
 n.match!.ours[0].handicap=undefined as unknown as number;expect(liveStakes(n)).toHaveLength(3);
 n.match!.ours[0].name="Doug";expect(liveStakes(n)).toEqual([]);
 delete n.match;expect(liveStakes(n)).toEqual([]);
});
test("legal minimum accounts for pending bonus context",()=>{
 expect(finalScoreBounds([10,10])).toMatchObject({minimum:30,maximum:300});
 expect(finalScoreBounds([5,5,10])).toMatchObject({minimum:30});
 expect(finalScoreBounds([...Array(9).fill(10),10,7])).toEqual({minimum:284,maximum:287,complete:false});
 expect(finalScoreBounds([9,9])).toBeNull();
});
test("exhaustive legal tenth-frame completions verify every prefix bound with bonus contexts",()=>{
 for(const firstNine of [Array(18).fill(0),Array(9).fill(10),Array.from({length:18},(_,i)=>i%2?1:9)]){
  const possible=new Map<string,{rolls:number[];min:number;max:number}>();
  function walk(rolls:number[],ancestors:number[][]){
   const state=analyze(rolls),prefixes=[...ancestors,rolls];
   if(state.complete){for(const prefix of prefixes){const key=JSON.stringify(prefix),old=possible.get(key);possible.set(key,{rolls:prefix,min:Math.min(old?.min??Infinity,state.score),max:Math.max(old?.max??-Infinity,state.score)});}return;}
   for(let pins=0;pins<=state.available;pins++)walk([...rolls,pins],prefixes);
  }
  walk(firstNine,[]);
  for(const {rolls,min,max} of possible.values()){const bounds=finalScoreBounds(rolls);expect(bounds?.minimum).toBe(min);expect(bounds?.maximum).toBe(max);}
 }
});

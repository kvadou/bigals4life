import { analyze, maximum, validRolls } from "../bowling";
import type { Night } from "../scorebook";
import { BOWLERS } from "../season";

export type LiveStake = {
  rosterIndex:number; name:string; game:number;
  title:string; detail:string; targetScratch?:number;
  status:"needs"|"clinch"|"tied"|"outOfReach"|"waiting";
};

/** Bounds include every outstanding strike/spare bonus, using legal completions. */
export function finalScoreBounds(rolls:number[]):{minimum:number;maximum:number;complete:boolean}|null {
  if(!validRolls(rolls))return null;
  const state=analyze(rolls), minimumRolls=[...rolls];
  while(!analyze(minimumRolls).complete)minimumRolls.push(0);
  return {minimum:analyze(minimumRolls).score,maximum:maximum(rolls),complete:state.complete};
}

/** Current individual matchups only. Pre-bowl scores are not live league matchups. */
export function liveStakes(night:Night):LiveStake[] {
  const match=night.match;
  if(!match || night.prebowl || night.game<1 || night.game>3)return [];
  const indices=match.ours.map(b=>BOWLERS.indexOf(b.name));
  // Never silently attribute an unknown/duplicated lineup name to another bowler.
  if(indices.length!==4 || indices.some(i=>i<0) || new Set(indices).size!==4)return [];
  const validHandicap=(n:unknown):n is number=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=120;
  const validScore=(n:unknown):n is number=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=300;
  return match.ours.flatMap((ours,slot):LiveStake[]=>{
    const rosterIndex=indices[slot], name=BOWLERS[rosterIndex], opponent=match.opponent.bowlers[slot];
    if(!opponent || !validHandicap(ours.handicap) || !validHandicap(opponent.handicap))return [];
    const context={rosterIndex,name,game:night.game};
    const other=match.opponentGames[night.game-1]?.[slot];
    if(other==null)return [{...context,status:"waiting",title:`${name}'s matchup is waiting`,detail:"Enter the opponent's final score to see the target."}];
    if(!validScore(other))return [];
    const override=night.finals?.[rosterIndex];
    if(override!=null && !validScore(override))return [];
    const bounds=override!=null?{minimum:override,maximum:override,complete:true}:finalScoreBounds(night.rolls[rosterIndex]);
    if(!bounds)return [];
    const tieScratch=other+opponent.handicap-ours.handicap;
    const targetScratch=Math.max(0,tieScratch+1);
    const base={...context,targetScratch};
    if(bounds.minimum>tieScratch)return [{...base,status:"clinch",title:bounds.complete?`${name} wins the matchup`:`${name} has clinched the matchup`,detail:bounds.complete?`${bounds.minimum} scratch, ${bounds.minimum+ours.handicap} with handicap.`:`Even a ${bounds.minimum} finish wins. Maximum: ${bounds.maximum}.`}];
    if(bounds.complete && bounds.minimum===tieScratch)return [{...base,status:"tied",title:`${name}'s matchup is tied`,detail:`${bounds.minimum+ours.handicap} each with handicap.`}];
    if(bounds.maximum<targetScratch)return [{...base,status:"outOfReach",title:bounds.complete?`${name}'s opponent wins`:`${name} cannot pass the opponent`,detail:bounds.maximum===tieScratch?`A ${bounds.maximum} finish can still tie the matchup.`:`Needs ${targetScratch} scratch to win. ${bounds.complete?"Finished":"Maximum"}: ${bounds.maximum}.`}];
    return [{...base,status:"needs",title:`${name} needs ${targetScratch} to win`,detail:`Scratch target, including the handicap difference. Maximum: ${bounds.maximum}.`}];
  });
}

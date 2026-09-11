import { analyze } from "./bowling";
import { parseRollText } from "./photo-import";
export const bowlerNames=["Doug","Mustafa","Kyle","Pete"];
export function parseVoiceRoll(transcript:string,allRolls:number[][]){
  let text=transcript.toLowerCase().trim().replace(/[.,!?]/g,"").replace(/\s+/g," ");
  const match=text.match(/^(doug|mustafa|stafa|kyle|pete)\s+(?:(?:got|rolled|bowled|hit|scored|knocked down)\s+)?(.+)$/);
  if(!match)throw Error("Say one bowler’s name and their roll, like ‘Doug got a strike’ or ‘Kyle seven’.");
  const name=match[1]==="stafa"?"mustafa":match[1];
  const index=bowlerNames.findIndex(n=>n.toLowerCase()===name);
  const words:Record<string,string>={zero:"0",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",strike:"X",spare:"/",gutter:"0",miss:"0",foul:"0"};
  const phrase=match[2].replace(/^a /,"").replace(/ pins?$/ ,"");
  const tokens=phrase.split(/\s+(?:then|and)\s+/).map(s=>words[s]??s);
  if(tokens.length>2||tokens.some(t=>!(/^(10|[0-9]|X|\/)$/.test(t))))throw Error("Use a pin count, strike, spare, or two rolls like ‘Doug six then zero’. Running totals aren’t rolls.");
  const initial=allRolls[index];
  let next=[...initial];
  for(const token of tokens){
    const state=analyze(next);if(state.complete)throw Error(`${bowlerNames[index]} has finished this game.`);
    const partial=state.frames[state.frame-1].rolls;
    if(token==="X" && (state.available!==10 || (partial.length===1&&partial[0]!==10)))throw Error("A strike needs a fresh rack. Say spare if you cleared the second ball.");
    // Validate using the same spare/rack rules as photo review.
    const prefix=next.join(" ");next=parseRollText(`${prefix} ${token}`);
  }
  return {index,name:bowlerNames[index],added:next.slice(initial.length),rolls:next};
}

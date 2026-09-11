import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
const id="6f71e01f-9681-4d19-8649-909d2ad03593";
const game1=await Bun.file("data/2026-09-10-game-1.json").json();
const game2=await Bun.file("data/2026-09-10-game-2.json").json();
const state=nightSchema.parse({
  game:2,
  rolls:game2.bowlers.map((b:{rolls:number[]})=>b.rolls),
  // Mustafa's 124 is confirmed by the later handwritten sheet. Do not invent his missing last roll.
  finals:[191,124,null,null],
  history:[{game:1,rolls:[[],[],[],[]],finals:game1.bowlers.map((b:{score:number})=>b.score)}],
  drinkTargets:game2.drinkTargets,
});
const existing=await database(`scorebooks?id=eq.${id}&select=id`);
if(!existing.length){await database("scorebooks",{method:"POST",body:JSON.stringify({id,state})});console.log("Imported both game records.")}
else console.log("Scorebook already exists; preserved current scores.");
const saved=await database(`scorebooks?id=eq.${id}&select=id,state,revision`);
if(!saved[0])throw Error("Scorebook read-back failed");
console.log(JSON.stringify({id:saved[0].id,revision:saved[0].revision,currentGame:saved[0].state.game,firstGame:saved[0].state.history[0].finals}));
console.log(`https://strike-ceiling-web.vercel.app/?night=${id}`);

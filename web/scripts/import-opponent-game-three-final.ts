import {database} from "../lib/scorebook-server";
const id="6f71e01f-9681-4d19-8649-909d2ad03593";
const path=`imported_team_results?scorebook_id=eq.${id}&team_number=eq.8&game_number=eq.3`;
const players=[{name:"Jeff",score:133,complete:true},{name:"Angela",score:111,complete:true},{name:"Brian",score:142,complete:true},{name:"Kyle",score:222,complete:true}];
const previous=await database(path);
if(previous.length!==1)throw Error("Expected existing opponent snapshot");
if(previous[0].team_total!==431&&previous[0].team_total!==608)throw Error("Unexpected newer opponent result");
if(previous[0].team_total!==608){
  const saved=await database(`${path}&team_total=eq.431`,{method:"PATCH",body:JSON.stringify({players,team_total:608,source:"FINAL Game 3, user photo 3A107585-8249-44D7-81DC-6E40B42DEBCE; series 1834"})});
  if(saved.length!==1)throw Error("Concurrent update; not overwritten");
}
const verified=await database(path);
if(JSON.stringify(verified[0].players)!==JSON.stringify(players)||verified[0].team_total!==608)throw Error("Final read-back mismatch");
console.log(JSON.stringify({game:3,team:8,players,gameTotal:608,seriesTotal:543+683+608}));

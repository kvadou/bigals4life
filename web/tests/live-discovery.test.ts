import {expect,test} from "bun:test";

test("private live discovery counts cameras and never reveals inaccessible rooms",async()=>{
 const script=`
 import {mock} from "bun:test";
 const ids=Array.from({length:7},(_,i)=>"11111111-1111-4111-8111-"+String(i+1).padStart(12,"0"));
 let who={user:{id:"fixture-user",email:"fixture@example.test"},viaCookie:true}, allowed=true, failure=false, calls=[];
 let rooms=ids.map(id=>({name:"ba4l-"+id}));
 const roles=["owner","editor","viewer","none","legacy","missing","viewer"];
 const base={game:1,rolls:[[],[],[],[]],history:[]};
 const match={season:"test",week:8,opponent:{number:1,name:"untrusted",bowlers:[{name:"untrusted",handicap:0}]},ours:Array(4).fill({name:"untrusted",handicap:0}),opponentGames:[]};
 const states=[{...base,prebowl:{week:9,bowlers:[1,1]},match},{...base,match},base,base,base,base,base];
 mock.module("@/lib/auth-server",()=>({identify:async()=>who,access:async(w,id)=>{calls.push("access:"+id);return roles[ids.indexOf(id)]??"none"}}));
 mock.module("@/lib/rate-limit",()=>({allow:()=>allowed}));
 mock.module("@/lib/scorebook-server",()=>({database:async(path,init)=>{if(init)throw Error("Unexpected mutation");calls.push("db:"+path);return [{state:states[ids.findIndex(id=>path.includes(id))]}]}}));
 mock.module("livekit-server-sdk",()=>({TrackSource:{CAMERA:1},RoomServiceClient:class{
 constructor(host,key,secret,options){if(host!=="https://fixture.livekit.cloud/"||options.requestTimeout!==5)throw Error("Configuration mismatch")}
 async listRooms(){calls.push("rooms");if(failure)throw Error("fixture-private-secret");return rooms}
 async listParticipants(room){calls.push("participants:"+room);return [{identity:"PRIVATE",name:"PRIVATE",metadata:"PRIVATE",tracks:[{source:1,muted:room.endsWith("7")},{source:1,muted:true},{source:2,muted:false},{source:3,muted:false}]}]}
 }}));
 process.env.LIVEKIT_URL="wss://fixture.livekit.cloud";process.env.LIVEKIT_API_KEY="fixture-key";process.env.LIVEKIT_API_SECRET="fixture-secret";
 const {GET}=await import("./app/api/live/sessions/route.ts");
 const request=()=>new Request("https://bigals4life.com/api/live/sessions");
 const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+": "+JSON.stringify(a))};
 let response=await GET(request());eq(response.status,200,"Success");eq(response.headers.get("cache-control"),"no-store, private","Private");
 const result=await response.json();eq(result,{configured:true,sessions:[
 {scorebookId:ids[0],kind:"prebowl",week:9,bowlers:["Mustafa"],cameraCount:1},
 {scorebookId:ids[1],kind:"league",week:8,bowlers:["Doug","Mustafa","Kyle","Pete"],cameraCount:1},
 {scorebookId:ids[2],kind:"practice",week:null,bowlers:["Doug","Mustafa","Kyle","Pete"],cameraCount:1}]},"Metadata and grants");
 for(const id of ids.slice(3,6))eq(calls.some(c=>c.startsWith("participants:")&&c.includes(id)),false,"No private participant lookup");
 eq(JSON.stringify(result).includes("PRIVATE"),false,"No personal metadata");
 rooms=[{name:"another-app"},{name:"ba4l-invalid"},{name:"ba4l-"+ids[0]}];states[0]={bad:true};eq((await (await GET(request())).json()).sessions,[],"Ignore malformed state and room names");
 rooms=Array(65).fill({name:"ba4l-"+ids[0]});calls=[];eq((await GET(request())).status,503,"Bound fanout");eq(calls.length,1,"No over-cap lookups");
 failure=true;const failed=await GET(request());eq(failed.status,503,"Provider error");eq((await failed.text()).includes("fixture-private-secret"),false,"Sanitized errors");failure=false;
 delete process.env.LIVEKIT_API_SECRET;calls=[];eq(await (await GET(request())).json(),{configured:false,sessions:[]},"Missing config");eq(calls,[],"No provider calls when unconfigured");
 allowed=false;eq((await GET(request())).status,429,"Rate limit");allowed=true;
 who=null;eq((await GET(request())).status,401,"Requires identity even when unconfigured");
 console.log("Live discovery checks passed");
 `;
 const child=Bun.spawn(["bun","-e",script],{cwd:new URL("..", import.meta.url).pathname,stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(code,err).toBe(0);expect(out).toContain("Live discovery checks passed");
});

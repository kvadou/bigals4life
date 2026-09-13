import { expect, test } from "bun:test";

test("Live Lane verifies membership, camera grants and origin without exposing keys",async()=>{
 const script = `
 import {mock} from "bun:test";
 let who=null, role="none", allowed=true;
 mock.module("@/lib/auth-server",()=>({identify:async()=>who,access:async()=>role}));
 mock.module("@/lib/scorebook-server",()=>({sameOrigin:r=>r.headers.get("origin")===new URL(r.url).origin}));
 mock.module("@/lib/rate-limit",()=>({allow:()=>allowed}));
 process.env.LIVEKIT_URL="wss://test.livekit.cloud";
 process.env.LIVEKIT_API_KEY="fixture-key";
 process.env.LIVEKIT_API_SECRET=crypto.randomUUID();
 const {POST}=await import("./app/api/live/token/route.ts");
 const id="11111111-1111-4111-8111-111111111111";
 const req=(mode="watch",origin="https://bigals4life.com",extra={})=>new Request("https://bigals4life.com/api/live/token",{method:"POST",headers:{origin},body:JSON.stringify({scorebookId:id,mode,...extra})});
 const assert=(v,e,m)=>{if(v!==e)throw Error(m+": "+v+" != "+e)};
 assert((await POST(req())).status,401,"Anonymous rejected regardless of rollout");
 who={user:{id:"user-1",email:"fixture@example.test"},viaCookie:true};
 assert((await POST(req("watch","https://other.example"))).status,403,"Cross-origin cookie denied");
 who.viaCookie=false;
 for(role of ["legacy","none","missing"])assert((await POST(req())).status,404,"Nonmember or public book denied");
 role="viewer";assert((await POST(req("publish"))).status,403,"Viewer cannot publish");
 for(role of ["viewer","editor","owner"]) {
  for(const mode of role==="viewer"?["watch"]:["watch","publish"]) {
   const r=await POST(req(mode));assert(r.status,200,"Member joins");
   assert(r.headers.get("cache-control"),"no-store, private","No caching");
   const b=await r.json();const p=JSON.parse(Buffer.from(b.participantToken.split(".")[1],"base64url").toString());
   assert(p.video.room,"ba4l-"+id,"Room bound");
   assert(p.video.canPublish,mode==="publish","Publish grant");
   assert(p.video.canSubscribe,true,"Watch grant");assert(p.video.canPublishData,false,"No trusted-event spoofing");
   assert(p.video.canUpdateOwnMetadata,false,"No metadata spoofing");
   assert(JSON.stringify(p.video.canPublishSources),JSON.stringify(mode==="publish"?["camera"]:[]),"Camera only");
   assert(p.exp-p.nbf<=120,true,"Short initial token lifetime");
   assert(p.sub.startsWith("user-1:"),true,"Identity bound to verified user");
   assert(b.secret,undefined,"No secret");assert(b.apiKey,undefined,"No API key");
  }
 }
 assert((await POST(req("admin"))).status,400,"Invalid mode");
 assert((await POST(req("watch",undefined,{room:"other"}))).status,400,"Room override forbidden");
 assert((await POST(req("watch",undefined,{scorebookId:"x&owner_id=not.null"}))).status,400,"Invalid ID");
 allowed=false;assert((await POST(req())).status,429,"Rate limited");allowed=true;
 delete process.env.LIVEKIT_API_SECRET;assert((await POST(req())).status,503,"Missing configuration");
 console.log("Live token permission checks passed");
 `;
 const child=Bun.spawn(["bun","-e",script],{cwd:new URL("..", import.meta.url).pathname,stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(code,err).toBe(0);expect(out).toContain("Live token permission checks passed");
});

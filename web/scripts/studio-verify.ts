/** Disposable local studio QA. Synthetic canvas camera, actual browser encoders, no production calls.
 * Run from either cwd: bun web/scripts/studio-verify.ts. Avoid another Next build while running. */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve(import.meta.dir,".."); const out="/tmp/ba4l-studio-qa"; await mkdir(out,{recursive:true});
const origin="http://127.0.0.1:4326", userId="a1111111-1111-4111-8111-111111111111", id="b2222222-2222-4222-8222-222222222222", preId="c3333333-3333-4333-8333-333333333333";
const user={id:userId,aud:"authenticated",role:"authenticated",email:"studio.fixture@example.test",email_confirmed_at:"2026-09-01T00:00:00Z",app_metadata:{},user_metadata:{},identities:[],created_at:"2026-09-01T00:00:00Z"};
const fixture=Bun.serve({port:4325,hostname:"127.0.0.1",fetch(req){return Response.json(new URL(req.url).pathname==="/auth/v1/user"?user:[]);}});
const log=Bun.file(`${out}/next.log`);
const next=Bun.spawn(["bun","node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","4326"],{cwd:root,stdout:log,stderr:log,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:4325",NEXT_PUBLIC_SUPABASE_ANON_KEY:"fixture-key",SUPABASE_URL:"http://127.0.0.1:4325",SUPABASE_SERVICE_ROLE_KEY:"fixture-service",BAFL_ADMIN_EMAILS:user.email}});
let browser:any; let checks=0;
function check(value:unknown,description:string){if(!value)throw new Error(description);checks++;}
try {
 for(let i=0;i<100;i++){try{if((await fetch(origin+"/login")).ok)break;}catch{} await Bun.sleep(500);}
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
 browser=await chromium.launch({channel:"chrome",headless:true}); const context=await browser.newContext({acceptDownloads:true});
 const jwt=[Buffer.from('{"alg":"HS256"}').toString("base64url"),Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600,role:"authenticated"})).toString("base64url"),"fixture-signature"].join(".");
 await context.addCookies([{name:"sb-127-auth-token",value:`base64-${Buffer.from(JSON.stringify({access_token:jwt,refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})).toString("base64url")}`,domain:"127.0.0.1",path:"/"}]);
 await context.storageState({path:`${out}/storage.json`});
 await context.addInitScript(()=>{
  const w=window as any;w.gumCalls=[];w.syntheticTracks=[];
  Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value:async(constraints:MediaStreamConstraints)=>{
   w.gumCalls.push(constraints);const canvas=document.createElement("canvas");canvas.width=640;canvas.height=480;const ctx=canvas.getContext("2d")!;let x=0;
   const draw=()=>{ctx.fillStyle="#22b44c";ctx.fillRect(0,0,320,480);ctx.fillStyle="#ae36c9";ctx.fillRect(320,0,320,480);ctx.fillStyle="white";ctx.fillRect((x++*4)%620,150,20,150);};draw();
   const timer=setInterval(draw,66);const stream=canvas.captureStream(15);const track=stream.getVideoTracks()[0];const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};w.syntheticTracks.push(track);return stream;
  }});
 });
 const errors:string[]=[];const calls:{path:string;method:string;body:any}[]=[];const session={id,activity:"practice",audience:"invited",scorebookId:null,teamScopeId:null,title:"Fixture practice",expiresAt:new Date(Date.now()+3600000).toISOString(),canPublish:true,isOwner:true};
 let created:any=null;
 await context.route("**/*",async(route:any)=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin && !["blob:","data:"].includes(url.protocol))return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  const body=request.postDataJSON?.();calls.push({path:url.pathname,method:request.method(),body});
  if(url.pathname==="/api/season")return route.fulfill({json:{weeks:[{id,week:1,bowledOn:"2026-09-10",prebowl:null},{id:preId,week:2,bowledOn:"2026-09-12",prebowl:{week:2,bowlers:[0]}}]}});
  if(url.pathname.endsWith("/token"))return route.fulfill({status:403,json:{error:"Fixture stopped before opening a network room."}});
  if(url.pathname.endsWith("/invites"))return route.fulfill({json:{invited:true}});
  if(url.pathname==="/api/live/v2/sessions" && request.method()==="POST"){created={...session,...body};return route.fulfill({json:{session:created}});}
  if(url.pathname==="/api/live/v2/sessions")return route.fulfill({json:{configured:true,sessions:[session]}});
  if(url.pathname===`/api/live/v2/sessions/${id}`)return route.fulfill({json:{session}});
  return route.fulfill({json:{}});
 });
 const page=await context.newPage();page.on("pageerror",(error:Error)=>errors.push(error.message));
 for(const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,1000],[1920,1080],[844,390]]){
  await page.setViewportSize({width,height});await page.goto(origin+"/studio");await page.getByRole("heading",{name:"Your lane. Your audience."}).waitFor();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`idle overflow ${width}`);
  await page.screenshot({path:`${out}/idle-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.goto(origin+"/studio");
 await page.getByRole("button",{name:"Start private camera",exact:true}).click();await page.getByText("Frames visible on this device",{exact:true}).waitFor();
 check(calls.filter(call=>call.path.startsWith("/api/live/v2")).length===0,"only-me has no room API calls");
 check(await page.evaluate(()=>(window as any).gumCalls.every((call:any)=>call.audio===false)),"microphone must stay off");
 await page.getByRole("button",{name:"Start recording",exact:true}).click();await page.waitForTimeout(2200);await page.getByRole("button",{name:"Stop & save recording"}).click();await page.getByRole("link",{name:"Download",exact:true}).waitFor();
 const downloadPromise=page.waitForEvent("download");await page.getByRole("link",{name:"Download",exact:true}).click();const download=await downloadPromise;await download.saveAs(`${out}/manual-recording.${download.suggestedFilename().endsWith("mp4")?"mp4":"webm"}`);
 await page.getByRole("button",{name:"Enable last-shot capture"}).click();await page.waitForTimeout(11000);await page.getByRole("button",{name:/Save last \d+ seconds/}).click();await page.waitForFunction(()=>document.querySelectorAll(".studio-library li").length===2,{timeout:20000});
 check(await page.locator(".studio-library li").count()===2,"manual and rolling clips saved");
 await page.getByLabel("Compare with").selectOption({index:1});await page.getByRole("button",{name:"Play from start",exact:true}).click();await page.waitForTimeout(800);
 check(await page.locator(".studio-comparison video").evaluateAll((videos:HTMLVideoElement[])=>videos.length===2&&videos.every(video=>video.readyState>=2&&video.videoWidth>0&&video.playbackRate===0.5)),"both saved clips decode at half speed");
 await page.screenshot({path:`${out}/phone-clips.png`,fullPage:true});
 await page.getByRole("button",{name:"Stop private camera",exact:true}).click();
 check(await page.evaluate(()=>(window as any).syntheticTracks.every((track:MediaStreamTrack)=>track.readyState==="ended")),"leave stops camera tracks");
 await page.getByLabel("Who can watch?").selectOption("invited");await page.getByLabel("What are you doing?").selectOption("social");
 check(await page.getByLabel("Attach to a scorebook").count()===0,"social has no competitive scorebook");
 await page.getByRole("button",{name:"Start shared camera",exact:true}).click();await page.getByText("Fixture stopped before opening a network room.",{exact:true}).waitFor();
 check(created?.activity==="social"&&created?.audience==="invited"&&created?.scorebookId===null,"social creation contract");
 await page.getByLabel("Viewer email").fill("viewer@example.test");await page.getByRole("button",{name:"Give viewer access"}).click();await page.getByText(/Viewer access added/).waitFor();
 check(calls.some(call=>call.path.endsWith("/invites")&&call.body.email==="viewer@example.test"),"owner invite contract");
 await page.getByRole("button",{name:"Set up another studio"}).click();await page.getByLabel("What are you doing?").selectOption("prebowl");await page.getByLabel("Who can watch?").selectOption("team");
 await page.getByLabel("Audience team").selectOption(id);await page.getByLabel("Attach to a scorebook").selectOption(preId);
 check(await page.getByLabel("Attach to a scorebook").locator("option").count()===2,"prebowl only matching book");
 await page.getByRole("button",{name:"Start shared camera",exact:true}).click();await page.getByText("Fixture stopped before opening a network room.",{exact:true}).waitFor();
 check(created?.teamScopeId===id&&created?.scorebookId===preId,"team anchor independent of scorebook");
 check(errors.length===0,`browser errors: ${errors.join("; ")}`);
 console.log(`Studio QA passed: ${checks} checks. Artifacts ${out}`);
 if(process.env.STUDIO_KEEP_SERVER==="1"){console.log("Keeping local server for independent pw-verify; stop this process to clean up.");await new Promise<void>(done=>{process.once("SIGTERM",done);process.once("SIGINT",done);});}
} finally {await browser?.close();next.kill();fixture.stop();}

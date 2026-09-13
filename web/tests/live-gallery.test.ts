import {expect,test} from "bun:test";

test("gallery access, moderation, attribution and bounded events",async()=>{
 const script=String.raw`
 import {mock} from 'bun:test';
 const {verifiedDisplayName}=await import('./lib/auth-server');
 let checks=0;const eq=(a,b,label)=>{checks++;if(a!==b)throw Error(label+': '+JSON.stringify(a)+' != '+JSON.stringify(b))};
 eq(verifiedDisplayName({display_name:'  Doug  ',full_name:'Other'}),'Doug','verified display name preferred');
 eq(verifiedDisplayName({display_name:'me@example.test',full_name:'Pete'}),'Pete','email not an author');
 eq(verifiedDisplayName({display_name:3,full_name:null}),undefined,'invalid metadata fallback');
 eq(verifiedDisplayName({display_name:'x'.repeat(50)}).length,40,'bounded author');
 const owner={user:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',displayName:'Doug'},viaCookie:false};
 let who=owner,role='editor',limited=false;const limits=[];
 const id='22222222-2222-4222-8222-222222222222';
 const session={id,owner_id:owner.user.id,activity:'social',audience:'team',team_scope_id:id,scorebook_id:null,title:'Friends',expires_at:new Date(Date.now()+3600000).toISOString(),ended_at:null,gallery_paused:false};
 let events=[];
 mock.module('./lib/auth-server',()=>({identify:async()=>who,isTeammate:async()=>true,access:async()=>role}));
 mock.module('./lib/rate-limit',()=>({allow:(key,max)=>{limits.push([key,max]);return !limited}}));
 mock.module('./lib/scorebook-server',()=>({sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,database:async(path,init={})=>{
  const [table,query='']=path.split('?'),params=new URLSearchParams(query);
  if(table==='live_sessions'){if(params.get('id')!=='eq.'+id)return [];if(init.method==='PATCH')Object.assign(session,JSON.parse(init.body));return [session]}
  if(table!=='live_gallery_events')throw Error('Unexpected table '+table);
  if(init.method==='POST'){const item=JSON.parse(init.body);if(events.some(e=>e.session_id===item.session_id&&e.event_slot===item.event_slot))throw Error('unique slot');events.push(item);return [item]}
  const matches=e=>['id','session_id'].every(k=>!params.has(k)||params.get(k)==='eq.'+e[k]);
  if(init.method==='DELETE'){events=events.filter(e=>!matches(e));return []}
  let found=events.filter(matches);if(params.get('order')==='event_slot.asc')found.sort((a,b)=>a.event_slot-b.event_slot);else if(params.has('order'))found.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));const offset=Number(params.get('offset')||0);return found.slice(offset,offset+Math.min(1000,Number(params.get('limit')||1000)));
 }}));
 const {liveV2}=await import('./lib/live-v2');
 const req=(method='GET',body=null,sessionID=id,origin='https://ba4l.example')=>liveV2(new Request('https://ba4l.example/api/live/v2/sessions/'+sessionID+'/gallery',{method,headers:{origin},...(method==='GET'?{}:{body:JSON.stringify(body)})}),'gallery',sessionID);
 who=null;eq((await req()).status,401,'signed out');who=owner;
 who.viaCookie=true;eq((await req('POST',{kind:'comment',text:'hi'},id,'https://other.example')).status,403,'cookie origin');who.viaCookie=false;
 role='none';eq((await req()).status,404,'owner revoked scope');eq((await req('POST',{kind:'comment',text:'hi'})).status,404,'revoked post');role='editor';
 eq((await req('POST',{kind:'comment',text:'hi',author:'Forged'})).status,400,'author spoof denied');
 eq((await req('POST',{kind:'comment',text:'hi',userId:owner.user.id})).status,400,'author id spoof denied');
 for(const text of ['', '   ','a'.repeat(281)])eq((await req('POST',{kind:'comment',text})).status,400,'text bound');
 eq((await req('POST',{kind:'reaction',text:'💥'})).status,400,'unlisted reaction');
 for(const text of ['🎳','🔥','👏','😂','💪','🦃'])eq((await req('POST',{kind:'reaction',text})).status,201,'allowed reaction');
 let response=await req('POST',{kind:'coach',text:'  Stay balanced  '});let event=(await response.json()).event;eq(event.text,'Stay balanced','trim text');eq(event.author,'Doug','server author');eq(event.isMine,true,'own event');eq(event.user_id,undefined,'no raw identity');
 const inert='<img src=x onerror=alert(1)>';response=await req('POST',{kind:'comment',text:inert});eq((await response.json()).event.text,inert,'plain data preserved for text renderer');
 const guest={user:{id:'33333333-3333-4333-8333-333333333333',email:'guest@example.test'},viaCookie:false};who=guest;
 response=await req('POST',{kind:'comment',text:'Nice shot'});eq((await response.json()).event.author,'Teammate','email never fallback');
 eq((await req('PATCH',{paused:true})).status,403,'guest cannot pause');eq((await req('PATCH',{removeId:event.id})).status,403,'guest cannot remove');
 eq((await (await req()).json()).events.find(e=>e.id===event.id).isMine,false,'other author is not mine');
 who=owner;eq((await req('PATCH',{paused:true})).status,200,'host pause');eq((await req('POST',{kind:'comment',text:'owner'})).status,403,'paused host cannot post');who=guest;eq((await req('POST',{kind:'comment',text:'guest'})).status,403,'paused guest cannot post');eq((await (await req()).json()).paused,true,'pause returned');
 who=owner;eq((await req('PATCH',{paused:false})).status,200,'host resume');eq((await req('PATCH',{paused:false,removeId:event.id})).status,400,'strict moderation command');
 eq((await req('PATCH',{removeId:event.id})).status,200,'host removes');eq(events.some(e=>e.id===event.id),false,'event deleted');
 const foreign={id:crypto.randomUUID(),session_id:crypto.randomUUID(),event_slot:0,created_at:new Date().toISOString()};events.push(foreign);eq((await req('PATCH',{removeId:foreign.id})).status,200,'scoped delete idempotent');eq(events.includes(foreign),true,'cannot delete other session event');
 events=Array.from({length:60},(_,i)=>({id:crypto.randomUUID(),session_id:id,event_slot:i,user_id:owner.user.id,kind:'comment',text:String(i),author:'Doug',created_at:new Date(1700000000000+i*1000).toISOString()}));
 const feed=await (await req()).json();eq(feed.events.length,50,'latest50');eq(feed.events[0].text,'10','oldest retained first');eq(feed.events[49].text,'59','latest last');
 events=Array.from({length:1500},(_,i)=>({session_id:id,event_slot:i}));eq((await req('POST',{kind:'comment',text:'past first page'})).status,201,'slot allocation beyond PostgREST1000 cap');eq(events.at(-1).event_slot,1500,'correct unused paginated slot');
 events=Array.from({length:2000},(_,i)=>({session_id:id,event_slot:i}));eq((await req('POST',{kind:'comment',text:'full'})).status,409,'cap2000');
 session.ended_at=new Date().toISOString();eq((await req()).status,404,'ended hidden');session.ended_at=null;session.expires_at=new Date(Date.now()-1).toISOString();eq((await req()).status,404,'expired hidden');session.expires_at=new Date(Date.now()+3600000).toISOString();
 limited=true;eq((await req('POST',{kind:'comment',text:'fast'})).status,429,'send limited');limited=false;
 eq(limits.some(([k,n])=>k.includes('gallery-post:')&&n===12),true,'post12');eq(limits.some(([k,n])=>k.includes('gallery-get:')&&n===60),true,'poll separately limited');eq(limits.some(([k,n])=>k.includes('gallery-patch:')&&n===20),true,'moderation limited');
 console.log('Gallery checks passed: '+checks);
 `;
 const child=Bun.spawn(["bun","-e",script],{cwd:new URL("..",import.meta.url).pathname,stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(code,err).toBe(0);expect(out).toContain("Gallery checks passed");
});

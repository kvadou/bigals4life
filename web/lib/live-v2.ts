import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { access, identify, isTeammate, type Identity } from "./auth-server";
import { database, sameOrigin } from "./scorebook-server";
import { allow } from "./rate-limit";

const uuid=z.string().uuid();
const createSchema=z.object({activity:z.enum(["league","prebowl","practice","social"]),audience:z.enum(["team","invited"]),title:z.string().trim().min(1).max(100),scorebookId:uuid.nullish(),teamScopeId:uuid.nullish(),durationMinutes:z.number().int().min(5).max(480).default(120)}).strict();
const counter=z.number().int().min(0).max(1_000_000_000);
const metrics=z.object({frames:counter,bytes:counter}).strict();
const healthSchema=z.object({connectionId:uuid,received:z.array(metrics.extend({trackSid:z.string().regex(/^TR_[A-Za-z0-9_-]{1,100}$/)})).max(16),outgoing:metrics.optional()}).strict();
type Session={id:string;owner_id:string;activity:string;audience:string;scorebook_id:string|null;team_scope_id:string|null;title:string;expires_at:string;ended_at:string|null;gallery_paused?:boolean};
type Connection={id:string;session_id:string;user_id:string;participant_identity:string;mode:string;expires_at:string;reported_at:string|null;received:z.infer<typeof healthSchema>["received"];outgoing:z.infer<typeof metrics>|null};
class Failure extends Error { constructor(readonly status:number,message:string){super(message);} }
const fail=(status:number,message:string):never=>{throw new Failure(status,message);};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store, private","Pragma":"no-cache"}});
const room=(id:string)=>`ba4l-v2-${id}`;
const competitive=(s:{activity:string})=>s.activity==="league"||s.activity==="prebowl";
const active=(s:Session)=>!s.ended_at&&Date.parse(s.expires_at)>Date.now();
function configuration(){
 const {LIVEKIT_URL:url,LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret}=process.env;
 if(!url||!key||!secret)return null;
 const host=new URL(url);if(host.protocol!=="wss:"||host.username||host.password||host.search||host.hash)throw new Error("Invalid configuration");
 host.protocol="https:";
 return {url,key,secret,client:new RoomServiceClient(host.toString(),key,secret,{requestTimeout:5})};
}
async function body<T>(r:Request,schema:z.ZodType<T>):Promise<T>{
 if(Number(r.headers.get("content-length")??0)>8192)fail(413,"Request too large.");
 const text=await r.text();if(text.length>8192)fail(413,"Request too large.");
 try{return schema.parse(JSON.parse(text));}catch{return fail(400,"Check the session details and try again.");}
}
async function caller(r:Request,action:string){
 const who=await identify(r);if(!who)return fail(401,"Sign in to open this live session.");
 if(r.method!=="GET"&&who.viaCookie&&!sameOrigin(r))fail(403,"Open this session from BA4L.");
 const limit=action==="gallery-post"?12:action==="gallery-patch"?20:action==="create"?6:action==="invites"?20:action==="token"?30:60;
 if(!allow(`live-v2:${action}:${who.user.id}`,limit,60_000))fail(429,"Please wait a moment and try again.");
 return who;
}
async function permissions(s:Session,who:Identity){
 if(!active(s))return {read:false,publish:false};
 const owner=s.owner_id===who.user.id;
 const bookRole=competitive(s)&&s.scorebook_id?await access(who,s.scorebook_id):null;
 // Competitive footage remains private to people with access to its scorebook.
 if(competitive(s)&&!["owner","editor","viewer"].includes(bookRole??""))return {read:false,publish:false};
 let read=owner;
 // Team scope is a live permission boundary, including for the session owner.
 if(s.audience==="team")read=!!s.team_scope_id&&["owner","editor","viewer"].includes(await access(who,s.team_scope_id));
 if(!read&&s.audience==="invited")read=(await database(`live_session_invites?session_id=eq.${s.id}&email=eq.${encodeURIComponent(who.user.email.toLowerCase())}&select=session_id&limit=1`)).length>0;
 return {read,publish:owner&&(!competitive(s)||bookRole==="owner"||bookRole==="editor")};
}
async function load(id:string,who:Identity){
 if(!uuid.safeParse(id).success)return fail(404,"Live session not available.");
 const rows:Session[]=await database(`live_sessions?id=eq.${id}&select=*&limit=1`);
 const session=rows[0];if(!session)return fail(404,"Live session not available.");
 const grants=await permissions(session,who);if(!grants.read)return fail(404,"Live session not available.");
 return {session,grants};
}
const view=(s:Session,canPublish:boolean,isOwner:boolean)=>({id:s.id,activity:s.activity,audience:s.audience,scorebookId:s.scorebook_id,teamScopeId:s.team_scope_id,title:s.title,expiresAt:s.expires_at,canPublish,isOwner});
export async function liveV2(request:Request,action:"list"|"create"|"read"|"end"|"token"|"health"|"invites"|"gallery",id?:string){
 try{
  const who=await caller(request,action==="gallery"?`gallery-${request.method.toLowerCase()}`:action);
  if(action==="create"){
   if(!await isTeammate(who))return fail(403,"Team membership is required to start a live session.");
   const data=await body(request,createSchema);
   if(competitive(data)!==!!data.scorebookId)fail(400,"League and pre-bowl sessions need a scorebook. Practice and social sessions do not use one.");
   if((data.audience==="team")!==!!data.teamScopeId)fail(400,"Team sessions need a team scope. Invited sessions do not use one.");
   if(data.scorebookId&&!["owner","editor"].includes(await access(who,data.scorebookId)))fail(403,"Editing access to this scorebook is required.");
   if(data.teamScopeId&&!["owner","editor","viewer"].includes(await access(who,data.teamScopeId)))fail(403,"Choose a team you belong to.");
   if(data.scorebookId){
    const books:{state:{prebowl?:unknown;match?:unknown}}[]=await database(`scorebooks?id=eq.${data.scorebookId}&select=state&limit=1`);
    const state=books[0]?.state;
    if(!state||(data.activity==="prebowl"?!state.prebowl:!state.match||!!state.prebowl))fail(400,"Choose a scorebook matching this session activity.");
   }
   const session:Session={id:crypto.randomUUID(),owner_id:who.user.id,activity:data.activity,audience:data.audience,title:data.title,scorebook_id:data.scorebookId??null,team_scope_id:data.teamScopeId??null,expires_at:new Date(Date.now()+data.durationMinutes*60_000).toISOString(),ended_at:null};
   await database("live_sessions",{method:"POST",body:JSON.stringify(session)});
   return reply({session:view(session,true,true)},201);
  }
  if(action==="list"){
   const rows:Session[]=await database(`live_sessions?ended_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc,id.asc&limit=201`);
   if(rows.length>200)fail(503,"Live sessions are busy. Open your session directly.");
   const sessions=[];for(const s of rows){const p=await permissions(s,who);if(p.read)sessions.push(view(s,p.publish,s.owner_id===who.user.id));}
   return reply({sessions,configured:!!configuration()});
  }
  const {session:s,grants}=await load(id??"",who);
  if(action==="read")return reply({session:view(s,grants.publish,s.owner_id===who.user.id)});
  if(action==="gallery"){
   type Event={id:string;user_id:string;kind:"reaction"|"comment"|"coach";text:string;author:string;created_at:string};
   const eventView=(event:Event)=>({id:event.id,kind:event.kind,text:event.text,author:event.author,createdAt:event.created_at,isMine:event.user_id===who.user.id});
   if(request.method==="GET"){
    const events:Event[]=await database(`live_gallery_events?session_id=eq.${s.id}&select=id,user_id,kind,text,author,created_at&order=created_at.desc,id.desc&limit=50`);
    return reply({events:events.reverse().map(eventView),paused:s.gallery_paused===true});
   }
   if(request.method==="PATCH"){
    if(s.owner_id!==who.user.id)fail(403,"Only the host can moderate the gallery.");
    const change=await body(request,z.union([z.object({paused:z.boolean()}).strict(),z.object({removeId:uuid}).strict()]));
    if("paused" in change)await database(`live_sessions?id=eq.${s.id}`,{method:"PATCH",body:JSON.stringify({gallery_paused:change.paused})});
    else await database(`live_gallery_events?id=eq.${change.removeId}&session_id=eq.${s.id}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
    return reply({updated:true});
   }
   if(s.gallery_paused)fail(403,"The host has paused the gallery.");
   const data=await body(request,z.object({kind:z.enum(["reaction","comment","coach"]),text:z.string().trim().min(1).max(280)}).strict());
   if(data.kind==="reaction"&&!["🎳","🔥","👏","😂","💪","🦃"].includes(data.text))fail(400,"Choose one of the gallery reactions.");
   // PostgREST may cap a response at 1000 rows, so read bounded pages.
   const rows:{event_slot:number}[]=[];
   for(let offset=0;offset<2000;offset+=500){
    const page:{event_slot:number}[]=await database(`live_gallery_events?session_id=eq.${s.id}&select=event_slot&order=event_slot.asc&limit=500&offset=${offset}`);
    rows.push(...page);if(page.length<500)break;
   }
   const used=new Set(rows.map(row=>row.event_slot));
   const slot=Array.from({length:2000},(_,index)=>index).find(index=>!used.has(index));
   if(rows.length>=2000||slot===undefined)fail(409,"This gallery is full. The host can remove older posts.");
   const author=who.user.displayName?.trim().slice(0,40);
   const event:Event={id:crypto.randomUUID(),user_id:who.user.id,kind:data.kind,text:data.text,author:author&&!author.includes("@")?author:"Teammate",created_at:new Date().toISOString()};
   await database("live_gallery_events",{method:"POST",body:JSON.stringify({...event,session_id:s.id,event_slot:slot})});
   return reply({event:eventView(event)},201);
  }

  if(action==="end"){
   await body(request,z.object({ended:z.literal(true)}).strict());
   if(s.owner_id!==who.user.id)fail(403,"Only the session owner can end it.");
   await database(`live_sessions?id=eq.${s.id}`,{method:"PATCH",body:JSON.stringify({ended_at:new Date().toISOString()})});
   // Ending access is durable even if the media service is temporarily unreachable.
   let disconnected=false;try{const c=configuration();if(c){await c.client.deleteRoom(room(s.id));disconnected=true;}}catch{}
   return reply({ended:true,disconnected});
  }
  if(action==="invites"){
   if(s.owner_id!==who.user.id||s.audience!=="invited")fail(403,"Only the owner of an invited session can invite people.");
   const {email}=await body(request,z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase())}).strict());
   const invites=await database(`live_session_invites?session_id=eq.${s.id}&select=email&limit=51`);
   if(invites.length>=50&&!invites.some((i:{email:string})=>i.email===email))fail(409,"This session has reached its invite limit.");
   await database("live_session_invites?on_conflict=session_id,email",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({session_id:s.id,email})});
   return reply({invited:true});
  }
  if(action==="token"){
   const {mode}=await body(request,z.object({mode:z.enum(["watch","publish"])}).strict());
   if(mode==="publish"&&!grants.publish)fail(403,"Only the session owner can publish a camera.");
   const c=configuration();if(!c)return fail(503,"Shared video is not configured.");
   // Issued connections are bounded across all participants for this session.
   // Clients recheck access with GET session, never by minting replacement tokens.
   const issued=await database(`live_session_connections?session_id=eq.${s.id}&select=id,connection_slot&limit=201`);
   if(issued.length>=200)fail(409,"This session has reached its connection limit. Start a new session.");
   const slots=new Set(issued.map((row:{connection_slot:number})=>row.connection_slot));
   const connectionSlot=Array.from({length:200},(_,slot)=>slot).find(slot=>!slots.has(slot));
   if(connectionSlot===undefined)fail(409,"This session has reached its connection limit. Start a new session.");
   const connectionId=crypto.randomUUID(),identity=`live:${crypto.randomUUID()}`;
   await database("live_session_connections",{method:"POST",body:JSON.stringify({id:connectionId,connection_slot:connectionSlot,session_id:s.id,user_id:who.user.id,participant_identity:identity,mode,expires_at:s.expires_at})});
   const token=new AccessToken(c.key,c.secret,{identity,ttl:Math.max(1,Math.min(120,Math.floor((Date.parse(s.expires_at)-Date.now())/1000))),name:mode==="publish"?"Lane camera":"Guest"});
   token.addGrant({roomJoin:true,room:room(s.id),canSubscribe:true,canPublish:mode==="publish",canPublishSources:mode==="publish"?[TrackSource.CAMERA]:[],canPublishData:false,canUpdateOwnMetadata:false});
   return reply({serverUrl:c.url,participantToken:await token.toJwt(),connectionId});
  }
  const c=configuration();if(!c)return fail(503,"Shared video is not configured.");
  const participants=await c.client.listParticipants(room(s.id));
  const cameras=new Set(participants.flatMap(p=>p.tracks.filter(t=>t.source===TrackSource.CAMERA&&!t.muted).map(t=>t.sid)));
  if(request.method==="POST"){
   const report=await body(request,healthSchema);
   const rows:Connection[]=await database(`live_session_connections?id=eq.${report.connectionId}&session_id=eq.${s.id}&user_id=eq.${who.user.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
   const connection=rows[0];if(!connection)fail(404,"Live connection not available.");
   if(connection.mode==="publish"&&!grants.publish)fail(403,"Publishing access is no longer available. Stop this camera and join as a viewer.");
   const participant=participants.find(p=>p.identity===connection.participant_identity);if(!participant)return fail(409,"Connect to live video before reporting its health.");
   if(report.outgoing&&connection.mode!=="publish")fail(403,"This connection cannot publish.");
   const own=new Set(participant.tracks.map(t=>t.sid));
   if(new Set(report.received.map(r=>r.trackSid)).size!==report.received.length||report.received.some(r=>!cameras.has(r.trackSid)||own.has(r.trackSid)))fail(400,"Report only current camera tracks received by this connection.");
   if(report.outgoing&&!participant.tracks.some(t=>cameras.has(t.sid)))fail(409,"Publish a camera before reporting outgoing frames.");
   await database(`live_session_connections?id=eq.${connection.id}&session_id=eq.${s.id}&user_id=eq.${who.user.id}`,{method:"PATCH",body:JSON.stringify({reported_at:new Date().toISOString(),received:report.received,outgoing:report.outgoing??null})});
   return reply({accepted:true});
  }
  const recent:Connection[]=await database(`live_session_connections?session_id=eq.${s.id}&reported_at=gte.${encodeURIComponent(new Date(Date.now()-15_000).toISOString())}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=201`);
  if(recent.length>200)fail(503,"Health is temporarily unavailable.");
  const present=new Set(participants.map(p=>p.identity));
  const connections=recent.filter(c=>present.has(c.participant_identity));
  const receivingCount=connections.filter(c=>c.received?.some(r=>cameras.has(r.trackSid)&&r.frames>0&&r.bytes>0)).length;
  return reply({connections:connections.length,connectedCount:participants.length,cameraCount:cameras.size,receivingCount,observedAt:new Date().toISOString(),evidence:"client-reported"});
 }catch(error){return reply({error:error instanceof Failure?error.message:"Live session could not be checked. Please try again."},error instanceof Failure?error.status:503);}
}

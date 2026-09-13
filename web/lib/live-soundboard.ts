import { z } from "zod";
import { database } from "./scorebook-server";
import { allow } from "./rate-limit";
import type { Identity } from "./auth-server";

const uuid=z.string().uuid();
const soundId=z.union([z.enum(["pickle","turkey","violin","heating"]),uuid]);
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("play"),soundId,connectionId:uuid}).strict(),
 z.object({action:z.literal("save"),title:z.string().trim().min(1).max(40),audioBase64:z.string().min(1).max(349528)}).strict(),
 z.object({action:z.literal("remove"),clipId:uuid}).strict(),
 z.object({action:z.literal("enabled"),enabled:z.boolean()}).strict(),
 z.object({action:z.literal("speaker"),connectionId:uuid,claim:z.boolean()}).strict(),
]);
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store, private","Pragma":"no-cache"}});

/** Strict RIFF PCM validation. Unknown chunks are skipped with their required padding. */
export function validSoundWav(base64:string):boolean {
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return false;
 const bytes=Buffer.from(base64,"base64");
 if(bytes.length<46||bytes.length>262144||bytes.toString("base64")!==base64)return false;
 if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WAVE"||bytes.readUInt32LE(4)+8!==bytes.length)return false;
 let fmt=false,data=false,offset=12;
 while(offset<bytes.length){
  if(offset+8>bytes.length)return false;
  const kind=bytes.toString("ascii",offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
  if(end>bytes.length||end+(size%2)>bytes.length)return false;
  if(kind==="fmt "){
   if(fmt||size!==16||bytes.readUInt16LE(start)!==1||bytes.readUInt16LE(start+2)!==1||bytes.readUInt32LE(start+4)!==16000||bytes.readUInt32LE(start+8)!==32000||bytes.readUInt16LE(start+12)!==2||bytes.readUInt16LE(start+14)!==16)return false;
   fmt=true;
  }else if(kind==="data"){
   if(data||!fmt||size<2||size%2!==0||size>256000)return false;
   data=true;
  }
  offset=end+(size%2);
 }
 return fmt&&data&&offset===bytes.length;
}

export async function soundboard(request:Request,session:{id:string;owner_id:string},who:Identity){
 try{
  if(request.method==="GET"){
   const clip=new URL(request.url).searchParams.get("clip");
   if(clip!==null){
    if(!uuid.safeParse(clip).success)return reply({error:"Sound not available."},404);
    const rows=await database(`live_sound_clips?id=eq.${clip}&session_id=eq.${session.id}&select=audio_base64&limit=1`);
    return rows[0]?reply({audioBase64:rows[0].audio_base64}):reply({error:"Sound not available."},404);
   }
   const [states,clips,events]=await Promise.all([
    database(`live_sessions?id=eq.${session.id}&select=soundboard_enabled,speaker_connection_id,speaker_expires_at&limit=1`),
    database(`live_sound_clips?session_id=eq.${session.id}&select=id,title,user_id&order=created_at.asc,id.asc&limit=10`),
    database(`live_sound_events?session_id=eq.${session.id}&select=id,sound_id,author,created_at&order=created_at.desc,id.desc&limit=20`),
   ]);
   const state=states[0];if(!state)return reply({error:"Session not available."},404);
   return reply({enabled:state.soundboard_enabled,speakerConnectionId:Date.parse(state.speaker_expires_at??"")>Date.now()?state.speaker_connection_id:null,clips:clips.map((clip:{id:string;title:string;user_id:string})=>({id:clip.id,title:clip.title,canRemove:clip.user_id===who.user.id||session.owner_id===who.user.id})),events:events.reverse().map((e:{id:string;sound_id:string;author:string;created_at:string})=>({id:e.id,soundId:e.sound_id,author:e.author,createdAt:e.created_at}))});
  }
  if(Number(request.headers.get("content-length")??0)>360000)return reply({error:"Recording is too large."},413);
  // Enforce the byte limit even when Content-Length is missing or dishonest.
  const reader=request.body?.getReader();if(!reader)return reply({error:"Choose a soundboard action."},400);
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>360000){await reader.cancel();return reply({error:"Recording is too large."},413);}chunks.push(next.value);}
  let parsed;try{parsed=input.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{return reply({error:"Check the soundboard details."},400);}
  if(!parsed.success)return reply({error:"Check the soundboard details."},400);
  const data=parsed.data;
  if(!allow(`live-sound:${data.action}:${who.user.id}`,data.action==="play"?12:data.action==="save"?6:30,60000))return reply({error:"Please wait before trying again."},429);
  if(data.action==="save"&&!validSoundWav(data.audioBase64))return reply({error:"Use a mono 16 kHz PCM WAV recording, up to 8 seconds and 256 KB."},400);
  const name=who.user.displayName?.trim().slice(0,40);
  const result=await database("rpc/live_soundboard_action",{method:"POST",body:JSON.stringify({p_session:session.id,p_user:who.user.id,p_action:data.action,p_payload:data,p_author:name&&!name.includes("@")?name:"Teammate"})});
  if(result.error)return reply({error:result.error},result.status??400);
  return reply(result);
 }catch{return reply({error:"Soundboard is unavailable. Please try again."},503);}
}

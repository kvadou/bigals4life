import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { access, type Identity } from "./auth-server";
import { database } from "./scorebook-server";
import { nightSchema, uuidSchema } from "./scorebook";
import { BOWLERS } from "./season";

export type LiveSession = {scorebookId:string;kind:"prebowl"|"league"|"practice";week:number|null;bowlers:string[];cameraCount:number};

/** Read only. Participant identity, metadata, and credentials never enter the response. */
export async function discoverLiveSessions(identity:Identity):Promise<{sessions:LiveSession[];configured:boolean}> {
  const {LIVEKIT_URL:url,LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret}=process.env;
  if (!url || !key || !secret) return {configured:false,sessions:[]};
  const host=new URL(url);
  if(host.protocol!=="wss:" || host.username || host.password || host.search || host.hash) throw new Error("Invalid live configuration");
  host.protocol="https:";
  const client=new RoomServiceClient(host.toString(),key,secret,{requestTimeout:5});
  const rooms=(await client.listRooms()).filter(room=>room.name.startsWith("ba4l-") && uuidSchema.safeParse(room.name.slice(5)).success);
  // Fail closed rather than omit active sessions unpredictably or fan out without bounds.
  if(rooms.length>64) throw new Error("Live discovery capacity exceeded");
  const sessions:LiveSession[]=[];
  for(let offset=0;offset<rooms.length;offset+=4) {
    const batch=await Promise.all(rooms.slice(offset,offset+4).map(async room=>{
      const scorebookId=room.name.slice(5).toLowerCase();
      const role=await access(identity,scorebookId);
      if(!["owner","editor","viewer"].includes(role)) return null;
      const participants=await client.listParticipants(room.name);
      const cameraCount=participants.reduce((count,participant)=>count+participant.tracks.filter(track=>track.source===TrackSource.CAMERA && !track.muted).length,0);
      if(!cameraCount)return null;
      const rows=await database(`scorebooks?id=eq.${scorebookId}&select=state&limit=1`);
      const parsed=nightSchema.safeParse(rows[0]?.state);
      if(!parsed.success)return null;
      const night=parsed.data;
      return {scorebookId,kind:night.prebowl?"prebowl":night.match?"league":"practice",week:night.prebowl?.week??night.match?.week??null,
        bowlers:night.prebowl?[...new Set(night.prebowl.bowlers)].map(i=>BOWLERS[i]):[...BOWLERS],cameraCount} satisfies LiveSession;
    }));
    for(const session of batch)if(session)sessions.push(session);
  }
  return {configured:true,sessions:sessions.sort((a,b)=>a.scorebookId.localeCompare(b.scorebookId))};
}

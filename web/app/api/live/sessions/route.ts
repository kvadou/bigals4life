import { identify } from "@/lib/auth-server";
import { discoverLiveSessions } from "@/lib/live-discovery";
import { allow } from "@/lib/rate-limit";

export const runtime="nodejs";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store, private","Pragma":"no-cache"}});

export async function GET(request:Request) {
  try {
    const identity=await identify(request);
    if(!identity)return reply({error:"Sign in to find private live sessions."},401);
    if(!allow(`live-discovery:${identity.user.id}`,20,60_000))return reply({error:"Please wait a moment before refreshing live sessions."},429);
    return reply(await discoverLiveSessions(identity));
  } catch {
    return reply({error:"Live sessions could not be checked. Please try again."},503);
  }
}

import { AccessToken, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { access, identify } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/scorebook-server";
import { allow } from "@/lib/rate-limit";

export const runtime = "nodejs";
const input = z.object({scorebookId:z.string().uuid(), mode:z.enum(["watch","publish"])}).strict();
const reply = (data:unknown, status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store, private","Pragma":"no-cache"}});

/** A room is scoped to an existing private scorebook. No legacy public-link access. */
export async function POST(request: Request) {
  try {
    const identity = await identify(request);
    if (!identity) return reply({error:"Sign in to join Live Lane."},401);
    if (identity.viaCookie && !sameOrigin(request)) return reply({error:"Open Live Lane from BA4L."},403);
    if (!allow(`live-token:${identity.user.id}`,30,60_000)) return reply({error:"Please wait a moment before joining again."},429);
    if (Number(request.headers.get("content-length") ?? 0)>1024) return reply({error:"Invalid session request."},413);
    const body = await request.text();
    if (body.length > 1024) return reply({error:"Invalid session request."},413);
    let parsed;
    try { parsed = input.safeParse(JSON.parse(body)); } catch { return reply({error:"Invalid session request."},400); }
    if (!parsed.success) return reply({error:"Choose a valid scorebook and viewing mode."},400);
    const {scorebookId,mode} = parsed.data;
    const role = await access(identity,scorebookId);
    if (!["owner","editor","viewer"].includes(role)) return reply({error:"This private session is not available to your account."},404);
    if (mode === "publish" && role === "viewer") return reply({error:"You can watch. Ask the scorebook owner for permission to publish a camera."},403);
    const {LIVEKIT_URL:serverUrl,LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret} = process.env;
    if (!serverUrl || !key || !secret) return reply({error:"Shared video is not configured yet. Your scorebook is still available."},503);
    const url = new URL(serverUrl);
    if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash) return reply({error:"Shared video configuration is unavailable."},503);
    const token = new AccessToken(key,secret,{
      identity:`${identity.user.id}:${crypto.randomUUID()}`,
      ttl:120,
      name:mode === "publish" ? "Lane camera" : "Teammate",
    });
    token.addGrant({
      roomJoin:true,room:`ba4l-${scorebookId.toLowerCase()}`,
      canSubscribe:true,canPublish:mode === "publish",
      canPublishSources:mode === "publish" ? [TrackSource.CAMERA] : [],
      canPublishData:false,canUpdateOwnMetadata:false,
    });
    return reply({serverUrl,participantToken:await token.toJwt()});
  } catch {
    // Never log credential values, JWTs, upstream response bodies, or request headers.
    return reply({error:"Live Lane could not connect. Please try again."},503);
  }
}

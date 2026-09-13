import { liveV2 } from "@/lib/live-v2";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export const GET=async(request:Request,context:Context)=>liveV2(request,"gallery",(await context.params).id);
export const POST=async(request:Request,context:Context)=>liveV2(request,"gallery",(await context.params).id);
export const PATCH=async(request:Request,context:Context)=>liveV2(request,"gallery",(await context.params).id);

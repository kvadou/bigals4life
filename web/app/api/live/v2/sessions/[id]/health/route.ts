import { liveV2 } from "@/lib/live-v2";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export const POST=async(request:Request,context:Context)=>liveV2(request,"health",(await context.params).id);
export const GET=async(request:Request,context:Context)=>liveV2(request,"health",(await context.params).id);

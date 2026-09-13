import { liveV2 } from "@/lib/live-v2";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export const POST=async(request:Request,context:Context)=>liveV2(request,"token",(await context.params).id);

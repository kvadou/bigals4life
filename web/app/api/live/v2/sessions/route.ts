import { liveV2 } from "@/lib/live-v2";
export const runtime="nodejs";
export const GET=(request:Request)=>liveV2(request,"list");
export const POST=(request:Request)=>liveV2(request,"create");

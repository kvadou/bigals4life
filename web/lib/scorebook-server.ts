import { nightSchema } from "./scorebook";

export async function database(path:string,init:RequestInit={}) {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Shared scorebook is not configured.");
  const response=await fetch(`${url}/rest/v1/${path}`,{...init,cache:"no-store",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation",...init.headers},signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error("Shared storage request failed.");
  return response.json();
}
export function sameOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin;}
export async function readUpdate(request:Request){
  if(Number(request.headers.get("content-length")||0)>150_000)throw new Error("Scorebook too large.");
  const body=await request.text();if(body.length>150_000)throw new Error("Scorebook too large.");
  const data=JSON.parse(body);
  return {state:nightSchema.parse(data.state),revision:data.revision};
}

import { nightSchema } from "./scorebook";

export async function database(path:string,init:RequestInit={}) {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Shared scorebook is not configured.");
  const response=await fetch(`${url}/rest/v1/${path}`,{...init,cache:"no-store",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation",...init.headers},signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error(`Shared storage request failed (${response.status} ${path.split("?")[0]}): ${(await response.text()).slice(0,300)}`);
  const text=await response.text();
  return text?JSON.parse(text):[];
}
export function sameOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin;}
export async function readUpdate(request:Request){
  if(Number(request.headers.get("content-length")||0)>150_000)throw new Error("Scorebook too large.");
  const body=await request.text();if(body.length>150_000)throw new Error("Scorebook too large.");
  const data=JSON.parse(body);
  return {state:nightSchema.parse(data.state),revision:data.revision};
}

/**
 * PostgREST answers at most 1000 rows and says nothing about the rest, so a plain `limit=20000`
 * silently truncates. Pages until a short page arrives. The path must carry a stable `order=`,
 * or offset paging can skip and repeat rows.
 */
export async function databaseAll(path:string,pageSize=1000){
  if(!/[?&]order=/.test(path))throw new Error(`databaseAll needs a stable order: ${path}`);
  const rows:any[]=[];
  for(let offset=0;offset<200_000;offset+=pageSize){
    const page=await database(`${path}${path.includes("?")?"&":"?"}limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if(page.length<pageSize)return rows;
  }
  throw new Error(`databaseAll read 200k rows without reaching the end: ${path}`);
}

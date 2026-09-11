import { database, readUpdate, sameOrigin } from "@/lib/scorebook-server";
const recent=new Map<string,number>();
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Use the website to create a scorebook."},{status:403});
  const ip=request.headers.get("x-vercel-forwarded-for")?.split(",")[0]??"local";
  const now=Date.now();for(const [ip,until]of recent)if(until<now)recent.delete(ip);
  if(recent.has(ip))return Response.json({error:"Please wait a minute before creating another scorebook."},{status:429});
  let state;try{state=(await readUpdate(request)).state}catch{return Response.json({error:"Invalid scores."},{status:400})}
  try{const rows=await database("scorebooks?select=id,state,revision",{method:"POST",body:JSON.stringify({state})});recent.set(ip,now+60_000);return Response.json(rows[0],{status:201});}
  catch{return Response.json({error:"Could not create shared scorebook. Your local scores are safe."},{status:503})}
}

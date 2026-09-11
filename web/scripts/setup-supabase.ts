import { randomBytes } from "node:crypto";

const org = "gnlrgdjpokaxintczhve";
async function run(args: string[], env: Record<string,string|undefined> = {}, input?: string) {
  const p = Bun.spawn(args,{env:{...process.env,...env},stdin:input === undefined ? "ignore" : new Blob([input]),stdout:"pipe",stderr:"pipe"});
  const [out,err,code] = await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  if(code) throw new Error(`${args[0]} ${args[1]} failed (${code}): ${err.replace(/(?:sbp_|sb_secret_|eyJ)[A-Za-z0-9_.-]+/g,"[redacted]")}`);
  return out;
}
const projects = JSON.parse(await run(["supabase","projects","list","-o","json"]));
let project = projects.find((p: {name:string;organization_id:string})=>p.name==="strike-ceiling"&&p.organization_id===org);
let password: string|undefined;
if(!project){
  password=randomBytes(32).toString("hex");
  await run(["supabase","projects","create","strike-ceiling","--org-id",org,"--region","us-east-1","--db-password",password,"--size","micro","-o","json"]);
  const after=JSON.parse(await run(["supabase","projects","list","-o","json"]));
  project=after.find((p:{name:string;organization_id:string})=>p.name==="strike-ceiling"&&p.organization_id===org);
}
if(!project)throw new Error("Project was not found after creation.");
console.log("Supabase project:",project.id);
if(!await Bun.file("supabase/config.toml").exists())await run(["supabase","init"]);
await run(["supabase","link","--project-ref",project.id], password?{SUPABASE_DB_PASSWORD:password}:{});
console.log("Linked project.");
await run(["supabase","db","push","--yes"],password?{SUPABASE_DB_PASSWORD:password}:{});
console.log("Applied migrations.");
const keys=JSON.parse(await run(["supabase","projects","api-keys","--project-ref",project.id,"-o","json"]));
const service=keys.find((k:{name:string})=>k.name==="service_role")?.api_key;
if(!service)throw new Error("Service credential unavailable.");
for(const environment of ["production","preview"]){
  for(const [name,value] of [["SUPABASE_URL",`https://${project.id}.supabase.co`],["SUPABASE_SERVICE_ROLE_KEY",service]]){
    await run(["vercel","env","add",name,environment,"--force"],{},String(value));
    console.log("Configured",name,"for",environment);
  }
}
console.log("Supabase configured. No secret values printed.");

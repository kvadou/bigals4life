import { expect, test } from "bun:test";

test("studio guest shell requires confirmed login and does not open league routes", async () => {
 const script = String.raw`
 import {mock} from 'bun:test';
 import {NextRequest} from 'next/server';
 let user=null;
 mock.module('@supabase/ssr',()=>({createServerClient:()=>({auth:{getUser:async()=>({data:{user}})}})}));
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';
 process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.BAFL_ADMIN_EMAILS='';
 globalThis.fetch=async()=>Response.json([]);
 const {proxy}=await import('./proxy');
 const req=path=>new NextRequest('https://ba4l.example'+path);
 const route=r=>r.headers.get('location')?'redirect':r.headers.get('x-middleware-rewrite')?'rewrite':'next';
 const check=(value,message)=>{if(!value)throw Error(message)};
 let response=await proxy(req('/studio?session=11111111-1111-4111-8111-111111111111'));
 check(route(response)==='redirect','signed out blocked');
 check(new URL(response.headers.get('location')).searchParams.get('next').startsWith('/studio?session='),'session retained through login');
 user={id:'fixture',email:'guest@example.test'};
 check(route(await proxy(req('/studio')))==='redirect','unconfirmed blocked');
 user.email_confirmed_at='2026-01-01';
 check(route(await proxy(req('/studio')))==='next','confirmed guest shell allowed');
 for(const path of ['/','/league','/season','/night','/studio/private'])check(route(await proxy(req(path)))==='rewrite','league gate retained '+path);
 delete process.env.NEXT_PUBLIC_SUPABASE_URL;
 check(route(await proxy(req('/studio')))==='redirect','missing config fails closed');
 console.log('studio gate passed');
 `;
 const result = Bun.spawnSync([process.execPath, "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
 expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
 expect(new TextDecoder().decode(result.stdout)).toContain("studio gate passed");
});

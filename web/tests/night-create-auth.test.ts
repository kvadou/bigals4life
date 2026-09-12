import { expect, test } from "bun:test";

// Fresh process keeps module mocks and per-user creation rate limits out of other tests.
test("new accounts cannot create ownership to bypass league membership", async () => {
  const script = `
    import { mock } from "bun:test";
    let identity = null, enforce = true, reads = 0, checks = 0;
    const calls = [];
    const state = {game:1,rolls:[[],[],[],[]],history:[]};
    const memberIds = new Set(["admin", "member", "cookie-admin"]);
    mock.module("@/lib/auth-server", () => ({
      identify: async () => identity,
      enforcing: () => enforce,
      isTeammate: async who => { checks++; return memberIds.has(who.user.id); },
      unauthorized: error => Response.json({error}, {status:401})
    }));
    mock.module("@/lib/scorebook-server", () => ({
      sameOrigin: request => request.headers.get("origin") === new URL(request.url).origin,
      readUpdate: async request => { reads++; return JSON.parse(await request.text()); },
      database: async (path, init) => {
        calls.push({path, method:init?.method ?? "GET", body:init?.body ? JSON.parse(init.body) : undefined});
        return path.startsWith("scorebooks?") ? [{id:"11111111-1111-4111-8111-111111111111",state,revision:1}] : [];
      }
    }));
    const {POST} = await import("./app/api/nights/route.ts");
    const assert = (value, expected, label) => { if(value !== expected) throw Error(label+": "+JSON.stringify({value,expected})); };
    const writes = () => calls.filter(call => call.method !== "GET");
    const request = (origin="https://bigals4life.com", key="fixture", body=JSON.stringify({state})) => new Request("https://bigals4life.com/api/nights", {method:"POST",headers:{origin,"x-vercel-forwarded-for":key},body});
    const reset = () => { calls.length=0;reads=0;checks=0; };

    // Both native bearer and same-origin browser identities must already belong to the team.
    for (const viaCookie of [false,true]) {
      for (const enabled of [false,true]) {
        reset(); enforce=enabled;identity={user:{id:"uninvited"},viaCookie};
        assert((await POST(request(undefined,"unknown","invalid JSON must not be read"))).status,403,"Uninvited account denied");
        assert(checks,1,"Membership checked");assert(reads,0,"Body not read");assert(calls.length,0,"No scorebook, membership, or team-share query");
      }
    }
    enforce=true;
    for (const id of ["admin","member"]) {
      reset();identity={user:{id},viaCookie:false};
      const response=await POST(request());assert(response.status,201,"Existing teammate may create");
      const json=await response.json();assert(json.role,"owner","Creation role");assert(reads,1,"Scores validated once");
      assert(writes().length,2,"Only scorebook and initial ownership writes with empty teammate list");
      assert(writes()[0].body.owner_id,id,"Correct owner");assert(writes()[1].body.user_id,id,"Correct membership");
      assert(writes()[1].body.role,"owner","Creator ownership");
    }
    reset();identity={user:{id:"cookie-admin"},viaCookie:true};
    assert((await POST(request("https://other.example"))).status,403,"Cross-origin cookie create denied");
    assert(checks,0,"Origin checked before membership");assert(reads,0,"Cross-origin body not read");assert(calls.length,0,"No cross-origin writes");

    reset();identity=null;enforce=true;
    assert((await POST(request())).status,401,"Anonymous enforcement-on rejected");assert(reads,0,"Anonymous body not read");assert(calls.length,0,"Anonymous enforcement-on no writes");
    enforce=false;
    assert((await POST(request("https://other.example"))).status,403,"Cross-origin anonymous legacy rejected");assert(calls.length,0,"Legacy cross-origin no writes");
    const legacy=await POST(request());assert(legacy.status,201,"Existing same-origin anonymous legacy behavior preserved");
    assert((await legacy.json()).role,"legacy","Legacy remains unclaimed");assert(writes().length,1,"Legacy creates no memberships");assert(writes()[0].body.owner_id,null,"Legacy has no account owner");assert(checks,0,"No anonymous membership promotion");
    console.log("night creation membership and legacy authorization checks passed");
  `;
  const child = Bun.spawn([process.execPath, "-e", script], { cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
  const [code, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, errors }).toEqual({ code: 0, errors: "" });
  expect(output).toContain("authorization checks passed");
});

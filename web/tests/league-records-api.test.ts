import { expect, test } from "bun:test";

// Isolate route mocks so the rest of the suite always uses real auth modules.
test("records require membership, validate IDs and return private uncached responses", async () => {
  const script = `
    import { mock } from "bun:test";
    let identity = null, teammate = false, calls = 0;
    mock.module("@/lib/auth-server", () => ({
      identify: async () => identity, isTeammate: async () => teammate,
      unauthorized: error => Response.json({error}, {status:401})
    }));
    mock.module("@/lib/league/records-server", () => ({
      loadRecordBook: async season => { calls++; if(season === "fail") throw Error("private details"); return season === "missing" ? null : {scope:season ?? null, records:[]}; },
      loadBowler: async id => { calls++; return id === 999 ? null : {record:{blsId:id}}; }
    }));
    const book = await import("./app/api/league/records/route.ts");
    const career = await import("./app/api/league/records/[blsId]/route.ts");
    const request = query => new Request("https://bigals4life.com/api/league/records" + (query ?? ""));
    const check = (value, expected) => { if(value !== expected) throw Error(JSON.stringify({value,expected})); };
    const bowler = id => career.GET(request(), {params:Promise.resolve({blsId:id})});
    check((await book.GET(request())).status,401); check((await bowler("1")).status,401); check(calls,0);
    identity={user:{id:"fixture"}};
    check((await book.GET(request())).status,403); check((await bowler("1")).status,403); check(calls,0);
    teammate=true;
    check((await bowler("../1")).status,400); check((await bowler("9007199254740992")).status,400);
    check((await book.GET(request("?season=" + "a".repeat(121)))).status,400); check(calls,0);
    let response=await book.GET(request("?season=2026")); check(response.status,200); check(response.headers.get("cache-control"),"private, no-store"); check((await response.json()).scope,"2026");
    response=await bowler("1"); check(response.status,200); check(response.headers.get("cache-control"),"private, no-store"); check((await response.json()).record.blsId,1);
    check((await bowler("999")).status,404); check((await book.GET(request("?season=missing"))).status,404);
    response=await book.GET(request("?season=fail")); check(response.status,503); check((await response.text()).includes("private details"),false);
    console.log("record route authorization and response contracts passed");
  `;
  const child = Bun.spawn([process.execPath, "-e", script], { cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
  const [code, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, errors }).toEqual({ code: 0, errors: "" });
  expect(output).toContain("contracts passed");
});

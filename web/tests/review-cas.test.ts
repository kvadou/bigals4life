import { expect, test } from "bun:test";

test("review CAS rejects stale state and write races while preserving legacy writes", async () => {
  const script = `
    import { mock } from "bun:test";
    import { isDeepStrictEqual as equal } from "node:util";
    import { emptyReview, emptyProfile } from "./lib/review/schema";
    const {pickBowler: realPickBowler} = await import("./lib/review/server");
    const id="11111111-1111-4111-8111-111111111111", uid="22222222-2222-4222-8222-222222222222";
    let profileName="Doug", savedBowler=null;
    let signedIn=true, db={}, calls=[], legacy=[], race=null, partial=false, modelCalls=0, modelRace=null;
    const clone=x=>JSON.parse(JSON.stringify(x));
    const check=(a,b,label)=>{if(!equal(a,b))throw Error(label+": "+JSON.stringify({a,b}));};
    const review=(note="base")=>({...emptyReview(),games:[{tags:[],note}]});
    const profile=(ball="base")=>({...emptyProfile(),arsenal:[ball]});
    const reset=()=>{db={night_reviews:{state:review(),bowler:0},bowler_profiles:{state:profile()}};calls=[];legacy=[];race=null;partial=false;modelCalls=0;modelRace=null;};
    mock.module("@/lib/auth-server",()=>({identify:async()=>signedIn?{user:{id:uid},viaCookie:false}:null,access:async()=>"editor",decide:()=>({status:200}),denied:d=>Response.json(d,{status:d.status}),unauthorized:error=>Response.json({error},{status:401})}));
    mock.module("@/lib/review/server",()=>({loadNight:async()=>({night:{game:1,rolls:[[],[],[],[]],history:[]},bowledOn:"2026-09-12"}),loadReviewAndProfile:async()=>({review:db.night_reviews?.state??emptyReview(),profile:db.bowler_profiles?.state??emptyProfile(),bowler:savedBowler,bowlerName:profileName}),pickBowler:realPickBowler,saveReview:async(...args)=>legacy.push(["review",...args]),saveProfile:async(...args)=>legacy.push(["profile",...args])}));
    mock.module("@/lib/scorebook-server",()=>({sameOrigin:()=>true,database:async(path,init={})=>{
      const u=new URL("https://fixture.invalid/"+path), table=u.pathname.slice(1), method=init.method??"GET";
      calls.push({path,method});if(method==="GET")return db[table]?[clone(db[table])]:[];
      const value=JSON.parse(init.body);check(value.user_id,uid,"Current user only");if(table==="night_reviews")check(value.scorebook_id,id,"Current night only");
      if(race===table){db[table]={state:table==="night_reviews"?review("concurrent"):profile("concurrent"),bowler:0};race=null;}
      if(method==="PATCH"){
        check(u.searchParams.get("user_id"),"eq."+uid,"PATCH user scoped");if(table==="night_reviews")check(u.searchParams.get("scorebook_id"),"eq."+id,"PATCH night scoped");
        const expected=JSON.parse(u.searchParams.get("state").slice(3));
        if(!db[table]||!equal(db[table].state,expected))return [];
        if(table==="night_reviews"&&u.searchParams.get("bowler")!=="eq."+db[table].bowler)return [];
        check(init.headers.Prefer,"return=representation","Affected row returned");
      }else{
        check(init.headers.Prefer,"resolution=ignore-duplicates,return=representation","Insert cannot replace collision");
        check(u.searchParams.get("on_conflict"),table==="night_reviews"?"scorebook_id,user_id":"user_id","Unique keys");if(db[table])return [];
      }
      db[table]=clone(value);if(partial&&table==="night_reviews")db.bowler_profiles={state:profile("concurrent")};return [clone(value)];
    }}));
    mock.module("@/lib/rate-limit",()=>({allow:()=>true}));
    mock.module("ai",()=>({generateText:async()=>{modelCalls++;if(modelRace)db[modelRace]={state:modelRace==="night_reviews"?review("AI race"):profile("AI race"),bowler:0};return {text:"SUMMARY: A useful night.\\nQUESTION: Which lane felt better?\\nIDEAS: none\\nCLOSING:"};}}));
    const {PUT,GET}=await import("./app/api/review/[id]/route.ts");
    const put=body=>PUT(new Request("https://bigals4life.com/api/review/"+id,{method:"PUT",body:JSON.stringify({bowler:0,...body})}),{params:Promise.resolve({id})});
    const writes=()=>calls.filter(x=>x.method!=="GET").length;
    const conditional=()=>({review:review("new"),profile:profile("new"),expectedReview:review(),expectedProfile:profile()});
    reset();db.night_reviews.state=review("remote");let response=await put(conditional());check(response.status,409,"Stale review");check(writes(),0,"No writes");
    reset();db.bowler_profiles.state=profile("remote");response=await put(conditional());check(response.status,409,"Stale profile");check(writes(),0,"Both checked before writes");
    reset();let body=conditional();body.expectedReview=review('A&B +50% #tag = "quote"');db.night_reviews.state=clone(body.expectedReview);response=await put(body);check(response.status,200,"Encoded JSONB baseline");check(writes(),2,"Both updated");check(db.night_reviews.state,body.review,"Review saved");check(db.bowler_profiles.state,body.profile,"Profile saved");check(legacy.length,0,"No unconditional upsert");
    reset();db={};response=await put({review:review("first"),profile:profile("first"),expectedReview:emptyReview(),expectedProfile:emptyProfile()});check(response.status,200,"Missing rows default baseline");check(writes(),2,"Two safe inserts");
    reset();db={};response=await put(conditional());check(response.status,409,"Missing nonempty baseline");check(writes(),0,"Missing mismatch no writes");
    reset();db={};race="night_reviews";response=await put({review:review("first"),expectedReview:emptyReview()});check(response.status,409,"First insert race");check(db.night_reviews.state,review("concurrent"),"Concurrent row preserved");
    reset();race="night_reviews";response=await put(conditional());check(response.status,409,"PATCH race");check(db.night_reviews.state,review("concurrent"),"Newer review preserved");check(writes(),1,"Profile untouched after review race");
    reset();partial=true;response=await put(conditional());check(response.status,409,"Second row race");check(db.night_reviews.state,review("new"),"First may have saved");check(db.bowler_profiles.state,profile("concurrent"),"Second newer state preserved");check((await response.json()).error.includes("Not all edits were saved"),true,"Partial outcome honest");
    reset();response=await put({review:review("web"),profile:profile("web")});check(response.status,200,"Legacy request");check(legacy.length,2,"Legacy helpers preserved");check(calls.length,0,"Legacy no additional reads");
    reset();response=await put({expectedReview:review()});check(response.status,400,"Orphan expected field invalid");check(calls.length,0,"Invalid body no reads");
    reset();signedIn=false;response=await put(conditional());check(response.status,401,"Requires identity");check(calls.length,0,"Anonymous no database access");
    signedIn=true;
    const {POST}=await import("./app/api/review/[id]/debrief/route.ts");
    const debrief=body=>POST(new Request("https://bigals4life.com/api/review/"+id+"/debrief",{method:"POST",body:JSON.stringify({bowler:0,...body})}),{params:Promise.resolve({id})});
    reset();db.night_reviews.state=review("stale");response=await debrief(conditional());check(response.status,409,"Debrief stale review");check(modelCalls,0,"No AI call with stale baseline");check(writes(),0,"No stale debrief writes");
    reset();db.bowler_profiles.state=profile("stale");response=await debrief(conditional());check(response.status,409,"Debrief stale profile");check(modelCalls,0,"Profile checked before AI");
    reset();modelRace="night_reviews";response=await debrief(conditional());check(response.status,409,"Review changed during AI");check(db.night_reviews.state,review("AI race"),"AI response cannot overwrite newer conversation");
    reset();modelRace="bowler_profiles";response=await debrief(conditional());check(response.status,409,"Profile changed during AI");check(writes(),0,"Changed profile blocks generated review save");
    reset();response=await debrief(conditional());check(response.status,200,"Conditional debrief succeeds");check(modelCalls,1,"One AI generation");check(writes(),1,"Debrief changes review only");check(db.night_reviews.state.debrief.length,1,"Coach response persisted");
    reset();response=await debrief({review:review("web")});check(response.status,200,"Legacy web debrief preserved");check(legacy.length,1,"Legacy coach uses existing save helper");check(calls.length,0,"Legacy coach no CAS queries");
    const conversation=n=>({...review(),debrief:Array.from({length:n},(_,i)=>({role:"coach",text:"Earlier turn "+i,at:"2026-09-12T12:00:00Z"}))});
    reset();response=await debrief({review:conversation(7),answer:"My answer"});check(response.status,400,"Seven plus answer exceeds eight-turn limit");check(modelCalls,0,"Overflow rejected before AI");check(legacy.length,0,"Overflow is never persisted");
    reset();response=await debrief({review:conversation(6),answer:"My answer"});check(response.status,200,"Six plus answer fits exactly eight");check((await response.json()).review.debrief.length,8,"Exactly eight turns returned");
    reset();response=await debrief({review:conversation(7)});check(response.status,200,"Seven plus coach fits exactly eight");check((await response.json()).review.debrief.length,8,"No ninth turn without answer");
    reset();response=await debrief({review:conversation(8)});check(response.status,400,"Full conversation rejects another turn");check(modelCalls,0,"Full conversation no AI");
    reset();profileName="Mustafa";savedBowler=null;
    const get=query=>GET(new Request("https://bigals4life.com/api/review/"+id+(query??"")),{params:Promise.resolve({id})});
    for(const query of ["","?bowler=","?bowler=invalid","?bowler=4","?bowler=-1","?bowler=1e0"]){response=await get(query);check(response.status,200,"Review GET loads");check((await response.json()).bowler,1,"Missing/invalid query uses Mustafa profile");}
    response=await get("?bowler=0");check((await response.json()).bowler,0,"Explicit zero still selects Doug");
    response=await get("?bowler=2");check((await response.json()).bowler,2,"Valid requested bowler honored");
    savedBowler=3;response=await get();check((await response.json()).bowler,3,"Saved selection precedes profile when query absent");
    console.log("review CAS precondition, race and compatibility checks passed");
  `;
  const child = Bun.spawn([process.execPath, "-e", script], { cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
  const [code, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, errors }).toEqual({ code: 0, errors: "" });
  expect(output).toContain("compatibility checks passed");
});

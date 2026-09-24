import { enforcing, identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { database, readUpdate, sameOrigin } from "@/lib/scorebook-server";
import { shareWithTeam } from "@/lib/team-share";
const recent = new Map<string, number>();

export async function POST(request: Request) {
  const identity = await identify(request);
  if ((!identity || identity.viaCookie) && !sameOrigin(request)) return Response.json({ error: "Use the website to create a scorebook." }, { status: 403 });
  if (!identity && enforcing()) return unauthorized("Sign in to create a shared scorebook.");
  // Creating ownership must not let a newly registered account grant itself league membership.
  if (identity && !await isTeammate(identity)) return Response.json({ error: "Ask Doug to add you to the team before creating a scorebook." }, { status: 403 });
  const key = identity?.user.id ?? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now(); for (const [k, until] of recent) if (until < now) recent.delete(k);
  if (recent.has(key)) return Response.json({ error: "Please wait a minute before creating another scorebook." }, { status: 429 });
  let state; try { state = (await readUpdate(request)).state; } catch { return Response.json({ error: "Invalid scores." }, { status: 400 }); }
  try {
    const rows = await database("scorebooks?select=id,state,revision", { method: "POST", body: JSON.stringify({ state, owner_id: identity?.user.id ?? null }) });
    if (identity) {
      await database("scorebook_members", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ scorebook_id: rows[0].id, user_id: identity.user.id, role: "owner", added_by: identity.user.id }) });
      await shareWithTeam(rows[0].id, identity.user.id).catch(error => console.error("Team share failed", error instanceof Error ? error.message : "unknown"));
    }
    recent.set(key, now + 60_000);
    return Response.json({ ...rows[0], role: identity ? "owner" : "legacy" }, { status: 201 });
  } catch { return Response.json({ error: "Could not create shared scorebook. Your local scores are safe." }, { status: 503 }); }
}

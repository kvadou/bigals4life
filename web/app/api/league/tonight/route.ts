import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { database, sameOrigin } from "@/lib/scorebook-server";
import { shareWithTeam } from "@/lib/team-share";
import { loadTonight, tonightNight } from "@/lib/league/tonight";

async function teammate(request: Request) {
  const identity = await identify(request);
  if (!identity) return { error: unauthorized("Sign in to see league night.") };
  if (!await isTeammate(identity)) return { error: Response.json({ error: "League data is for team members. Ask Doug to add you." }, { status: 403 }) };
  return { identity };
}

/** Who we bowl next, on which lanes, and whether that is tonight (Central time). */
export async function GET(request: Request) {
  const { error } = await teammate(request); if (error) return error;
  try {
    const tonight = await loadTonight();
    if (!tonight) return Response.json({ error: "Gary's sheet does not list our next match yet." }, { status: 404 });
    return Response.json(tonight, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Tonight load failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "League night is unavailable right now." }, { status: 503 });
  }
}

/** Open tonight's scorebook, creating it with the match preset if nobody has yet. Safe to tap from every phone. */
export async function POST(request: Request) {
  const { identity, error } = await teammate(request); if (error) return error;
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website to start tonight." }, { status: 403 });
  try {
    const tonight = await loadTonight();
    if (!tonight) return Response.json({ error: "Gary's sheet does not list our next match yet." }, { status: 404 });
    // Membership comes from the night's own sharing (shareWithTeam at creation), never from this lookup.
    if (tonight.nightId) return Response.json({ id: tonight.nightId, created: false });
    const [row] = await database("scorebooks?select=id", { method: "POST", body: JSON.stringify({ state: tonightNight(tonight), owner_id: identity.user.id }) });
    await database("scorebook_members", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ scorebook_id: row.id, user_id: identity.user.id, role: "owner", added_by: identity.user.id }) });
    await shareWithTeam(row.id, identity.user.id).catch(e => console.error("Team share failed", e instanceof Error ? e.message : "unknown"));
    return Response.json({ id: row.id, created: true }, { status: 201 });
  } catch (e) {
    console.error("Tonight start failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Could not start tonight's scorebook. Try again, or start one from the Score tab." }, { status: 503 });
  }
}

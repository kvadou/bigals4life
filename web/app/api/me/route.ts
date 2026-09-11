import { identify, isAdmin, unauthorized } from "@/lib/auth-server";
import { database } from "@/lib/scorebook-server";

type Row = Record<string, any>;
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  try {
    let [profile]: Row[] = await database(`profiles?user_id=eq.${identity.user.id}&select=display_name,bowler_name`);
    if (!profile) [profile] = await database("profiles", { method: "POST", body: JSON.stringify({ user_id: identity.user.id, display_name: identity.user.email.split("@")[0] }) });
    const members: Row[] = await database(`scorebook_members?user_id=eq.${identity.user.id}&select=role,scorebook_id,scorebooks(updated_at)`);
    return Response.json({
      user: identity.user,
      admin: isAdmin(identity.user.email),
      profile: { displayName: profile.display_name, bowlerName: profile.bowler_name ?? null },
      scorebooks: members.map(m => ({ id: m.scorebook_id, role: m.role, updatedAt: m.scorebooks?.updated_at ?? null })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Me failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Account details are unavailable right now." }, { status: 503 });
  }
}

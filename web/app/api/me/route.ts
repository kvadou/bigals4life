import { identify, isAdmin, unauthorized } from "@/lib/auth-server";
import { z } from "zod";
import { database, sameOrigin } from "@/lib/scorebook-server";

type Row = Record<string, any>;
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  try {
    let [profile]: Row[] = await database(`profiles?user_id=eq.${identity.user.id}&select=display_name,bowler_name`);
    if (!profile) [profile] = await database("profiles", { method: "POST", body: JSON.stringify({ user_id: identity.user.id, display_name: identity.user.email.split("@")[0] }) });
    const admin = isAdmin(identity.user.email);
    const members: Row[] = await database(`scorebook_members?user_id=eq.${identity.user.id}&select=role,scorebook_id,scorebooks(updated_at)`);
    // Admins also see unclaimed (legacy) scorebooks so they can find and claim last night's book. Ranked by games recorded, then recency.
    const legacy: Row[] = admin ? await database("scorebooks?owner_id=is.null&select=id,updated_at,state&order=updated_at.desc&limit=20") : [];
    return Response.json({
      user: identity.user,
      admin,
      profile: { displayName: profile.display_name, bowlerName: profile.bowler_name ?? null },
      scorebooks: members.map(m => ({ id: m.scorebook_id, role: m.role, updatedAt: m.scorebooks?.updated_at ?? null })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      legacy: legacy.map(l => ({ id: l.id, updatedAt: l.updated_at, games: (l.state?.history?.length ?? 0) + (l.state?.rolls?.some((r: number[]) => r.length) || l.state?.finals?.some((f: number | null) => f != null) ? 1 : 0) })).sort((a, b) => b.games - a.games || String(b.updatedAt).localeCompare(String(a.updatedAt))),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Me failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Account details are unavailable right now." }, { status: 503 });
  }
}

const namePart = z.string().trim().min(1).max(30).regex(/^[\p{L}\p{M}' .-]+$/u);
const nameUpdate = z.object({ firstName: namePart, lastName: namePart });

/** Your own first and last name, shown in greetings and the account menu. Display only: never grants access or changes scores. */
export async function PATCH(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website to change your name." }, { status: 403 });
  let body; try { body = nameUpdate.parse(await request.json()); } catch { return Response.json({ error: "Enter a first and last name (letters, spaces, apostrophes, hyphens)." }, { status: 400 }); }
  const displayName = `${body.firstName} ${body.lastName}`.replace(/\s+/g, " ");
  try {
    const [profile]: Row[] = await database(`profiles?on_conflict=user_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ user_id: identity.user.id, display_name: displayName }) });
    return Response.json({ profile: { displayName: profile.display_name, bowlerName: profile.bowler_name ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Name update failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not save your name. Try again." }, { status: 503 });
  }
}

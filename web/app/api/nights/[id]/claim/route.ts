import { identify, isAdmin, unauthorized } from "@/lib/auth-server";
import { database, sameOrigin } from "@/lib/scorebook-server";
import { uuidSchema } from "@/lib/scorebook";

type Context = { params: Promise<{ id: string }> };
/** An admin takes ownership of a legacy (unclaimed) scorebook. Nothing else can claim, so no first-user takeover. */
export async function POST(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website to claim a scorebook." }, { status: 403 });
  if (!isAdmin(identity.user.email)) return Response.json({ error: "Only the league admin can claim existing scorebooks." }, { status: 403 });
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid team link." }, { status: 400 });
  try {
    const rows: { owner_id: string | null }[] = await database(`scorebooks?id=eq.${id.data}&select=owner_id`);
    if (!rows[0]) return Response.json({ error: "Team scorebook not found." }, { status: 404 });
    if (rows[0].owner_id && rows[0].owner_id !== identity.user.id) return Response.json({ error: "This scorebook already has an owner." }, { status: 409 });
    if (!rows[0].owner_id) await database(`scorebooks?id=eq.${id.data}&owner_id=is.null`, { method: "PATCH", body: JSON.stringify({ owner_id: identity.user.id }) });
    await database("scorebook_members?on_conflict=scorebook_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ scorebook_id: id.data, user_id: identity.user.id, role: "owner", added_by: identity.user.id }) });
    return Response.json({ id: id.data, role: "owner" });
  } catch (error) {
    console.error("Claim failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not claim the scorebook right now." }, { status: 503 });
  }
}

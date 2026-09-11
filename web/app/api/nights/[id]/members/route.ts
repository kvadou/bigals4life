import { z } from "zod";
import { access, identify, isAdmin, unauthorized } from "@/lib/auth-server";
import { database, sameOrigin } from "@/lib/scorebook-server";
import { uuidSchema } from "@/lib/scorebook";

type Context = { params: Promise<{ id: string }> };
const body = z.object({ email: z.string().email().max(120), role: z.enum(["owner", "editor", "viewer"]) });

/** Owner invites a teammate by email. Existing accounts pick the membership up on their next request; new ones when they first sign in. */
export async function POST(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website to add teammates." }, { status: 403 });
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid team link." }, { status: 400 });
  let invite; try { invite = body.parse(await request.json()); } catch { return Response.json({ error: "Enter a valid email and a role." }, { status: 400 }); }
  try {
    const role = await access(identity, id.data);
    if (role === "missing" || role === "none") return Response.json({ error: "Team scorebook not found." }, { status: 404 });
    if (role !== "owner") return Response.json({ error: "Only the scorebook owner can add teammates." }, { status: 403 });
    if (invite.role === "owner" && !isAdmin(identity.user.email)) return Response.json({ error: "Only the league admin can add another owner. Invite them as an editor." }, { status: 403 });
    await database("scorebook_invites?on_conflict=scorebook_id,email", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ scorebook_id: id.data, email: invite.email.toLowerCase(), role: invite.role, invited_by: identity.user.id }) });
    return Response.json({ id: id.data, email: invite.email.toLowerCase(), role: invite.role, status: "invited" }, { status: 201 });
  } catch (error) {
    console.error("Invite failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not add that teammate right now." }, { status: 503 });
  }
}

export async function GET(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid team link." }, { status: 400 });
  try {
    const role = await access(identity, id.data);
    if (role === "missing" || role === "none") return Response.json({ error: "Team scorebook not found." }, { status: 404 });
    const [members, invites]: Record<string, any>[][] = await Promise.all([
      database(`scorebook_members?scorebook_id=eq.${id.data}&select=user_id,role,created_at`),
      database(`scorebook_invites?scorebook_id=eq.${id.data}&select=email,role,created_at`),
    ]);
    return Response.json({ role, members: members.map(m => ({ userId: m.user_id, role: m.role })), invites: invites.map(i => ({ email: i.email, role: i.role })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not load teammates right now." }, { status: 503 }); }
}

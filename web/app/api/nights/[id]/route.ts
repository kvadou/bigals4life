import { access, decide, denied, identify } from "@/lib/auth-server";
import { database, readUpdate, sameOrigin } from "@/lib/scorebook-server";
import { uuidSchema } from "@/lib/scorebook";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid team link." }, { status: 400 });
  try {
    const identity = await identify(request);
    const role = await access(identity, id.data);
    const verdict = decide("read", role, !!identity);
    if (verdict.status !== 200) return denied(verdict);
    const rows = await database(`scorebooks?id=eq.${id.data}&select=state,revision`);
    return rows[0] ? Response.json({ ...rows[0], role }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Team scorebook not found." }, { status: 404 });
  } catch { return Response.json({ error: "Could not load shared scores. Please retry." }, { status: 503 }); }
}

export async function PUT(request: Request, context: Context) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid team link." }, { status: 400 });
  const identity = await identify(request);
  // Bearer identity is proof enough; cookie sessions and anonymous callers need the same-origin check against CSRF.
  if ((!identity || identity.viaCookie) && !sameOrigin(request)) return Response.json({ error: "Use the scorebook website to save." }, { status: 403 });
  let update;
  try { update = await readUpdate(request); if (!Number.isInteger(update.revision) || update.revision < 1) throw Error(); }
  catch { return Response.json({ error: "Invalid scores. Nothing was saved." }, { status: 400 }); }
  try {
    const verdict = decide("write", await access(identity, id.data), !!identity);
    if (verdict.status !== 200) return denied(verdict);
    const rows = await database(`scorebooks?id=eq.${id.data}&revision=eq.${update.revision}&select=state,revision`, { method: "PATCH", body: JSON.stringify({ state: update.state, revision: update.revision + 1, updated_at: new Date().toISOString() }) });
    if (!rows.length) return Response.json({ error: "Another phone updated this game. Your edit was not saved. Reload the latest scores before continuing." }, { status: 409 });
    return Response.json(rows[0]);
  } catch { return Response.json({ error: "Not saved to the team. Check your connection and retry." }, { status: 503 }); }
}

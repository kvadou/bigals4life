import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { loadBowler } from "@/lib/league/records-server";

export async function GET(request: Request, { params }: { params: Promise<{ blsId: string }> }) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to see bowler records.");
  if (!await isTeammate(identity)) return Response.json({ error: "Bowler records are for team members. Ask Doug to add you." }, { status: 403 });
  const { blsId } = await params;
  if (!/^\d+$/.test(blsId) || !Number.isSafeInteger(Number(blsId))) return Response.json({ error: "Choose a valid bowler." }, { status: 400 });
  try {
    const page = await loadBowler(Number(blsId));
    if (!page) return Response.json({ error: "That bowler has no records yet." }, { status: 404 });
    return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "This bowler's record is unavailable right now." }, { status: 503 });
  }
}

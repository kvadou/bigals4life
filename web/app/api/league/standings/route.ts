import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { loadStandings } from "@/lib/league/standings-server";

export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to see league standings.");
  if (!await isTeammate(identity)) return Response.json({ error: "League data is for team members. Ask Doug to add you." }, { status: 403 });
  const season = new URL(request.url).searchParams.get("season") ?? undefined;
  try {
    const standings = await loadStandings(season);
    if (!standings) return Response.json({ error: "No standings have been ingested yet." }, { status: 404 });
    return Response.json(standings, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Standings load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Standings are unavailable right now." }, { status: 503 });
  }
}

import { identify, unauthorized } from "@/lib/auth-server";
import { loadStandings } from "@/lib/league/standings-server";

export async function GET(request: Request) {
  if (!await identify(request)) return unauthorized("Sign in to see league standings.");
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

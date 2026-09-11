import { loadStandings } from "@/lib/league/standings-server";

export async function GET(request: Request) {
  const season = new URL(request.url).searchParams.get("season") ?? undefined;
  try {
    const standings = await loadStandings(season);
    if (!standings) return Response.json({ error: "No standings have been ingested yet." }, { status: 404 });
    return Response.json(standings, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
  } catch (error) {
    console.error("Standings load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Standings are unavailable right now." }, { status: 503 });
  }
}

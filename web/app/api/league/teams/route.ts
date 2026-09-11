import { identify, unauthorized } from "@/lib/auth-server";
import { database } from "@/lib/scorebook-server";
import { displayName } from "@/lib/league/bls-parse";
import { handicapFor } from "@/lib/league/points";

type Row = Record<string, any>;
// Latest ingested week: every team with its bowlers, averages, and the handicap that average earns.
export async function GET(request: Request) {
  if (!await identify(request)) return unauthorized("Sign in to see league standings.");
  try {
    const seasons: Row[] = await database("league_seasons?select=id,name&order=name.desc&limit=1");
    const season = seasons[0]; if (!season) return Response.json({ error: "No league data yet." }, { status: 404 });
    const weeks: Row[] = await database(`league_weeks?select=id,week&season_id=eq.${season.id}&order=week.desc&limit=1`);
    const week = weeks[0]; if (!week) return Response.json({ error: "No league data yet." }, { status: 404 });
    const [teams, bowlers, bowlerWeeks]: Row[][] = await Promise.all([
      database(`league_teams?select=id,number,name&season_id=eq.${season.id}&order=number.asc`),
      database(`league_bowlers?select=id,name&season_id=eq.${season.id}`),
      database(`league_bowler_weeks?select=bowler_id,team_id,average,games,scratch_games,to_raise,to_drop&week_id=eq.${week.id}`),
    ]);
    return Response.json({
      season: season.name, week: week.week,
      teams: teams.map(t => ({ number: t.number, name: t.name, bowlers: bowlerWeeks.filter(bw => bw.team_id === t.id).map(bw => {
        const b = bowlers.find(x => x.id === bw.bowler_id);
        return { name: displayName(b?.name ?? ""), average: bw.average, handicap: handicapFor(bw.average), games: bw.games, toRaise: bw.to_raise, toDrop: bw.to_drop, bowledLastWeek: !!bw.scratch_games };
      }).sort((a, b) => Number(b.bowledLastWeek) - Number(a.bowledLastWeek) || b.games - a.games) })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Teams load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "League data is unavailable right now." }, { status: 503 });
  }
}

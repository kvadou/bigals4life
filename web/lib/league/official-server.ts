import { database } from "@/lib/scorebook-server";
import { usedHandicap } from "./bls-parse";
import type { OfficialWeek } from "./official";
import { OUR_BOWLER } from "./standings-server";

type Row = Record<string, any>;

/** Gary's sheet for one week, from our side. Null until that week's standings are ingested. */
export async function loadOfficialWeek(season: string, week: number): Promise<OfficialWeek | null> {
  const [s]: Row[] = await database(`league_seasons?select=id&name=eq.${encodeURIComponent(season)}`); if (!s) return null;
  const [w]: Row[] = await database(`league_weeks?select=id&season_id=eq.${s.id}&week=eq.${week}`); if (!w) return null;
  const [teamWeeks, bowlerWeeks, bowlers, teams]: Row[][] = await Promise.all([
    database(`league_team_weeks?select=team_id,opponent_team_id,week_points_won,hdcp_games&week_id=eq.${w.id}`),
    database(`league_bowler_weeks?select=bowler_id,team_id,handicap,scratch_games,scratch_total,hdcp_total&week_id=eq.${w.id}`),
    database(`league_bowlers?select=id,name&season_id=eq.${s.id}`),
    database(`league_teams?select=id,name&season_id=eq.${s.id}`),
  ]);
  const me = bowlers.find(b => OUR_BOWLER.test(b.name));
  const ourTeam = bowlerWeeks.find(bw => bw.bowler_id === me?.id)?.team_id;
  const ours = teamWeeks.find(t => t.team_id === ourTeam);
  if (!ours || ours.week_points_won == null || !ours.opponent_team_id) return null;
  const theirs = teamWeeks.find(t => t.team_id === ours.opponent_team_id);
  const roster = (team: string) => bowlerWeeks.filter(bw => bw.team_id === team).map(bw => ({
    name: bowlers.find(b => b.id === bw.bowler_id)?.name ?? "",
    handicap: usedHandicap({ handicap: bw.handicap, scratchGames: bw.scratch_games, scratchTotal: bw.scratch_total, hdcpTotal: bw.hdcp_total }),
    games: bw.scratch_games,
  }));
  return { opponentName: teams.find(t => t.id === ours.opponent_team_id)?.name ?? "", pointsWon: Number(ours.week_points_won), ourHdcpGames: ours.hdcp_games ?? [], theirHdcpGames: theirs?.hdcp_games ?? [], ours: roster(ourTeam), theirs: roster(ours.opponent_team_id) };
}

import { database } from "@/lib/scorebook-server";
import { displayName } from "./bls-parse";
import type { Reconciliation } from "./reconcile";

export const OUR_BOWLER = /^DOUG KVAMME$/i; // "our team" is whichever roster Doug is on that season
type Row = Record<string, any>;

export type LeagueStandings = {
  season: { id: string; name: string; house: string; weeksTotal: number };
  seasons: { name: string }[];
  week: { number: number; bowledOn: string; ingestedAt: string };
  teams: { number: number; name: string; place: number; percentWon: number; pointsWon: number; pointsLost: number; ytdWon: number; ytdLost: number; scratchPins: number; ours: boolean; lastWeek: { opponent: string; points: number; hdcpGames: number[]; hdcpTotal: number } | null }[];
  roster: { name: string; average: number; handicap: number; toRaise: number; toDrop: number; games: number[] | null; total: number | null; matchPoints: number | null }[];
  leaderboard: { name: string; team: string; points: number; ours: boolean }[];
  history: { week: number; points: number | null; opponent: string | null; place: number | null }[];
  reconciliation: { week: number; nights: Reconciliation[] }[];
};

export async function loadStandings(seasonName?: string): Promise<LeagueStandings | null> {
  const seasons: Row[] = await database(`league_seasons?select=*&order=name.desc`);
  const season = seasonName ? seasons.find(s => s.name === seasonName) : seasons[0]; if (!season) return null;
  const weeks: Row[] = await database(`league_weeks?select=*&season_id=eq.${season.id}&order=week.desc`);
  const latest = weeks[0]; if (!latest) return null;
  const [teams, teamWeeks, bowlers, bowlerWeeks]: Row[][] = await Promise.all([
    database(`league_teams?select=*&season_id=eq.${season.id}`),
    database(`league_team_weeks?select=*&week_id=eq.${latest.id}&order=place.asc`),
    database(`league_bowlers?select=*&season_id=eq.${season.id}`),
    database(`league_bowler_weeks?select=*&week_id=eq.${latest.id}`),
  ]);
  const teamName = (id: string | null) => teams.find(t => t.id === id)?.name ?? "";
  const me = bowlers.find(b => OUR_BOWLER.test(b.name));
  const ours = teams.find(t => t.id === (bowlerWeeks.find(bw => bw.bowler_id === me?.id)?.team_id ?? me?.team_id));
  const ourWeeks: Row[] = ours ? await database(`league_team_weeks?select=week_id,week_points_won,opponent_team_id,place,discrepancies&team_id=eq.${ours.id}`) : [];
  const history = ourWeeks.map(r => ({ week: weeks.find(w => w.id === r.week_id)?.week ?? 0, points: r.week_points_won, opponent: teamName(r.opponent_team_id) || null, place: r.place })).sort((a, b) => a.week - b.week);
  const reconciliation = ourWeeks.filter(r => Array.isArray(r.discrepancies) && r.discrepancies.length).map(r => ({ week: weeks.find(w => w.id === r.week_id)?.week ?? 0, nights: r.discrepancies as Reconciliation[] })).sort((a, b) => b.week - a.week);
  return {
    season: { id: season.id, name: season.name, house: season.house, weeksTotal: season.weeks_total },
    seasons: seasons.map(s => ({ name: s.name })),
    week: { number: latest.week, bowledOn: latest.bowled_on, ingestedAt: latest.ingested_at },
    teams: teamWeeks.map(tw => { const t = teams.find(x => x.id === tw.team_id); return {
      number: t?.number ?? 0, name: t?.name ?? "", place: tw.place, percentWon: Number(tw.percent_won), pointsWon: Number(tw.points_won), pointsLost: Number(tw.points_lost), ytdWon: Number(tw.ytd_won), ytdLost: Number(tw.ytd_lost), scratchPins: tw.scratch_pins, ours: t?.id === ours?.id,
      lastWeek: tw.opponent_team_id ? { opponent: teamName(tw.opponent_team_id), points: Number(tw.week_points_won), hdcpGames: tw.hdcp_games ?? [], hdcpTotal: tw.hdcp_total } : null }; }),
    roster: bowlerWeeks.filter(bw => bw.team_id === ours?.id).map(bw => { const b = bowlers.find(x => x.id === bw.bowler_id); return {
      name: displayName(b?.name ?? ""), average: bw.average, handicap: bw.handicap, toRaise: bw.to_raise, toDrop: bw.to_drop, games: bw.scratch_games, total: bw.scratch_total, matchPoints: bw.match_points_ytd == null ? null : Number(bw.match_points_ytd) }; }).sort((a, b) => b.average - a.average),
    leaderboard: bowlerWeeks.filter(bw => bw.match_points_ytd != null).map(bw => { const b = bowlers.find(x => x.id === bw.bowler_id); return {
      name: displayName(b?.name ?? ""), team: teamName(bw.team_id), points: Number(bw.match_points_ytd), ours: bw.team_id === ours?.id }; }).sort((a, b) => b.points - a.points),
    history,
    reconciliation,
  };
}

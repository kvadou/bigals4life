import { database, databaseAll } from "@/lib/scorebook-server";
import { displayName } from "./bls-parse";
import { OUR_BOWLER } from "./standings-server";
import { bowlerRecord, coverage, type BowlerWeek, type BowlerRecord } from "./records";

type Row = Record<string, any>;

export type RecordBook = {
  seasons: { name: string; weeksTotal: number }[];
  scope: string | null; // a season name, or null for every season we have
  records: BowlerRecord[];
  coverage: { name: string; weeksTotal: number; have: number; missing: number[] }[];
  ourTeam: string;
};

/** Every ingested bowler-week, joined to season, week, team and opponent. Two seasons is under 2k rows. */
async function allWeeks() {
  const [seasons, teams, bowlers, weeks]: Row[][] = await Promise.all([
    database(`league_seasons?select=*&order=name.desc`),
    database(`league_teams?select=*`),
    database(`league_bowlers?select=*`),
    database(`league_weeks?select=*&order=week.asc`),
  ]);
  if (!weeks.length) return null;
  const [bowlerWeeks, teamWeeks]: Row[][] = await Promise.all([
    databaseAll(`league_bowler_weeks?select=*&order=week_id.asc,bowler_id.asc`),
    databaseAll(`league_team_weeks?select=week_id,team_id,opponent_team_id&order=week_id.asc,team_id.asc`),
  ]);
  const seasonName = new Map(seasons.map(s => [s.id, s.name as string]));
  const week = new Map(weeks.map(w => [w.id, w]));
  const team = new Map(teams.map(t => [t.id, t.name as string]));
  const opponent = new Map(teamWeeks.map(tw => [`${tw.week_id}:${tw.team_id}`, tw.opponent_team_id as string | null]));
  const byBowler = new Map<string, BowlerWeek[]>();
  for (const row of bowlerWeeks) {
    const w = week.get(row.week_id);
    if (!w) continue;
    const list = byBowler.get(row.bowler_id) ?? [];
    list.push({
      seasonName: seasonName.get(w.season_id) ?? "",
      week: w.week,
      bowledOn: w.bowled_on,
      teamName: team.get(row.team_id) ?? "",
      opponent: team.get(opponent.get(`${row.week_id}:${row.team_id}`) ?? "") ?? null,
      average: row.average, handicap: row.handicap, pins: row.pins, games: row.games,
      toRaise: row.to_raise, toDrop: row.to_drop,
      scratchGames: row.scratch_games, scratchTotal: row.scratch_total,
      matchPointsYtd: row.match_points_ytd == null ? null : Number(row.match_points_ytd),
    });
    byBowler.set(row.bowler_id, list);
  }
  return { seasons, bowlers, weeks, seasonName, byBowler };
}

export async function loadRecordBook(scope?: string): Promise<RecordBook | null> {
  const data = await allWeeks();
  if (!data) return null;
  const { seasons, bowlers, weeks, seasonName, byBowler } = data;
  const inScope = (w: BowlerWeek) => !scope || w.seasonName === scope;
  // A bowler keeps one bls_id across seasons, so career rows merge on it.
  const merged = new Map<number, { name: string; weeks: BowlerWeek[] }>();
  for (const b of bowlers) {
    const rows = (byBowler.get(b.id) ?? []).filter(inScope);
    if (!rows.length) continue;
    const entry = merged.get(b.bls_id) ?? { name: displayName(b.name), weeks: [] };
    entry.weeks.push(...rows);
    merged.set(b.bls_id, entry);
  }
  const records = [...merged].map(([blsId, e]) => bowlerRecord(blsId, e.name, e.weeks))
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || a.name.localeCompare(b.name));
  const scoped = seasons.filter(s => !scope || s.name === scope);
  return {
    seasons: seasons.map(s => ({ name: s.name, weeksTotal: s.weeks_total })),
    scope: scope ?? null,
    records,
    coverage: coverage(scoped.map(s => ({ name: s.name, weeksTotal: s.weeks_total, weeks: weeks.filter(w => w.season_id === s.id).map(w => w.week) }))),
    ourTeam: records.find(r => OUR_BOWLER.test(r.name))?.teamName ?? "",
  };
}

export type BowlerPage = { record: BowlerRecord; perSeason: BowlerRecord[]; seasons: { name: string; weeksTotal: number }[] };

export async function loadBowler(blsId: number): Promise<BowlerPage | null> {
  const data = await allWeeks();
  if (!data) return null;
  const { seasons, bowlers, byBowler } = data;
  const rows = bowlers.filter(b => b.bls_id === blsId);
  if (!rows.length) return null;
  const weeks = rows.flatMap(b => byBowler.get(b.id) ?? []);
  if (!weeks.length) return null;
  const name = displayName(rows[0].name);
  return {
    record: bowlerRecord(blsId, name, weeks),
    perSeason: seasons.map(s => weeks.filter(w => w.seasonName === s.name)).filter(w => w.length).map(w => bowlerRecord(blsId, name, w)),
    seasons: seasons.map(s => ({ name: s.name, weeksTotal: s.weeks_total })),
  };
}

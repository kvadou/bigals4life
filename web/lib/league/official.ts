import type { Night } from "@/lib/scorebook";
import { displayName } from "./bls-parse";
import { GAMES_PER_NIGHT } from "./night-points";
import { contest, matchPoints, TEAM_GAME, TEAM_SERIES, WEEK_TOTAL, type MatchPoints } from "./points";

/** One bowler's line from Gary's sheet: the handicap bowled with that week and the scratch games. */
export type OfficialBowler = { name: string; handicap: number; games: number[] | null };
/** Our side of one week on Gary's sheet. */
export type OfficialWeek = { pointsWon: number; ourHdcpGames: number[]; theirHdcpGames: number[]; ours: OfficialBowler[]; theirs: OfficialBowler[] };

const find = (name: string, rows: OfficialBowler[]) => {
  const needle = name.trim().toUpperCase();
  return rows.find(r => { const d = displayName(r.name).toUpperCase(); return d === needle || d.startsWith(`${needle} `); });
};
const split = (s: [number, number], t: [number, number]): [number, number] => [s[0] - t[0], s[1] - t[1]];

/**
 * Match points for a night with Gary's sheet as the source of truth: his scores and handicaps for every bowler,
 * his team handicap games, and his points total. Our lineup order only decides who faced whom.
 */
export function officialMatchPoints(night: Night, sheet: OfficialWeek): MatchPoints | null {
  const m = night.match; if (!m) return null;
  const side = (lineup: { name: string; handicap: number }[], rows: OfficialBowler[]) => lineup.map(b => {
    const r = find(b.name, rows);
    return { name: b.name, handicap: r?.handicap ?? b.handicap, games: r?.games ?? Array<number | null>(GAMES_PER_NIGHT).fill(null) };
  });
  const p = matchPoints({ name: "Big Al's", bowlers: side(m.ours, sheet.ours) }, { name: m.opponent.name, bowlers: side(m.opponent.bowlers, sheet.theirs) }, GAMES_PER_NIGHT);
  const hasTeamGames = sheet.ourHdcpGames.length === GAMES_PER_NIGHT && sheet.theirHdcpGames.length === GAMES_PER_NIGHT;
  const games = hasTeamGames ? p.games.map((g, i) => ({ ...g, ours: sheet.ourHdcpGames[i], theirs: sheet.theirHdcpGames[i], split: contest(sheet.ourHdcpGames[i], sheet.theirHdcpGames[i], TEAM_GAME) })) : p.games;
  const seriesOurs = hasTeamGames ? sheet.ourHdcpGames.reduce((s, v) => s + v, 0) : p.series.ours;
  const seriesTheirs = hasTeamGames ? sheet.theirHdcpGames.reduce((s, v) => s + v, 0) : p.series.theirs;
  const series = { ours: seriesOurs, theirs: seriesTheirs, split: hasTeamGames ? contest(seriesOurs, seriesTheirs, TEAM_SERIES) : p.series.split };
  const team = games.reduce<[number, number]>((s, g) => [s[0] + g.split[0], s[1] + g.split[1]], series.split);
  const total: [number, number] = [sheet.pointsWon, WEEK_TOTAL - sheet.pointsWon];
  return { ...p, games, series, team, total, individual: split(total, team), remaining: 0 };
}

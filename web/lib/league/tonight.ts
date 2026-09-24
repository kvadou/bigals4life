import { database } from "@/lib/scorebook-server";
import { BOWLERS, localDate } from "@/lib/season";
import { nightSchema, type Night } from "@/lib/scorebook";
import { displayName } from "./bls-parse";
import { handicapFor } from "./points";
import { OUR_BOWLER } from "./standings-server";
import type { NextMatchup } from "./types";

type Row = Record<string, any>;

/** Week-N pairings read off Gary's sheets, for weeks ingested before league_weeks.next_matchups existed. */
const KNOWN: Record<string, Record<number, NextMatchup[]>> = {
  // TME 2026-27 WEEK 2.pdf roster lanes, matching WEEK 1's "Next Week 5- 4 1- 8 7- 3 2- 6".
  "Thursday Men's Early 2026-27": { 3: [{ lanes: "1-2", odd: 5, even: 4 }, { lanes: "3-4", odd: 1, even: 8 }, { lanes: "5-6", odd: 7, even: 3 }, { lanes: "7-8", odd: 2, even: 6 }] },
};

export type TonightBowler = { name: string; average: number; handicap: number };
export type Tonight = {
  today: string; date: string; leagueNight: boolean; time: string;
  season: string; week: number; lanes: string; lane: "odd" | "even";
  opponent: { number: number; name: string; bowlers: TonightBowler[] };
  ours: TonightBowler[];
  nightId: string | null;
};

const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Our pairing for the week after `week`, or null when neither the sheet nor the known schedule has it. */
export function ourMatchup(matchups: NextMatchup[], ourNumber: number) {
  const m = matchups.find(x => x.odd === ourNumber || x.even === ourNumber);
  if (!m) return null;
  return { lanes: m.lanes, lane: m.odd === ourNumber ? "odd" as const : "even" as const, opponent: m.odd === ourNumber ? m.even : m.odd };
}

/** The next league night from the latest ingested sheet: date, lanes, opponent roster, and tonight's scorebook if one exists. */
export async function loadTonight(now = new Date()): Promise<Tonight | null> {
  const [season]: Row[] = await database("league_seasons?select=id,name&order=name.desc&limit=1");
  if (!season) return null;
  const [latest]: Row[] = await database(`league_weeks?select=*&season_id=eq.${season.id}&order=week.desc&limit=1`);
  if (!latest) return null;
  const week = latest.week + 1;
  const [teams, bowlers, bowlerWeeks]: Row[][] = await Promise.all([
    database(`league_teams?select=id,number,name&season_id=eq.${season.id}`),
    database(`league_bowlers?select=id,name&season_id=eq.${season.id}`),
    database(`league_bowler_weeks?select=bowler_id,team_id,average,games,scratch_games&week_id=eq.${latest.id}`),
  ]);
  const me = bowlers.find(b => OUR_BOWLER.test(b.name));
  const ours = teams.find(t => t.id === bowlerWeeks.find(bw => bw.bowler_id === me?.id)?.team_id);
  if (!ours) return null;
  const matchups: NextMatchup[] = Array.isArray(latest.next_matchups) ? latest.next_matchups : KNOWN[season.name]?.[week] ?? [];
  const m = ourMatchup(matchups, ours.number);
  const them = m && teams.find(t => t.number === m.opponent);
  if (!m || !them) return null;
  const roster = (teamId: string) => bowlerWeeks.filter(bw => bw.team_id === teamId)
    .sort((a, b) => Number(!!b.scratch_games) - Number(!!a.scratch_games) || b.games - a.games)
    .map(bw => ({ name: displayName(bowlers.find(b => b.id === bw.bowler_id)?.name ?? ""), average: bw.average, handicap: handicapFor(bw.average) }));
  const ourRoster = roster(ours.id);
  const today = localDate(now.toISOString());
  const date = addDays(latest.bowled_on, 7);
  // Only a team-owned night counts: POST adds the caller to it, so an anonymous or legacy scorebook must never qualify.
  const [night]: Row[] = await database(`scorebooks?select=id&state->match->>season=eq.${encodeURIComponent(season.name)}&state->match->>week=eq.${week}&state->prebowl=is.null&owner_id=not.is.null&order=updated_at.desc&limit=1`);
  return {
    today, date, leagueNight: today === date, time: "6:50 PM",
    season: season.name, week, lanes: m.lanes, lane: m.lane,
    opponent: { number: them.number, name: them.name, bowlers: roster(them.id) },
    ours: BOWLERS.map(name => ourRoster.find(b => b.name.toUpperCase().startsWith(`${name.toUpperCase()} `)) ?? { name, average: 0, handicap: 0 }),
    nightId: night?.id ?? null,
  };
}

/** A fresh scorebook with tonight's match already set up: opponent, week, lane, and everyone's handicap. */
export function tonightNight(t: Tonight): Night {
  return nightSchema.parse({
    rolls: BOWLERS.map(() => []), game: 1, history: [],
    match: {
      season: t.season, week: t.week, lane: t.lane,
      opponent: { number: t.opponent.number, name: t.opponent.name, bowlers: t.opponent.bowlers.slice(0, 4).map(b => ({ name: b.name, handicap: b.handicap })) },
      ours: BOWLERS.map((name, i) => ({ name, handicap: t.ours[i]?.handicap ?? 0 })),
      opponentGames: [],
    },
  });
}

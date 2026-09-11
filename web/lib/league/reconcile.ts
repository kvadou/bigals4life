import type { Night } from "@/lib/scorebook";
import { ourGames } from "./night-points";
import { nightMatchPoints } from "./night-points";
import { displayName } from "./bls-parse";
import type { StandingsWeek } from "./types";

export type Discrepancy = { who: string; field: string; ours: string; gary: string };
export type Reconciliation = { nightId: string; opponent: string; checked: number; discrepancies: Discrepancy[] };

/** Compare what we entered live (a night with a match) against Gary's sheet for the same week. Gary's numbers stay canonical. */
export function reconcileNight(nightId: string, night: Night, sheet: StandingsWeek, ourTeamNumber: number): Reconciliation | null {
  const m = night.match; if (!m) return null;
  const out: Discrepancy[] = [];
  const roster = sheet.rosters.find(r => r.number === ourTeamNumber);
  const games = ourGames(night);
  let checked = 0;
  m.ours.forEach((b, i) => {
    const row = roster?.bowlers.find(x => displayName(x.name).toUpperCase().startsWith(b.name.toUpperCase() + " "));
    if (!row) return;
    if (!row.scratchGames) { if (games.some(g => g[i] != null)) out.push({ who: b.name, field: "games", ours: games.map(g => g[i] ?? "–").join(" · "), gary: row.absent ? "absent" : "no games" }); return; }
    row.scratchGames.forEach((g, k) => { checked++; const ours = games[k]?.[i]; if (ours != null && ours !== g) out.push({ who: b.name, field: `game ${k + 1}`, ours: String(ours), gary: String(g) }); });
    if (row.handicap !== b.handicap) out.push({ who: b.name, field: "handicap", ours: String(b.handicap), gary: String(row.handicap) });
  });
  const result = sheet.results.find(r => r.number === ourTeamNumber);
  const points = nightMatchPoints(night);
  if (result && points) {
    checked++;
    if (points.remaining === 0 && points.total[0] !== result.pointsWon) out.push({ who: "Team", field: "points", ours: String(points.total[0]), gary: String(result.pointsWon) });
    const opponent = sheet.teams.find(t => t.number === result.opponentNumber)?.name ?? "";
    if (opponent && !opponent.startsWith(m.opponent.name.slice(0, 8))) out.push({ who: "Team", field: "opponent", ours: m.opponent.name, gary: opponent });
    const theirs = sheet.rosters.find(r => r.number === result.opponentNumber);
    m.opponent.bowlers.forEach((b, i) => {
      const row = theirs?.bowlers.find(x => displayName(x.name).toUpperCase() === b.name.toUpperCase());
      row?.scratchGames?.forEach((g, k) => { checked++; const ours = m.opponentGames[k]?.[i]; if (ours != null && ours !== g) out.push({ who: displayName(b.name), field: `game ${k + 1}`, ours: String(ours), gary: String(g) }); });
    });
  }
  return { nightId, opponent: m.opponent.name, checked, discrepancies: out };
}

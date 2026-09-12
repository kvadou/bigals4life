import { analyze } from "@/lib/bowling";
import type { Night } from "@/lib/scorebook";
import { matchPoints, type MatchPoints, type TeamNight } from "./points";
import { BOWLERS } from "@/lib/season";

export const GAMES_PER_NIGHT = 3;

/** Our four bowlers' finished game scores for games 1..3, null while a game is unfinished. */
export function ourGames(night: Night): (number | null)[][] {
  const all = [...night.history.map(h => ({ game: h.game, rolls: h.rolls, finals: h.finals })), { game: night.game, rolls: night.rolls, finals: night.finals }];
  return Array.from({ length: GAMES_PER_NIGHT }, (_, g) => {
    const entry = all.find(e => e.game === g + 1);
    return Array.from({ length: 4 }, (_, i) => {
      if (!entry) return null;
      const final = entry.finals?.[i]; if (final != null) return final;
      const s = analyze(entry.rolls[i]); return s.complete ? s.score : null;
    });
  });
}

export function nightMatchPoints(night: Night): MatchPoints | null {
  const m = night.match; if (!m) return null;
  const games = ourGames(night);
  // Lineup order is not roster order: slot k is whoever we handed in k-th, so look up the rolls by name.
  const ours: TeamNight = { name: "Big Al's", bowlers: m.ours.map((b, i) => { const idx = BOWLERS.indexOf(b.name); return { name: b.name, handicap: b.handicap, games: games.map(g => g[idx >= 0 ? idx : i]) }; }) };
  const theirs: TeamNight = { name: m.opponent.name, bowlers: m.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: Array.from({ length: GAMES_PER_NIGHT }, (_, g) => m.opponentGames[g]?.[i] ?? null) })) };
  return matchPoints(ours, theirs, GAMES_PER_NIGHT);
}

import type { GameFacts } from "./facts";
import { statLine } from "./stats";

export type OpeningInput = {
  name: string;
  prebowl: boolean;
  opponent: string | null;
  paired: { name: string; handicap: number } | null;
  handicap: number | null;
  league: { average: number; toRaise: number | null } | null;
  games: GameFacts[];
  arsenal: string[];
};

export type Opening = { text: string; question: string | null };

const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

/** Deterministic first coach turn built from facts already in hand. No model call, so it is instant and never rate limited. */
export function openingMessage(input: OpeningInput): Opening {
  const done = input.games.filter(g => g.complete);
  if (!done.length) return beforeGames(input);
  const series = done.reduce((s, g) => s + g.stats.score, 0);
  const best = [...done].sort((a, b) => b.stats.score - a.stats.score)[0];
  const parts: string[] = [];
  parts.push(`${series} series over ${done.length} game${done.length === 1 ? "" : "s"}.`);
  if (best.stats.framesPlayed) parts.push(`Game ${best.game} was the one: ${best.stats.score} with ${statLine(best.stats)}${best.stats.tenth === "open" ? ", and an open tenth that cost a few" : ""}.`);
  else parts.push(`Game ${best.game} was the high one at ${best.stats.score}.`);
  if (input.league?.toRaise != null && done.length === 3) {
    parts.push(series >= input.league.toRaise ? `That raises your ${input.league.average} average.` : `You needed ${input.league.toRaise} to raise the ${input.league.average} average, so it dips.`);
  } else if (input.league?.toRaise != null) {
    const left = 3 - done.length;
    const need = input.league.toRaise - series;
    if (need > 0) parts.push(`${need} more over the last ${left === 1 ? "game" : `${left} games`} raises your average.`);
  }
  const rough = done.some(g => g.stats.opens >= 3);
  return { text: parts.join(" "), question: rough ? "Was that the lane or the release?" : "Which game felt best, and why?" };
}

function beforeGames(input: OpeningInput): Opening {
  const parts: string[] = [];
  if (input.prebowl) parts.push(`Pre-bowl night, ${input.name}. Just you and the lane.`);
  else if (input.paired) parts.push(`Tonight you're paired with ${title(input.paired.name)} (hdcp ${input.paired.handicap}${input.handicap != null ? `, yours ${input.handicap}` : ""}).`);
  else if (input.opponent) parts.push(`Tonight it's ${title(input.opponent)}.`);
  else parts.push(`Let's see what the night brings, ${input.name}.`);
  if (input.league?.toRaise != null) {
    const perGame = Math.ceil(input.league.toRaise / 3);
    parts.push(`A ${input.league.toRaise} series raises your ${input.league.average} average; ${perGame} a game does it.`);
  }
  parts.push("I'll have something to say once a game is in.");
  return { text: parts.join(" "), question: input.arsenal.length > 1 ? "What ball are you starting with?" : null };
}

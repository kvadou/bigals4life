import { z } from "zod";
import { validRolls } from "./bowling";

const rolls = z.array(z.number().int()).refine(validRolls,"Invalid roll sequence");
const scores = z.array(z.number().int().min(0).max(300).nullable()).length(4);
const lineupBowler = z.object({name:z.string().min(1).max(40),handicap:z.number().int().min(0).max(120)});
export const matchSchema = z.object({
  season:z.string().max(60),
  week:z.number().int().min(1).max(60),
  /** Odd lane hands names in first; even lane second and gets to stack. */
  lane:z.enum(["odd","even"]).optional(),
  opponent:z.object({number:z.number().int().min(0).max(99),name:z.string().min(1).max(40),bowlers:z.array(lineupBowler).min(1).max(8)}),
  ours:z.array(lineupBowler).length(4),
  /** opponentGames[gameIndex][bowlerIndex] scratch score, null until bowled. Indexed by game number - 1. */
  opponentGames:z.array(z.array(z.number().int().min(0).max(300).nullable()).max(8)).max(1000),
});
export type Match = z.infer<typeof matchSchema>;
export const nightSchema = z.object({
  game:z.number().int().min(1).max(1000),
  rolls:z.array(rolls).length(4),
  finals:scores.optional(),
  history:z.array(z.object({game:z.number().int().positive(),rolls:z.array(rolls).length(4),finals:scores.optional()})).max(500),
  match:matchSchema.optional(),
  /** A night bowled early for a week the team has not played yet. bowlers are indexes into BOWLERS; only those columns count. */
  prebowl:z.object({week:z.number().int().min(1).max(60),bowlers:z.array(z.number().int().min(0).max(3)).min(1).max(4)}).optional(),
  drinkTargets:z.object({high:z.number().int().min(0).max(300),low:z.number().int().min(0).max(300),qualificationRule:z.enum(["exact","threshold"]).nullable()}).optional(),
});
export type Night = z.infer<typeof nightSchema>;
export const uuidSchema = z.string().uuid();

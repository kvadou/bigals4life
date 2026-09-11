import { z } from "zod";
import { validRolls } from "./bowling";

const rolls = z.array(z.number().int()).refine(validRolls,"Invalid roll sequence");
const scores = z.array(z.number().int().min(0).max(300).nullable()).length(4);
export const nightSchema = z.object({
  game:z.number().int().min(1).max(1000),
  rolls:z.array(rolls).length(4),
  finals:scores.optional(),
  history:z.array(z.object({game:z.number().int().positive(),rolls:z.array(rolls).length(4),finals:scores.optional()})).max(500),
  drinkTargets:z.object({high:z.number().int().min(0).max(300),low:z.number().int().min(0).max(300),qualificationRule:z.enum(["exact","threshold"]).nullable()}).optional(),
});
export type Night = z.infer<typeof nightSchema>;
export const uuidSchema = z.string().uuid();

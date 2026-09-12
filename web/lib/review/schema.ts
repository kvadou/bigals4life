import { z } from "zod";

/** What a bowler can say about a game without knowing any jargon. Four show by default; the rest sit behind "more". */
export const TAGS = ["light", "high", "split", "bad break", "flush", "missed target", "washout", "pulled it", "fast feet"] as const;
export type Tag = (typeof TAGS)[number];
export const DEFAULT_TAGS: Tag[] = ["light", "high", "split", "bad break"];

const ideaSchema = z.object({ key: z.string().max(40), text: z.string().max(400), source: z.string().max(80), url: z.url(), agree: z.number().int().min(1).max(5) });
export const gameReviewSchema = z.object({
  ball: z.string().max(40).optional(),
  tags: z.array(z.enum(TAGS)).max(6).default([]),
  note: z.string().max(600).default(""),
});
export const reviewSchema = z.object({
  context: z.object({
    lanes: z.string().max(12).default(""),
    onPair: z.number().int().min(2).max(10).optional(),
    lefties: z.boolean().optional(),
    highRev: z.boolean().optional(),
    oil: z.string().max(40).default(""),
  }).prefault({}),
  games: z.array(gameReviewSchema).max(6).default([]),
  /** The conversation so far. A coach turn carries its ideas; a bowler turn is just text. */
  debrief: z.array(z.object({ role: z.enum(["coach", "bowler"]), text: z.string().max(2000), question: z.string().max(240).optional(), ideas: z.array(ideaSchema).max(3).optional(), at: z.string().max(40) })).max(8).default([]),
  closed: z.boolean().default(false),
});
export type Review = z.infer<typeof reviewSchema>;
export type GameReview = z.infer<typeof gameReviewSchema>;

export const profileSchema = z.object({
  arsenal: z.array(z.string().min(1).max(40)).max(12).default([]),
  hand: z.enum(["right", "left"]).default("right"),
  language: z.enum(["plain", "technical"]).default("plain"),
});
export type Profile = z.infer<typeof profileSchema>;

export const emptyReview = (): Review => reviewSchema.parse({});
export const emptyProfile = (): Profile => profileSchema.parse({});

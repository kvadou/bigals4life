# Last Night in Review (Bowling Bro, phase 1)

Source: Pete's "Bowling Bro' (BB) Vision Brief v2" (2026-09-12). Fold the Pillar 2 MVP into BA4L rather than start a second app: accounts, nights, rolls, photo OCR, and voice entry already exist here.

## Outcome

After a night, each bowler opens **Review** for that night and, in under three minutes on a phone, gets a debrief that summarizes what happened in plain language, asks one good follow-up question, and offers up to three sourced "ideas to try". Nothing beyond the scores is required; everything else is optional and scales the depth of feedback (brief: "enable granularity, never require it").

## What already exists (no work)

| Brief asks for | BA4L has |
|---|---|
| Scores, strike/spare counts per game | `night.rolls` per bowler, `analyze()` in `lib/bowling.ts` gives frames; counts are derivable |
| Photo of the monitor auto-populates scores | `/api/scoreboard` (Gemini 2.5 Flash) |
| Voice instead of thumb typing | `app/voice-entry.tsx` Web Speech pattern |
| Real accounts, persistent data | Supabase auth + `scorebooks` |
| Home center, league | Fixed: Big Al's, Thursday Men's Early |
| Handicap, average, season history | `league_*` tables from Gary's PDFs |

## Scope of this phase

1. **Derived stats per game per bowler**: strikes, spares, opens, first-ball average, clean frames, 10th-frame result. Pure function, tested.
2. **Review entry** (optional, per game): ball used (from a personal arsenal), lane, 3 to 5 tag chips, a note (typed or spoken).
3. **Night context** (optional, once per night): lane pair, how many on the pair, lefties/high-rev present, oil if known.
4. **Debrief**: one call to Gemini 2.5 Flash through the AI SDK (same as the recap), given the facts and a curated ideas library. Returns summary, one follow-up question, up to three ideas each with a source. Bowler answers the follow-up; one more turn; done.
5. **Profile**: bowler arsenal (ball names), hand, "plain language / technical" toggle stored but only plain language shipped.

Out of scope (phase 2): ball path sketcher, configurable tone, poker side game, OCR of other centers, split detection (needs pin positions we do not record).

## Data

Two JSON documents, validated with zod like `scorebooks.state`. Owner-scoped: a review belongs to one user and one night.

```sql
-- supabase/migrations/202609120003_reviews.sql
create table if not exists public.night_reviews (
  scorebook_id uuid not null references public.scorebooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bowler smallint not null check (bowler between 0 and 3),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (scorebook_id, user_id)
);
create table if not exists public.bowler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.night_reviews enable row level security;
alter table public.bowler_profiles enable row level security;
revoke all on public.night_reviews, public.bowler_profiles from anon, authenticated;
grant select, insert, update, delete on public.night_reviews, public.bowler_profiles to service_role;
```

```ts
// lib/review/schema.ts
import { z } from "zod";
export const TAGS = ["light", "high", "flush", "missed target", "split", "good shot bad break", "washout", "pulled it", "fast feet"] as const;
export const gameReviewSchema = z.object({
  ball: z.string().max(40).optional(),
  lane: z.number().int().min(1).max(60).optional(),
  tags: z.array(z.enum(TAGS)).max(6).default([]),
  note: z.string().max(600).default(""),
});
export const reviewSchema = z.object({
  context: z.object({ lanes: z.string().max(12).default(""), onPair: z.number().int().min(2).max(10).optional(), lefties: z.boolean().optional(), highRev: z.boolean().optional(), oil: z.string().max(40).default("") }).default({}),
  games: z.array(gameReviewSchema).max(6).default([]),
  debrief: z.array(z.object({ role: z.enum(["coach", "bowler"]), text: z.string().max(2000), ideas: z.array(z.object({ text: z.string(), source: z.string(), url: z.string().url() })).max(3).optional() })).max(8).default([]),
});
export type Review = z.infer<typeof reviewSchema>;
export const profileSchema = z.object({ arsenal: z.array(z.string().min(1).max(40)).max(12).default([]), hand: z.enum(["right", "left"]).default("right"), language: z.enum(["plain", "technical"]).default("plain") });
```

## Derived stats

```ts
// lib/review/stats.ts
import { analyze } from "@/lib/bowling";
export type GameStats = { score: number; strikes: number; spares: number; opens: number; cleanFrames: number; firstBallAvg: number; tenth: "XXX" | "X" | "/" | "open" | "" };
export function gameStats(rolls: number[]): GameStats {
  const { frames, score } = analyze(rolls);
  let strikes = 0, spares = 0, opens = 0, firstBalls: number[] = [];
  frames.forEach((f, i) => {
    if (!f.rolls.length) return;
    firstBalls.push(f.rolls[0]);
    if (i < 9) { if (f.rolls[0] === 10) strikes++; else if (f.rolls.length > 1 && f.rolls[0] + f.rolls[1] === 10) spares++; else if (f.complete) opens++; }
    else { /* 10th: count each mark */ let standing = 10; for (let k = 0; k < f.rolls.length; k++) { const r = f.rolls[k]; if (r === 10 && standing === 10) strikes++; else if (r === standing) spares++; standing = r === 10 || r === standing ? 10 : standing - r; } if (f.complete && f.rolls[0] < 10 && f.rolls[0] + (f.rolls[1] ?? 0) < 10) opens++; }
  });
  const played = frames.filter(f => f.rolls.length).length;
  return { score: score ?? 0, strikes, spares, opens, cleanFrames: played - opens, firstBallAvg: firstBalls.length ? Math.round(firstBalls.reduce((a, b) => a + b, 0) / firstBalls.length * 10) / 10 : 0, tenth: tenthLabel(frames[9]) };
}
```

Tests: 300 game (12 strikes, 0 opens), all-spares 190, a 9-frame game with an open 10th, empty rolls.

## Ideas library (curated, sourced, plain language)

```ts
// lib/review/ideas.ts
export type Idea = { key: string; when: string[]; plain: string; technical: string; source: string; url: string; agree: number };
export const IDEAS: Idea[] = [
  { key: "early-hook", when: ["high", "pulled it", "washout"], plain: "The ball is grabbing sooner than you want. Try a touch more speed or move a board or two deeper into the oil before you change balls.", technical: "Too much rev for ball speed or the oil has broken down where you are playing. Increase speed, move in, then consider surface.", source: "Brad & Kyle", url: "https://www.youtube.com/@BradandKyle", agree: 3 },
  { key: "late-hook", when: ["light", "missed target"], plain: "The ball is sliding through. Ease off the speed a little or move toward a fresher part of the lane before switching to a stronger ball.", technical: "Ball speed too high for the rev rate, or heavier oil than expected. Reduce speed, move out, then consider a duller surface.", source: "Mark Baker, The Game Changer", url: "https://markbakerbowling.com", agree: 3 },
  { key: "spare-ball", when: ["split", "missed target"], plain: "Shoot single-pin spares straight with your spare ball. Same feet, same target, every time.", technical: "Use a plastic spare ball and a fixed feet/target system for corner pins.", source: "USBC Bowling Academy", url: "https://www.bowlingacademy.com", agree: 3 },
  { key: "fast-feet", when: ["fast feet", "pulled it"], plain: "When the night speeds up, your feet do too. Start your approach a half-beat slower and let the ball swing.", technical: "Tempo control: slow the first step, keep the armswing free.", source: "Mark Baker, The Game Changer", url: "https://markbakerbowling.com", agree: 2 },
  { key: "bad-break", when: ["good shot bad break", "flush"], plain: "That was a good shot with a bad result. Change nothing yet; give it two more shots before you move.", technical: "Carry issue, not a line issue. Hold the line for two frames before adjusting.", source: "Brad & Kyle", url: "https://www.youtube.com/@BradandKyle", agree: 2 },
];
```

`agree` is the honest confidence signal: how many of the named sources say the same thing. Never a percentage.

## Debrief route

```ts
// app/api/review/[id]/debrief/route.ts  (POST { bowler, answer? })
const facts = factsText(night, bowler, stats, review, profile);           // numbers, tags, notes only
const candidates = IDEAS.filter(i => i.when.some(t => tagsTonight.has(t))); // decision tree, not free invention
const { object } = await generateObject({
  model: "google/gemini-2.5-flash", maxRetries: 1, abortSignal: AbortSignal.timeout(30_000),
  schema: z.object({ summary: z.string().max(600), question: z.string().max(200), ideaKeys: z.array(z.string()).max(3) }),
  system: `You are a friendly bowling coach debriefing one bowler after league night. Plain language, no jargon, 80 to 120 words. Use only the facts given; never invent scores or events. Pick ideas ONLY from the candidate list by key; pick none if nothing fits. Ask exactly one short follow-up question that would narrow the cause (e.g. "did it start going high before or after the break?"). Never diagnose; frame ideas as things to try.`,
  prompt: `${facts}\n\nCandidate ideas:\n${candidates.map(i => `${i.key}: ${i.plain}`).join("\n")}\n\n${answer ? `Bowler's answer to your last question: ${answer}` : ""}`,
});
```

Ideas are resolved back to the library rows (text + source + url) server-side, so the model cannot invent a source.

## UI

New route `app/review/[id]/page.tsx` (id = scorebook). Mobile-first, one column, the same card language as the week page.

1. **Header**: "Week 2 · Sat Sep 12 · Pete" with series and per-game chips (score · X strikes · / spares · opens).
2. **Per game card**: stat row, ball select (arsenal + "add"), tag chips, note field with mic button.
3. **Night context** (collapsed by default): lanes, on pair, lefties, high-rev, oil.
4. **Debrief card**: "Talk it through now, or tomorrow?" then the coach turn: summary, ideas as cards with source line, the question, an answer box (voice or type). Second coach turn closes with "Aim for next week: ..."
5. Entry points: week page bowler row → "Review", night page after game 3 → "Review your night", home pre-bowl card.

Design canvas: `/design` mockups of 1 through 4 for review before build.

## Verification

- `bun test` on stats and schema.
- `pw-verify` on `/review/<id>` with a minted session; screenshot read.
- Debrief run once against week 1 for Doug with real rolls; output pasted into the PR text.

## Steps

1. Migration + schemas + stats + tests (30 min).
2. `/api/review/[id]` GET/PUT (review + profile) with member check via `access()` (30 min).
3. Review page: header, game cards, context (60 min).
4. Ideas library + debrief route + debrief card (60 min).
5. Entry links, LEARNED entries, deploy (20 min).

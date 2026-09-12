import { z } from "zod";
import { access, decide, denied, identify, unauthorized } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/scorebook-server";
import { uuidSchema } from "@/lib/scorebook";
import { BOWLERS } from "@/lib/season";
import { profileSchema, reviewSchema } from "@/lib/review/schema";
import { bowlerGames } from "@/lib/review/facts";
import { loadNight, loadReviewAndProfile, pickBowler } from "@/lib/review/server";

import { prepareConditionalSave, ReviewConflict, conflictResponse } from "@/lib/review/conditional-save";

type Context = { params: Promise<{ id: string }> };

/** Everything the review page needs: the night, this bowler's games, their review so far, and their profile. */
export async function GET(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to review your night.");
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid night link." }, { status: 400 });
  const verdict = decide("read", await access(identity, id.data), true);
  if (verdict.status !== 200) return denied(verdict);
  try {
    const loaded = await loadNight(id.data);
    if (!loaded) return Response.json({ error: "Night not found." }, { status: 404 });
    const { night, bowledOn } = loaded;
    const mine = await loadReviewAndProfile(id.data, identity.user.id);
    const requested = new URL(request.url).searchParams.get("bowler");
    // Missing/invalid query means use the saved bowler or account profile, never implicit column zero.
    const requestedBowler = requested !== null && /^[0-3]$/.test(requested) ? Number(requested) : Number.NaN;
    const bowler = pickBowler(requestedBowler, mine.bowler, mine.bowlerName, night);
    return Response.json({
      night: { week: night.prebowl?.week ?? night.match?.week ?? null, bowledOn, prebowl: night.prebowl ?? null, opponent: night.match?.opponent.name ?? null, games: bowlerGames(night, bowler) },
      bowler, names: BOWLERS, review: mine.review, profile: mine.profile,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Review load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not load the review right now." }, { status: 503 });
  }
}

const putSchema = z.object({
  bowler: z.number().int().min(0).max(3), review: reviewSchema.optional(), profile: profileSchema.optional(),
  expectedReview: reviewSchema.optional(), expectedProfile: profileSchema.optional(),
}).refine(body => (body.expectedReview === undefined || body.review !== undefined) && (body.expectedProfile === undefined || body.profile !== undefined));

/** Save the review and/or the profile. Teammates can read a night; each writes only their own review. */
export async function PUT(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to save your review.");
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website to save a review." }, { status: 403 });
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid night link." }, { status: 400 });
  const verdict = decide("read", await access(identity, id.data), true);
  if (verdict.status !== 200) return denied(verdict);
  let body; try { body = putSchema.parse(await request.json()); } catch { return Response.json({ error: "That review did not look right." }, { status: 400 }); }
  try {
    const pending = await prepareConditionalSave(id.data, identity.user.id, body);
    if (body.review) await pending.review(body.review, body.bowler);
    if (body.profile) await pending.profile(body.profile);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewConflict) return conflictResponse();
    console.error("Review save failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not save. Your notes are still on this screen; try again in a moment." }, { status: 503 });
  }
}

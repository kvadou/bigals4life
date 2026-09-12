import { database } from "@/lib/scorebook-server";
import { nightSchema, type Night } from "@/lib/scorebook";
import { BOWLERS, localDate } from "@/lib/season";
import { emptyProfile, emptyReview, profileSchema, reviewSchema, type Profile, type Review } from "./schema";

type Row = Record<string, any>;

export async function loadNight(id: string): Promise<{ night: Night; bowledOn: string } | null> {
  const [[row], [first]]: Row[][] = await Promise.all([
    database(`scorebooks?id=eq.${id}&select=state,updated_at`),
    database(`scorebook_revisions?scorebook_id=eq.${id}&revision=eq.1&select=recorded_at`),
  ]);
  if (!row) return null;
  const parsed = nightSchema.safeParse(row.state);
  if (!parsed.success) return null;
  return { night: parsed.data, bowledOn: localDate(first?.recorded_at ?? row.updated_at) };
}

export async function loadReviewAndProfile(id: string, userId: string): Promise<{ bowler: number | null; review: Review; profile: Profile; bowlerName: string | null }> {
  const [[reviewRow], [profileRow], [me]]: Row[][] = await Promise.all([
    database(`night_reviews?scorebook_id=eq.${id}&user_id=eq.${userId}&select=bowler,state`),
    database(`bowler_profiles?user_id=eq.${userId}&select=state`),
    database(`profiles?user_id=eq.${userId}&select=bowler_name`),
  ]);
  return {
    bowler: reviewRow?.bowler ?? null,
    review: reviewRow ? (reviewSchema.safeParse(reviewRow.state).data ?? emptyReview()) : emptyReview(),
    profile: profileRow ? (profileSchema.safeParse(profileRow.state).data ?? emptyProfile()) : emptyProfile(),
    bowlerName: me?.bowler_name ?? null,
  };
}

export async function saveReview(scorebookId: string, userId: string, bowler: number, review: Review) {
  await database("night_reviews?on_conflict=scorebook_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ scorebook_id: scorebookId, user_id: userId, bowler, state: review, updated_at: new Date().toISOString() }) });
}

export async function saveProfile(userId: string, profile: Profile) {
  await database("bowler_profiles?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, state: profile, updated_at: new Date().toISOString() }) });
}

/** Which column is "me": the URL, then a saved review, then the profile's bowler name, then the lone pre-bowler, then Doug. */
export function pickBowler(requested: number, saved: number | null, bowlerName: string | null, night: Night): number {
  if (Number.isInteger(requested) && requested >= 0 && requested <= 3) return requested;
  if (saved != null) return saved;
  const byName = bowlerName ? BOWLERS.findIndex(b => b.toLowerCase() === bowlerName.toLowerCase()) : -1;
  if (byName >= 0) return byName;
  if (night.prebowl?.bowlers.length === 1) return night.prebowl.bowlers[0];
  return 0;
}

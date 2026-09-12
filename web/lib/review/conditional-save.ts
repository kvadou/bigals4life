import { isDeepStrictEqual } from "node:util";
import { database } from "@/lib/scorebook-server";
import { emptyProfile, emptyReview, profileSchema, reviewSchema, type Profile, type Review } from "./schema";
import { saveProfile, saveReview } from "./server";

export class ReviewConflict extends Error {}
export function conflictResponse() {
  return Response.json({ error: "Your review or profile changed on another device. Not all edits were saved. Keep your draft and reload the latest version before retrying." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
}
type StoredState = { state: unknown; bowler?: number };
type ConditionalWrite = { table: "night_reviews" | "bowler_profiles"; filter: string; keys: string; row: StoredState | undefined; value: Record<string, unknown> };

/** The affected-row representation proves the condition still held at the write itself.
 * A missing row is inserted without overwriting any concurrent insert.
 */
async function write(change: ConditionalWrite) {
  const rows = change.row
    ? await database(`${change.table}?${change.filter}&state=eq.${encodeURIComponent(JSON.stringify(change.row.state))}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(change.value),
    })
    : await database(`${change.table}?on_conflict=${change.keys}`, {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(change.value),
    });
  if (!Array.isArray(rows) || rows.length !== 1) throw new ReviewConflict();
}

/** Precheck every supplied GET-visible baseline before writing or invoking the coach.
 * Defaults returned by GET match absent rows. Existing raw JSONB (including key order/default omissions)
 * is retained for the atomic predicate. Review + profile are separate rows, not a transaction:
 * a later conflict can leave the first write applied, so clients keep drafts and reload both on 409.
 */
export async function prepareConditionalSave(id: string, userID: string, expected: { expectedReview?: Review; expectedProfile?: Profile }) {
  const reviewFilter = `scorebook_id=eq.${id}&user_id=eq.${encodeURIComponent(userID)}`;
  const profileFilter = `user_id=eq.${encodeURIComponent(userID)}`;
  const [reviewRows, profileRows]: StoredState[][] = await Promise.all([
    expected.expectedReview !== undefined ? database(`night_reviews?${reviewFilter}&select=state,bowler`) : Promise.resolve([]),
    expected.expectedProfile !== undefined ? database(`bowler_profiles?${profileFilter}&select=state`) : Promise.resolve([]),
  ]);
  const reviewRow = reviewRows[0], profileRow = profileRows[0];
  if (expected.expectedReview !== undefined) {
    const current = reviewRow ? reviewSchema.safeParse(reviewRow.state).data : emptyReview();
    if (!current || !isDeepStrictEqual(current, expected.expectedReview)) throw new ReviewConflict();
  }
  if (expected.expectedProfile !== undefined) {
    const current = profileRow ? profileSchema.safeParse(profileRow.state).data : emptyProfile();
    if (!current || !isDeepStrictEqual(current, expected.expectedProfile)) throw new ReviewConflict();
  }
  return {
    async review(value: Review, bowler: number) {
      if (expected.expectedReview === undefined) return saveReview(id, userID, bowler, value);
      await write({ table: "night_reviews", filter: reviewFilter + (reviewRow ? `&bowler=eq.${reviewRow.bowler}` : ""), keys: "scorebook_id,user_id", row: reviewRow,
        value: { scorebook_id: id, user_id: userID, bowler, state: value, updated_at: new Date().toISOString() } });
    },
    async profile(value: Profile) {
      if (expected.expectedProfile === undefined) return saveProfile(userID, value);
      await write({ table: "bowler_profiles", filter: profileFilter, keys: "user_id", row: profileRow,
        value: { user_id: userID, state: value, updated_at: new Date().toISOString() } });
    },
    /** Debrief never writes a profile. Recheck its raw snapshot after generation before saving the turn.
     * A change after this read can make the advice stale, but cannot be overwritten by this operation.
     */
    async checkProfile() {
      if (expected.expectedProfile === undefined) return;
      const rows: StoredState[] = await database(`bowler_profiles?${profileFilter}&select=state`);
      if (!isDeepStrictEqual(rows[0]?.state, profileRow?.state)) throw new ReviewConflict();
    },
  };
}

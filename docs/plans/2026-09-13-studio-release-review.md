# BA4L Live Studio release review

Implemented locally, not deployed. Signed build 14 archive is ready locally; TestFlight 13 remains the published version. This update needs the authorization/schema review required by Doug's AGENTS.md before push or production migration.

## What changed

Web and native iPhone/iPad now offer League night, Pre-bowl, Practice and Hangout. Audience is independent: Only me, Team or Invited people. Competitive activities require a matching authorized scorebook. Practice and social sessions never attach or write competitive scores.

Private recording is explicit and silent. Native recordings persist in an account-scoped, backup-excluded local library, with deletion, export, last-ten-second trimming and two-clip slow motion. Native shared replay can be saved to that library. Browser recordings remain in the tab and must be downloaded to keep; manual recording, a bounded ten-second rolling buffer and two-clip playback are available. Recording and broadcasting stop on leaving their capture flow. Shared video uses no microphone.

The studio distinguishes local camera frames, upstream counters, published cameras, connected devices and fresh receiving-device reports. A connection alone does not prove delivery. Reports expire after fifteen seconds.

## Lines requiring review

- `web/lib/live-v2.ts` and `web/app/api/live/v2/sessions/`: new session access, token issuance, invitation, ending and health paths. Creator must be a confirmed team member. Team scope is checked on each access, including the owner. Competitive viewers must retain book access; publishing requires the owner to retain editing rights. Health rejects revoked publishing grants.
- `web/supabase/migrations/202609130001_live_sessions_v2.sql`: new session, invitation and connection tables. RLS enabled; direct anon/authenticated table access revoked; access through server checks. Sessions expire within eight hours. Unique bounded connection slots prevent races exceeding the 200-connection cap.
- `web/proxy.ts`: confirmed invited guests may open the exact `/studio` shell. Session APIs still enforce invitation/team/book access. Other league routes remain restricted. No general waiting-page rewrite change is included.
- `ios/Sources/AppRootView.swift`: waiting users can open their invited studios or private practice. Existing league access is unchanged.
- `ios/Sources/SharedLiveLaneView.swift`: V2 token and ongoing access checks while preserving legacy room behavior.

Inviting adds access for an email address. It does not send email. The host explicitly shares the link. A guest must sign in with the invited, confirmed address. Tokens are camera-only, no data publishing, and short-lived. Health stores bounded counters rather than footage or credentials. Physical remote delivery remains unverified.

## Verification

- Full web suite: 96 tests and 61,344 assertions passed, including publisher-revocation and terminal-health teardown regressions. Production build passed.
- Browser: synthetic moving camera, real playable manual recording, playable ten-second replay, half-speed comparison, cleanup and activity/book isolation. Responsive screenshots from 320 to 1920 pixels inspected. `/studio` passed pw-verify. This is local fixture verification, not a production-provider end-to-end claim.
- Native: signed release archive completed; phone and iPad studio/library/comparison screenshots rendered in an isolated fixture harness and inspected. XCTest interaction runner was blocked by the host debugger, so native round-trip interactions are not claimed verified; 13 real synthetic media/storage checks including trimming, imports, quotas, account isolation and deletion; 36 contrast pairs and 14 prominent-button guards.
- Migration applied and constraints tested in a disposable local PostgreSQL cluster. Production database untouched.

## Release order after approval

1. Push the reviewed main commit and apply the reviewed additive migration using the established deployment credentials without printing them.
2. Verify Vercel deploy and authorized session creation, invitation isolation, publishing, receiving and termination against the real provider.
3. Upload signed iOS build 14 through `ios/Tools/testflight.ts ship`, verify Apple processing and internal testing availability.
4. Pair a physical iPhone/iPad sender with another receiving device. Check rear-camera picture, orientation, interruption/reconnect, recording and actual decoded remote frames.

Do not claim the reported physical black-preview problem fixed until step 4 passes. Automatic bowler recognition, scoring, ball-path or oil-pattern estimation are outside this implementation. Browser comparison starts both clips together but is not frame-accurate synchronization. No production changes have been applied by this work.

## Peanut Gallery addendum

Added session commentary, coaching tips, six quick reactions and editable preset chirps on web and native. Viewer Hide is local; host Pause and Remove are session-wide, confirmed actions. Video permissions and microphone behavior remain unchanged. Feed fetches latest50 posts every3seconds while visible/connected. Only confirmed server responses add posts; labels are display-only profile names, never permission inputs or email fallbacks.

Additional review files: `web/lib/auth-server.ts` (optional sanitized display-name metadata), `web/lib/live-v2.ts` gallery handlers, new gallery API route, and `202609130002_live_gallery.sql`. The migration creates a private RLS table, bounded2000slots and an insert trigger checking committed pause/end/expiry. Checked in disposable PostgreSQL with service-role inserts, client denial, cap/unique constraints, pause/end rejection and cascade cleanup. No production migration applied.

This addendum is part of the same unpublished candidate. Text commentary is implemented; voice chat is not enabled.

Gallery verification: full suite97tests/61,346assertions;17browserfixturechecks andpw-verify;11native model checks independently rerun; phone/iPad gallery fixture screenshots inspected; signedbuild14 archive rebuilt with gallery. Real multi-device production messages and native tap/lifecycle flows remain unverified.

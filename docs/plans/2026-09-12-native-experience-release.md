# BA4L native experience release

Doug explicitly authorized shipping web to Vercel and iOS to TestFlight on September 12 after reviewing the native parity direction. This supersedes the prior release hold for the prepared parity commit.

## Outcome

Native SwiftUI for iPhone and iPad, using the same authenticated web APIs and database. Tonight becomes the main starting point, with account-specific bowler selection, direct scoring and review, and Season access. Existing league, match, records, review and account functionality stays available.

## Data durability

Review drafts are written atomically per account, night and bowler before autosave. The server compares expected review/profile state; conflicts keep the local draft for explicit resolution. Debrief generation checks the same baseline before and after AI work.

Offline scoring persists queued snapshots before displaying changes. Reconnection recognizes lost acknowledgements and uses the server revision to avoid overwriting another device. Authorization, validation and storage failures retain the backup and stop writes.

## Verification and release

Run native scoring, authorization, models, profile and reconciliation checks; web route tests and production build. Inspect the native Tonight and review screens on iPhone and iPad. Rebuild a signed archive from final source, deploy Vercel production, upload build 5, confirm Apple processing and internal group availability. No production bowling records are edited for testing.

## Verified release checks

- Native runner passed 209,764 scoring/store checks, 62 account checks, 17 voice checks, draft/model tests, 700 match fixtures and profile isolation.
- Web passed 61 tests / 59,575 assertions and production build.
- Signed simulator and Release archive builds succeeded. Archive identifies 1.0(5), iPhone and iPad device families, correct public auth host/configuration and privacy manifest.
- Simulator visual checks: iPhone Tonight, iPad two-column Tonight and Review, largest accessibility text/dark mode. Corrected asset-component formatting so primary labels render white on dark green, and prevented primary action truncation at largest text. Non-fixture startup shows the real sign-in screen without Keychain errors.
- Main pushed through 8a5c1ac. Vercel deployment dpl_7sRL1Ze5dtJCQUnDzcLUiFanL1Sj reports Ready and owns bigals4life.com and www.bigals4life.com.
- Production season verified after deployment: Week 1 remains three completed games, 1849 series and 26-10 points. Protected records, scorebook and review endpoints return401 without credentials. No production score edits performed.

Native account and sync tests use isolated transport fixtures. Physical-device camera/dictation and real-account native sign-in remain field verification, not claimed as tested here. Review/profile conditional writes are separate rows: a race can partially save and return409; the client keeps its draft and reloads both before explicit resolution.

## TestFlight completion

Apple reports build 1.0(5), ID a19117e1-2ec5-4bc8-a269-9a0f7e813785, VALID. Distribution to the existing internal group f00174f2-8263-4343-8663-4dd20f24dfdb succeeded, and group membership was verified through the API. Both requested deployments are complete.

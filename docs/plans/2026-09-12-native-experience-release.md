# BA4L native experience release

Doug explicitly authorized shipping web to Vercel and iOS to TestFlight on September 12 after reviewing the native parity direction. This supersedes the prior release hold for the prepared parity commit.

## Outcome

Native SwiftUI for iPhone and iPad, using the same authenticated web APIs and database. Tonight becomes the main starting point, with account-specific bowler selection, direct scoring and review, and Season access. Existing league, match, records, review and account functionality stays available.

## Data durability

Review drafts are written atomically per account, night and bowler before autosave. The server compares expected review/profile state; conflicts keep the local draft for explicit resolution. Debrief generation checks the same baseline before and after AI work.

Offline scoring persists queued snapshots before displaying changes. Reconnection recognizes lost acknowledgements and uses the server revision to avoid overwriting another device. Authorization, validation and storage failures retain the backup and stop writes.

## Verification and release

Run native scoring, authorization, models, profile and reconciliation checks; web route tests and production build. Inspect the native Tonight and review screens on iPhone and iPad. Rebuild a signed archive from final source, deploy Vercel production, upload build 5, confirm Apple processing and internal group availability. No production bowling records are edited for testing.

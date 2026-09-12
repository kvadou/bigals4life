# BA4L native feature parity

## Evidence and outcome

The installed native app is a shared scorekeeper, not yet the league application. Both the canonical and legacy host return HTTP 401 for Week 1 to its unauthenticated client. The app has no sign-in, does not discover memberships or season nights, and rejects newer prebowl and lane fields. This is a client/API compatibility failure; no evidence of a second database was found. Preserve all device backups and never reimport or overwrite Week 1 to solve it.

## Gap analysis

| Area | Web | Native before this work | Implementation |
| --- | --- | --- | --- |
| Account | OTP, password, refresh, membership | None | Supabase REST, Keychain session, shared bearer transport |
| Discovery | Account scorebooks and season | Paste one old-domain link | Account-scoped season and recent nights |
| History | Week/game details, points | One night history | Native season sidebar and week detail |
| Scoring | Pins, finals, scan | Present | Preserve existing native core, authenticate scan |
| Match | Opponent, lineup, lane, points | Model only | Native setup and opponent scores |
| Prebowl | Week/participant selection | Rejects payload | Preserve typed metadata and controls |
| Targets | Beer numbers and rule | Model only | Native controls |
| League | Standings, roster, recap, history | None | Native shared API views |
| Records | Record book and career | None | Authenticated wrappers over existing loaders, native views |
| Review | Lane/profile notes, tags, coaching | None | Native review forms and debrief |
| Voice | Preview and confirmed entry | None | Native dictation/entry flow with stale-state validation |
| Membership | Claim, invite, roles | None | Enforce loaded role; account access states |

## Plan and invariants

Use native SwiftUI navigation, semantic typography and adaptive iPhone/iPad layouts. Existing JSON APIs remain the data source; records receive thin wrappers, not a second database. The native-first approach is the default pending Doug's architecture preference.

1. Fix compatible state and links, preserving unknown-field rejection.
2. Add shared authentication and automatic season discovery. Scope saved native accounts separately and do not migrate unsent changes to another account. Fetch before editing shared scores.
3. Add native league/history/match/review feature surfaces.
4. Verify schema and scoring regressions, mocked session isolation/expiry, iPhone/iPad rendering and API access. Keep fixture data out of production.
5. Prepare a reviewable commit. Authentication and new protected routes are tier 1 under Doug's AGENTS rules: no autonomous push, Human-Reviewed trailer, or TestFlight upload before review.

Core integration:
```swift
ScorebookClient(send: { request in try await session.send(request) })
SeasonView(send: { request in try await session.send(request) }, onOpenNight: openNight)
```

Verification must distinguish mocked tests from authenticated production data checks. A successful build does not prove account access or TestFlight availability. Update this document with verified completed features and any remaining gaps before handoff.

## Implemented outcome

Native-first implementation now includes all table areas: shared account/session, automatic latest-night discovery, Season/week/game/frame history, full match metadata controls, live points and targets, league/records/career, review/coaching, team management and keyboard-dictated roll preview. iPhone uses native tab/push navigation; iPad uses a season sidebar and wider score/detail layouts. Original device backups have a read-only recovery/export screen.

Additional reviewed corrections: never carry permissions across a failed team switch; viewers cannot retry writes; stale account transports cannot use another identity; changing league opponents clears old opponent scores. New authenticated non-teammates cannot grant themselves league access by creating a scorebook. Existing anonymous legacy enforcement policy is unchanged.

## Verification

- Signed-in website: two season entries found, Week 1 complete (1849 series, 26-10); Week 2 pre-bowl also listed. No league data edited.
- Native runner: 209692 scoring/store checks, 9 schema-validated payloads, 62 account security/lifecycle checks, 17 voice checks, model fixtures and 700 web/native match-point parity fixtures.
- iPhone 17e / iPad Pro 11-inch simulators: native navigation and loading with isolated synthetic transport. Inspected Season/week, scoring, setup, standings, records/career and review. Phone portrait/landscape, dark mode and maximum accessibility text checked.
- Simulator and device Release builds compile. Web tests/build pass; protected-record endpoints tested with isolated auth/database mocks.
- Independent review found and reverified failed-team-switch role handling; regressions are checked in.

## Release boundary and known limits

Build 5 is a review candidate, not a TestFlight release. Finish final signed archive and commit, then Doug reviews auth/API diff per AGENTS before push, Vercel deployment of records APIs, or TestFlight upload. No Human-Reviewed trailer may be added by the agent. Installed build 4 still lacks auth.

Native live-account sign-in and physical-device camera/dictation are not yet verified. Review notes retain unsaved edits in screen memory but do not yet persist offline drafts across termination. Keyboard dictation is used rather than a custom always-listening microphone. Legacy archives export for recovery and never auto-merge into another account.

Final candidate verification: 60 web tests / 59,573 assertions and production web build passed. The final native test runner and signed archive succeeded. Build 5 archive is at `~/Library/Developer/Xcode/Archives/BA4L/build-5/BA4L.xcarchive`; no upload was performed. Final signed simulator startup has no Keychain error (unsigned simulator binaries cannot exercise this correctly). Frame drilldown and original-device archive recovery were also inspected on iPhone. Physical-device and real-account sign-in verification remain explicit follow-up checks.

Public client configuration: the pre-commit scanner initially rejected the public Supabase JWT. No bypass or scanner exception was used. The token now stays in ignored local xcconfig generated from the existing public web environment; the checked-in plist uses a build-setting reference. Signed archive validation confirms the setting expanded and is the anonymous public role. The generator rejects server keys and malformed inputs; its independent review caught and corrected a JWT segment-count mismatch.

## Subsequent release authorization and experience pass

Doug approved proceeding with this plan and explicitly requested Vercel and TestFlight deployment. This supersedes the earlier candidate release hold above. The subsequent experience pass adds Tonight, personalized bowler choice, durable review drafts with conditional server saves, and offline score queue reconciliation. Final release evidence lives in `2026-09-12-native-experience-release.md`.

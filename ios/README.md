# BA4L

Native SwiftUI iOS 17+ companion for iPhone and iPad. The app uses the same Supabase identity and HTTPS APIs as bigals4life.com. It does not have a separate league database.

## Account and score discovery

Sign in with the same email code or password as the web app. Season discovers the account's shared nights, including earlier weeks and pre-bowls. A fresh empty account workspace opens its latest recorded night automatically. Uninvited accounts wait for team access. Canonical and legacy scorebook links can still be pasted into Score > Team; HTTPS links do not automatically launch the app.

Tokens use Keychain, refresh through Supabase, and are only sent to the canonical BA4L API. Only the public Supabase URL/anonymous client key are bundled. Run `bun ios/Tools/configure-auth.ts` before the first Xcode build; it reads the existing public web key into ignored `ios/Config/LocalAuth.xcconfig`. The TestFlight helper runs this automatically. Service-role credentials are never included. Account-specific defaults and backup directories prevent pending edits being attributed to another account. Sign-out keeps the web session intact.

## Native features

- Season/week/game navigation with individual totals, points, and frame-by-frame history.
- Scorecards, pin entry, finals, undo, next game, and authenticated camera scanning.
- Match setup, ordered lineup, handicaps, opponent scores, pre-bowling and beer numbers.
- Local live match points, target tracking, and lineup coaching from the existing web API.
- League standings, roster, recap, records and bowler careers.
- Bowling Bro' review notes, tags, lane context, arsenal and saved coaching conversations.
- Explicit team invitations/legacy claiming, password changes, and account sign-out.
- Dictated or typed roll entry using the native keyboard, with preview and stale-score protection.

Shared score edits are atomically backed up before sending. Revision conflicts and non-connectivity failures stop edits and preserve recovery data. Recognized connection failures allow a durable offline queue that reconciles against the server revision before upload. Viewer roles cannot edit or retry a pending write. Original pre-account scorecards are accessible read-only from Account > Original device scorecards, with export for recovery. They are not automatically imported into an account. Review notes and answers persist atomically per account, night and bowler. Cross-device changes require explicit conflict resolution.

The bundle identifier remains `com.dougkvamme.StrikeCeiling`, preserving upgrades and original device data. Regenerate from repository root using `xcodegen generate --spec ios/project.yml`.

## Verification and release status

Run `bun ios/Tests/run.ts` for scoring/store, account security/lifecycle, voice entry, model contract, web-schema payload and match-point parity tests. Tests use synthetic responses, not production accounts. The DEBUG-only simulator fixture transport cannot use real networking and is excluded from Release builds.

2026-09-12: gap analysis confirmed Week 1 on the signed-in website, team series 1849 and match 26-10. Native/API tests and simulator checks cover the new feature surfaces. See `docs/plans/2026-09-12-native-feature-parity.md` for final evidence. Build 1.0(5) is VALID in App Store Connect and available to the internal TestFlight group; web APIs are live on bigals4life.com. Real-account native login and physical-device camera/dictation remain field verification. Doug explicitly authorized Vercel and TestFlight deployment on September 12.

## TestFlight release

App Store Connect: [BA4L](https://appstoreconnect.apple.com/apps/6810936804/testflight/ios).

Run from the repository root:

- `bun ios/Tools/testflight.ts status` checks the app and Apple build-processing status.
- `bun ios/Tools/testflight.ts archive` creates a signed archive without uploading.
- `bun ios/Tools/testflight.ts ship` archives and uploads through the same App Store Connect API-key path used by PMV and Jot.

Increase `CURRENT_PROJECT_VERSION` in `ios/project.yml` for each new build. A repeated upload of an already-listed build is skipped; a local upload receipt also protects the processing window. If upload fails ambiguously, check status and the protected local upload log before retrying. The script never prints the API key or JWT. Credentials remain in `~/.appstoreconnect/credentials.env` and its `private_keys` directory. Signing, version, and encryption settings live in project.yml and survive xcodegen regeneration. Logs and archives live under `~/Library/Developer/Xcode/Archives/BA4L/build-N/`.

`bun ios/Tools/generate-icon.ts` regenerates the opaque 1024px icon from its vector source using the web app's installed sharp dependency.

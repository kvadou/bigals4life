# BA4L

Native SwiftUI iOS 17+ bowling companion sharing the web app's team scorebooks. Tracks Doug, Mustafa, Kyle and Pete, with scorecards, maximum possible finishes, team totals, final-only scores, undo, game history, and next-game transitions for all four bowlers.

Tap **Team**, then paste the web app's **Share team link** to open the same scores. Alternatively, **Save & share with team** creates a new scorebook. Opening an HTTPS link in Safari does not automatically launch the native app; paste it into Team. The selected team resumes after relaunch. Foreground polling refreshes every five seconds.

Local mode works without a connection. Shared edits are backed up atomically before sending and use the server's revision checks. Failed saves pause editing. Retry recognizes a saved request whose response was lost; it never overwrites a newer conflicting team revision. Discard/reload requires confirmation and retains a recovery archive. Backups live in the app's Application Support/Scorebooks directory. Unreadable backups block edits and are preserved for manual recovery.

Original iPhone scorecards remain in their existing local archive. On an empty local scorebook, **Original device scorecards** offers explicit import by bowler name. Additional names remain in the archive. Existing shared team scores are not migrated or overwritten.

Phase 1 is implemented. Native league standings, photo import, and voice entry remain later phases. The web match metadata (lineups, handicaps, and opponent scores) is preserved through native edits and new games; native match entry is not part of this phase. No Supabase credentials are bundled; the native client uses the same HTTPS API and team-link access as the web app.

Open `BA4L.xcodeproj` in Xcode. Automatic signing uses the same Apple Developer team as PMV and Jot. The bundle identifier remains `com.dougkvamme.StrikeCeiling` so the name change preserves existing device data. Display name, Xcode target/scheme, and product name are BA4L.

Regenerate the project with `xcodegen generate`. From the repository root, run `bun ios/Tests/run.ts` for deterministic scoring parity, mocked networking/persistence/conflict tests, and native request validation against the actual web schema. Requires Xcode command-line tools, Bun, and installed web dependencies.

Verified 2026-09-10: simulator build; 3,162 web-generated scoring fixtures and 209,588 assertions; six native request bodies accepted by the web schema. In an isolated live test scorebook, web-to-iOS and iOS-to-web rolls, next-game/history, team-link entry, relaunch, final-only totals, and preservation of nullable metadata were checked. Large accessibility text and dark mode were inspected. Web counterpart passed `pw-verify` with screenshot inspection. [runtime-tested]

Signing and TestFlight upload are configured. Physical-phone testing remains separate from simulator verification.

## TestFlight release

App Store Connect: [BA4L](https://appstoreconnect.apple.com/apps/6810936804/testflight/ios).

Run from the repository root:

- `bun ios/Tools/testflight.ts status` checks the app and Apple build-processing status.
- `bun ios/Tools/testflight.ts archive` creates a signed archive without uploading.
- `bun ios/Tools/testflight.ts ship` archives and uploads through the same App Store Connect API-key path used by PMV and Jot.

Increase `CURRENT_PROJECT_VERSION` in `ios/project.yml` for each new build. A repeated upload of an already-listed build is skipped; a local upload receipt also protects the processing window. If upload fails ambiguously, check status and the protected local upload log before retrying. The script never prints the API key or JWT. Credentials remain in `~/.appstoreconnect/credentials.env` and its `private_keys` directory. Signing, version, and encryption settings live in project.yml and survive xcodegen regeneration. Logs and archives live under `~/Library/Developer/Xcode/Archives/BA4L/build-N/`.

`bun ios/Tools/generate-icon.ts` regenerates the opaque 1024px icon from its vector source using the web app's installed sharp dependency.

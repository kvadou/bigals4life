# Strike Ceiling

Native SwiftUI iOS 17+ bowling companion sharing the web app's team scorebooks. Tracks Doug, Mustafa, Kyle and Pete, with scorecards, maximum possible finishes, team totals, final-only scores, undo, game history, and next-game transitions for all four bowlers.

Tap **Team**, then paste the web app's **Share team link** to open the same scores. Alternatively, **Save & share with team** creates a new scorebook. Opening an HTTPS link in Safari does not automatically launch the native app; paste it into Team. The selected team resumes after relaunch. Foreground polling refreshes every five seconds.

Local mode works without a connection. Shared edits are backed up atomically before sending and use the server's revision checks. Failed saves pause editing. Retry recognizes a saved request whose response was lost; it never overwrites a newer conflicting team revision. Discard/reload requires confirmation and retains a recovery archive. Backups live in the app's Application Support/Scorebooks directory. Unreadable backups block edits and are preserved for manual recovery.

Original iPhone scorecards remain in their existing local archive. On an empty local scorebook, **Original device scorecards** offers explicit import by bowler name. Additional names remain in the archive. Existing shared team scores are not migrated or overwritten.

Phase 1 is implemented. Native league standings, photo import, and voice entry remain later phases. The web match metadata (lineups, handicaps, and opponent scores) is preserved through native edits and new games; native match entry is not part of this phase. No Supabase credentials are bundled; the native client uses the same HTTPS API and team-link access as the web app.

Open `StrikeCeiling.xcodeproj` in Xcode. For a physical phone, select your signing team and enable code signing in the target build settings. No Apple signing identity is included.

Regenerate the project with `xcodegen generate`. From the repository root, run `bun ios/Tests/run.ts` for deterministic scoring parity, mocked networking/persistence/conflict tests, and native request validation against the actual web schema. Requires Xcode command-line tools, Bun, and installed web dependencies.

Verified 2026-09-10: simulator build; 3,162 web-generated scoring fixtures and 209,588 assertions; six native request bodies accepted by the web schema. In an isolated live test scorebook, web-to-iOS and iOS-to-web rolls, next-game/history, team-link entry, relaunch, final-only totals, and preservation of nullable metadata were checked. Large accessibility text and dark mode were inspected. Web counterpart passed `pw-verify` with screenshot inspection. [runtime-tested]

Physical-device signing and phone testing are still required before installing for regular use.

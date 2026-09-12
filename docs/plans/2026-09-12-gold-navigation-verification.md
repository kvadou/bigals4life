# Gold and navigation verification, September 12, 2026

Implementation: `06b5d96`. Status: native TestFlight 1.0 (7) is VALID and available in the existing internal group. Build ID: `927f9de2-6aa4-47c9-8b88-faaf96a9bfce`; group: `f00174f2-8263-4343-8663-4dd20f24dfdb`. API group membership was confirmed. Web built and tested, not deployed because the earlier public-logo proxy change awaits Doug's review.

## Changes

Native Tonight uses a direct ScrollView and system content margins. On iOS 26 compact layouts, the native tab bar minimizes on scroll; regular iPad layouts retain top navigation. Forest content no longer extends beneath the collapsed control. Gold accents distinguish selected scoring actions, coaching links and result highlights while keeping forest and ivory dominant.

## Evidence

- Web: 66 tests, 59,600 assertions, production build, 72 route/viewport checks, 54 interaction checks. `pw-verify` screenshot of scoring inspected. [runtime-tested]
- Native: signed simulator compilation and Release archive succeeded. Archive metadata confirms version 1.0 (7), existing bundle identifier and device families 1 and 2.
- XCTest UI harness used isolated bundled synthetic fixtures. Four upward swipes made the final All weeks & pre-bowls action hittable; four downward swipes restored the top control; Score remained reachable. Final test succeeded and bottom/restored/score screenshots were inspected. Evidence: `/tmp/ba4l-scroll-qa/result6.xcresult`.
- Visual review matters: earlier functional tests passed while the collapsed icon lacked contrast. Restricting background safe-area coverage resolved that defect. Both collapsed and expanded states are required in future navigation checks.
- No production scores or account data were changed for tests. Temporary fixture project was not used for the release archive.

## Camera scope

See [Lane Coach](2026-09-12-lane-coach.md). Automatic bowler recognition, delivery tracking and game association are requirements, not current functionality. No routine per-shot bowler selection. Recognition must be evaluated with actual alley footage before claiming hands-free operation.

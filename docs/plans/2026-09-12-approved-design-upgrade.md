# Approved BA4L A+B upgrade

Doug approved the recommended combination: Score First entry, Team Night dashboard, a shared 4-and-hook identity, and a new Home Screen icon. Backend contracts, account boundaries and offline safeguards remain intact.

1. Author the shared vector emblem, web wordmark and icons. Generate the opaque 1024px native app icon.
2. Web: prioritize bowler, frame, actual score and keypad. Keep Undo, Scan and Voice nearby. Open the requested input tool from direct links. Make completed-night actions contextual and show the standings date.
3. Native: prioritize the team matchup on Tonight and score entry before setup/history. Adapt the layout for iPad and accessibility text sizes.
4. Verify automated suites, signed simulator builds, responsive browser routes and rendered phone/tablet layouts. Release through the existing Vercel and TestFlight workflows.

Score edits continue through `store.change` on iOS and `setNight` with revision protection on the web. The query entry mode controls presentation only. All displayed scores derive from actual models; concept-board sample data is excluded.

## Verification, September 12

- Web: 66 tests, 59,600 assertions; production build passed.
- Browser fixtures: 72 route/viewport checks and 54 additional interaction checks passed. Direct Scan/Voice opening, stable keypad, imported-final Undo and failed-save protection covered. Widths include 320 through 1920px.
- `pw-verify /night?new=1`: keypad rendered, no crash boundary or breaking JavaScript errors. Screenshot inspected. [runtime-tested]
- Native: 209,764 scoring/store checks plus account, voice, model, 700 match-point fixtures and profile suites passed. Final signed simulator build passed.
- Inspected iPhone Score and Tonight, iPad Tonight, and maximum Dynamic Type with dark mode. Fixed an iPad selected-tab contrast issue using a scoped tint, then re-inspected phone and tablet.
- Device camera/dictation and real-account native sign-in remain physical-device checks. Fixture runs made no production writes.

Implementation commit: `efcd72d`, pushed. Public logo allowlist: `5c53ec5`, committed separately pending Doug's required auth-file review. TestFlight 1.0 (6), build `92dba822-a12d-4171-b047-1f0dcb3cf595`, is VALID and its membership in internal group `f00174f2-8263-4343-8663-4dd20f24dfdb` was confirmed through App Store Connect. Web deployment is pending the requested public-logo approval. The previous Vercel release remains live; its Week 1 baseline was rechecked at 1,849 series and 26–10 points.

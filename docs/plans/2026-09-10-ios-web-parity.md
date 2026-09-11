# Native iOS parity with the web app

Status: approved by Doug. Phase 1 implemented and verified on 2026-09-10. Phases 2 and 3 remain future work.

## Outcome

The native iPhone app uses the same team link, scores, game history, and standings as the web app. Keep SwiftUI and use the existing server APIs. Implement one phase fully before starting the next.

## Evidence

- `ios/Sources/StrikeCeilingApp.swift`: independent local bowlers, defaults Mustafa/Doug, individual new-game resets, no networking.
- `web/lib/scorebook.ts`: four fixed slots in Doug/Mustafa/Kyle/Pete order, game, rolls, optional final totals, history, optional drinkTargets.
- `web/app/use-scorebook.ts`: team-link identity, five-second polling, revision-checked writes, pending local backup and explicit conflict recovery.
- `web/app/api/nights/route.ts` and `web/app/api/nights/[id]/route.ts`: create/read/update APIs; stale writes return 409.
- `web/lib/scorebook-server.ts`: writes require an Origin equal to the API origin. Native requests can supply the canonical Origin while retaining existing browser checks. Origin is not authentication; the existing unguessable team link grants access. Never embed Supabase credentials.
- `web/app/page.tsx`: team totals, final-only scores, history, next game for everyone, photo and voice review.
- `web/app/api/league/standings/route.ts`: existing read-only standings API.
- Xcode 26.6 and a booted iPhone 17 Pro simulator are available. Physical-device signing is still a separate requirement.

## Phase 1: shared scorebook and core scoring parity

1. Add Codable night/envelope types and a URLSession client in the existing Swift source files. Match every web field, including nullable finals and drinkTargets, so updates cannot erase metadata. Validate sizes, ranges, four-bowler order, and legal rolls before saving.
2. Add a main-actor store with local/shared/loading/saving/conflict/error states. Keep edits serialized. Poll every five seconds only while active, refresh on foreground, and reject late responses from previous scorebooks or earlier generations.
3. Let users paste an existing HTTPS team link or create/share a new scorebook. Only accept the configured host, root path, and valid night UUID. Resume the chosen team after relaunch. Do not silently connect to a team from development notes.
4. Preserve the legacy local archive. Offer explicit migration of matching names into the four web slots; do not silently drop additional bowlers or replace remote state with old local state.
5. Bring the score view into parity: four bowlers, settled scores and maximums, team totals, final-only score handling, undo, game history, and next-game confirmation for the whole team.
6. Retain pending edits on failed writes/relaunch. Disable editing until retry or explicit discard/reload resolves the error. A 409 must never retry with a newer revision and overwrite another person's scores.

Contract sketch:

```swift
struct SharedScorebook: Codable {
    var state: Night
    var revision: Int
}

// Read: GET /api/nights/{id}
// Save: PUT /api/nights/{id}
// JSON: { "state": <complete Night>, "revision": <last read revision> }
// HTTP 409: preserve pending state, require reload decision.
```

Verification: Swift scoring tests plus cross-language scoring fixtures; deterministic networking tests for success, stale writes, offline retry, interrupted saves, malformed data, legacy migration, and stale responses. Build and inspect simulator UI, including large text and dark mode. Use an isolated test scorebook to verify web-to-iOS and iOS-to-web updates, history/final preservation, relaunch, and conflicts. Never use the real league night for mutation tests.

## Phase 2: standings

Native League screen using the existing standings API, including season/week, team standings and bowler statistics. Verify against the same API fixture used by the web page, with loading, empty and error states.

## Phase 3: photo and voice entry

Native camera/photo picker sends resized images to the existing photo API. Review/edit/match rows before applying legal rolls; support reversible import without losing later remote changes. Native speech or keyboard dictation follows the web parser's phrases and review rules. Guard against applying a review after the underlying game changed. Test real iPhone camera/microphone permissions and captures before claiming device verification.

## Scope and delivery

Phase 1 used the existing Swift source files plus TypeScript test tooling. Unrelated web changes remain intact. No real league-night data migration or app-store release is included.

## Phase 1 verification

- Xcode simulator build passed; 3,162 deterministic web scoring fixtures, 209,588 assertions, and six native HTTP bodies checked against the web schema.
- Independent review caught required-null encoding and unavailable-team switching issues; both were fixed and covered by regressions.
- Native simulator created an isolated shared scorebook. Web roll updates arrived in iOS; native roll updates arrived on the web. Next game and history, team-link entry, relaunch, final-only totals, and nullable metadata retention verified.
- Simulator light/dark and largest accessibility text inspected. Team rows adapt to vertical layout at accessibility sizes.
- Web counterpart passed pw-verify with screenshot inspection. No physical-device or distribution verification claimed.

- Concurrent web work added optional match metadata. Native Codable fields and validation now preserve it through saves, relaunch, and next game; request fixtures pass the updated web schema. The native match UI remains future work.

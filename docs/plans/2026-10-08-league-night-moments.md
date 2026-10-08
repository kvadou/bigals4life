# League night moments (iOS build 26)

Date: 2026-10-08, built during Week 5 vs Here 4 Beer. Three features that change how the phone gets used at the alley.

## 1. Lock-screen Live Activity for the match

- `ios/Sources/MatchActivity.swift` (compiled into app and widget): `MatchActivityAttributes: ActivityAttributes` with static `opponent`, `week`, `lane` and `ContentState { game, ours, theirs, upName, upScore, frame, pointsOurs, pointsTheirs, final }`. `ours`/`theirs` are the team game totals with handicap (from `NativeMatchPoints.games[game-1]`), `theirs` nil until their scores are in.
- `MatchActivityController` (app only): `sync(night)` starts the activity when a match is set and a roll exists, updates on every change, ends when all three games are complete for all four bowlers or the match is cleared. Adopts an existing activity on launch. Called from `ScoreboardView` on `store.night` changes.
- `ios/Widgets/`: `BA4LWidgetsBundle` and `MatchLiveActivity` (lock screen: forest card, "BIG AL'S 185 · HERE 4 BEER 178", "Game 2 · Pete up · frame 7", match points; Dynamic Island compact: ours vs theirs; minimal: ours). Colors from the shared asset catalog.
- `project.yml`: new `BA4LWidgets` app-extension target (bundle `com.dougkvamme.StrikeCeiling.widgets`, `NSExtensionPointIdentifier com.apple.widgetkit-extension`), app target depends on it and sets `NSSupportsLiveActivities`.

## 2. Milestone moments on Score

Pure, in the scoring block, tested in `ios/Tests/match-insights.ts`:

```swift
struct Milestone: Equatable { let key: String; let text: String }
static func milestones(name: String, game: BowlingGame, score: Int, gameNumber: Int, seasonHigh: Int?, leagueHigh: Int?, leagueHolder: String?) -> [Milestone]
```

- Strike string of 5+ in the current game, fires once per length: "Pete is on a five-bagger" (5), six-pack (6), seven in a row…, "Perfect game" at 12.
- On a complete game: clean game (no opens), personal season high ("Doug's 167 is his best game this season"), league high ("Pete's 285 is the league's high game this season, past Ross Carlson's 246").
- `ScoreboardView` fetches `/api/league/records` once per night for our four bowlers' season highs and the league high, shows each new milestone as a gold banner overlay for six seconds, and remembers shown keys per night so nothing repeats.

## 3. Night recap card to share

- `NightRecapCard: View` renders the night: brand mark, "Week 5 · vs Here 4 Beer · Oct 8", team series with handicap vs theirs, match points, four rows of three games plus series, and the night's moment (highest game). Forest on ivory, 1080 px wide via `ImageRenderer` at 3x.
- `ScoreboardView` match footer gets "Share the night" (`ShareLink` with the rendered image). Available once any game is complete; the title says "so far" until all three are in.

## Tests and shipping

- `bun ios/Tests/run.ts` with the new milestone checks; `xcodebuild` for both targets; build 26; `bun ios/Tools/testflight.ts ship`.
- Web: the API routes behind builds 23-25 were not deployed yet; `vercel --prod` from `web/` ships them.

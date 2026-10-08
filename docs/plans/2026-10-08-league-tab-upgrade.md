# League tab upgrade (iOS build 23)

Date: 2026-10-08. Follows the Score tab plan (build 22) and the mobile upgrade artifact.

## Goal

League opens on the answer: where we stand, how far to the next place, who is hot. Controls come after. Today the sheet date and a 300-word recap sit above the table.

## API: `/api/league/standings` (additive, web unchanged)

New pure module `web/lib/league/standings.ts` with a bun test, called from `standings-server.ts`:

```ts
export type TeamLine = { place: number; pointsWon: number };
/** Points behind the team one place up in the published order. Null for first place. */
export function gapToAbove(teams: TeamLine[], index: number): number | null
/** previousPlace - place: positive climbed, negative fell, 0 held, null when no earlier week. */
export function movement(place: number, previousPlace: number | null | undefined): number | null
/** Weekly points lost from cumulative sheet totals; falls back to 36 - won when the earlier week is missing. */
export function weeklyLost(rows: { week: number; won: number | null; cumulativeLost: number | null }[]): Map<number, number | null>
```

Server changes:
- `teams[].gapToAbove: number | null` and `teams[].movement: number | null`. Movement needs one extra query, `league_team_weeks?select=team_id,place&week_id=eq.<weeks[1].id>`, skipped when there is no earlier week.
- `history[].lost: number | null`. The `ourWeeks` select adds `points_lost`.
- `roster[].blsId: number` so the bowler tiles can open the existing career page.

## iOS: `LeagueView.swift`

- Navigation title is the season name, inline. Toolbar menu holds the season picker (touched twice a year).
- Segmented control under the title: Standings · Bowlers · Records. Replaces the top-right menu.
- **Standings**:
  - Forest header card (`BA4LTheme.tint` background, `onTint` text): eyebrow `Week 4 of 31 · Big Al's Bar and Bowling`, big `6th of 8`, `67 – 77 · 46.5% won`, then the gap line `3.5 behind X X X for 5th` and `4.5 to 4th · 27 weeks left`. Gold bar: our points over the 4th place points. First place reads `Leading by n`.
  - Table rows: place, movement arrow (gold up, secondary down), team name, Pts, Gap, Wk. Our row on `BrandGoldSurface` with `OnGoldSurface` text. Accessibility label reads the whole row.
  - `Our four`: horizontal tiles, name, average, `hdcp n`, tap opens `LeagueCareerView(id: blsId)`.
  - Week by week: `Chart` of BarMarks, won points per week over 36, gold when ≥ 18, with a text fallback list behind a DisclosureGroup for VoiceOver.
  - Recap: first sentence, `Read the recap` DisclosureGroup, `Send to team` ShareLink, write/rewrite button stays.
  - Sheet checks stay at the bottom, unchanged.
- **Bowlers**: full roster rows (average, handicap, last week games, series to raise, match points) then the individual match points leaderboard.
- **Records**: existing `LeagueRecordsView`.
- Pure math block `// MARK: - Pure league math` in `LeagueView.swift`, extracted and compiled by `ios/Tests/league-math.ts`:

```swift
enum NativeLeagueMath {
    static func ordinal(_ n: Int) -> String            // 1st 2nd 3rd 4th 11th 12th 13th 21st
    static func firstSentence(_ text: String) -> String
    /// Points to reach `target` place: positive = behind, 0 = there or above. Nil when the target does not exist.
    static func pointsTo(place target: Int, ours: Double, teams: [(place: Int, points: Double)]) -> Double?
}
```

## Tests

- `web/tests/league/standings.test.ts`: gaps, movement, weekly lost (diff and fallback), first place null.
- `ios/Tests/league-math.ts`: ordinal, first sentence, points to place. Wired into `ios/Tests/run.ts`.
- `bun test` in web, `bun ios/Tests/run.ts`, `xcodebuild` green. Build 23 in `ios/project.yml`.

## Out of scope

Push notifications, live standings during the night, web League page restyle.

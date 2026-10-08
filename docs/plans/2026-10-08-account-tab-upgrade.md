# Account tab upgrade (iOS build 25)

Date: 2026-10-08. Last of the four tabs in the mobile upgrade artifact.

## Goal

Account opens on you and your team. The engineering rows (password, device archive, web link) move behind one "More" row.

## API

- `PATCH /api/me` also accepts `bowlerName` (Doug, Mustafa, Kyle, Pete, or null). Names and bowler can be sent together or alone. This is what makes "I usually score as" follow the account, and what lets the team card know which account is which bowler. Display only: never grants access.
- `GET /api/me/team` (new):

```ts
type TeamCard = {
  team: string | null;                      // "BIG AL'S 4 LIFE" from the latest sheet
  scorebookId: string | null; yourRole: "owner" | "editor" | "viewer" | null;
  bowlers: { name: string; fullName: string; average: number | null; handicap: number | null; games: number | null;
             you: boolean; signedIn: boolean; role: string | null }[];
  invites: string[];                        // pending emails on the team scorebook
};
```

Pure `teamCard()` in `web/lib/team-card.ts` with a bun test; the route feeds it profiles (user_id, bowler_name), the newest owned scorebook's members and invites, and the standings roster (which gains `games`).

## iOS: new `AccountView.swift`, used by `AppRootView`

- Header: initials avatar on forest, name, `140 avg · hdcp 63 · 12 games this season`. Tap the name to edit (sheet with first and last name, saves through PATCH).
- Team card: team name, four rows with avatar, name, `owner · you`, `can edit`, `not signed in yet`, and an `Invite` button when you own the scorebook (pushes the existing TeamAccessView). Pending invites listed under the rows.
- `I usually score as`: four avatar buttons. Selecting sets the Score tab's bowler and PATCHes `bowlerName`.
- `League night reminder · Thursday 5:30 PM`: real local notification through `UNUserNotificationCenter`, stored per account. The other two notifications in the artifact need push and are left out.
- `More` row: password, original device scorecards, BA4L on the web.
- Footer: email, plain `Sign out` button.

## Tests

- `web/tests/team-card.test.ts`: sign-in mapping, roles, you flag, missing standings.
- `bun test`, `bun ios/Tests/run.ts`, `xcodebuild`. Build 25.

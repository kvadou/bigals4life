# Review tab upgrade (iOS build 24)

Date: 2026-10-08. Follows the League plan (build 23) and the mobile upgrade artifact.

## Goal

Review opens as a conversation. The coach speaks first with something specific from the data it already has. Setup moves behind one link. Nothing needs a Save button.

## API: `GET /api/review/:id` (additive)

New pure module `web/lib/review/opening.ts`, tested:

```ts
export type OpeningInput = {
  name: string; prebowl: boolean; opponent: string | null;
  paired: { name: string; handicap: number } | null; handicap: number | null;
  league: { average: number; toRaise: number | null } | null;
  games: GameFacts[];
};
/** Deterministic first coach turn. No model call, so it is instant and never rate limited. */
export function openingMessage(input: OpeningInput): { text: string; question: string | null }
```

Cases:
- No finished game, match night: `Tonight you're paired with Rachel Carlson (hdcp 86, yours 18). A 431 series raises your average; anything over 144 a game does it.` Question: `What ball are you starting with?` when the arsenal has more than one ball, else null.
- No finished game, pre-bowl: same without the pairing.
- Finished games: series, the game that stood out (highest score, with its stat line), the tenth frame if it was open, and whether the series raised the average. Question: `Was that the lane or the release?` when opens ≥ 3 in any game, else `Which game felt best?`

Route adds to the payload: `opening`, `paired` (from `night.match.ours[slot]` matched to `opponent.bowlers[slot]`), `league` (average, handicap, toRaise from the standings roster, matched on first name; null if standings fail).

## iOS: `ReviewView.swift`

- Title stays `Bowling Bro’`. Principal eyebrow `Week 5 · vs Here 4 Beer`. Toolbar: bowler menu (hidden for a lone pre-bowler) and `Setup`, a sheet holding the lanes and profile forms as they are today.
- Game chips: horizontal row, `Game 1 · 134` with the stat line under it, selected chip gold. The chip selects which game observation chips and the note apply to. Default is the last finished game.
- Conversation: coach opening bubble (shown while the debrief is empty) then each turn. Coach bubbles on the secondary grouped background, bowler bubbles on `BrandGoldSurface`, ideas as links inside the coach bubble.
- Observation chips under the conversation: the nine tags as toggle chips for the selected game, plus the ball picker as a chip menu. Up to six.
- Input: `Reply to the coach…`. While the debrief is empty the text goes into the selected game's note and the coach opens on it. After that it is the answer. Disabled with a hint until a game is finished.
- Status line under the input: `Saved · 3 of 8 turns`. Save button removed; the model already autosaves 1.2 s after each change and on disappear.
- Conflict and recovery sections stay as they are.

## Tests

- `web/tests/review-opening.test.ts`: pairing line, series to raise, finished-night summary, question choice.
- Native: `bun ios/Tests/run.ts`, `xcodebuild`. Build 24.

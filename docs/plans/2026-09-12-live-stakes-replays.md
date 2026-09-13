# Live stakes and Moment of the Night

## Outcome and scope

Extend the approved BA4L Live Lane UI. A viewer understands an actual matchup target and can replay recent lane footage selected by a notable score update. Keep forest, ivory and restrained gold; video remains primary. This is the first complete stakes/replay slice, not automatic visual bowler recognition or a produced league broadcast.

## Research and architecture

Existing points pair by submitted lineup position, while rolls are fixed roster order. Individual game point is one, ties split. Opponent input is a final score, never a live-roll estimate. Target scratch = opposing final + opposing handicap - our handicap + 1. Compare to legal minimum completion and maximum, respecting tenth-frame bonuses and explicit final overrides. Missing opponent data must say waiting; pre-bowls do not claim live opponent contests.

LiveKit exposes decoded frames to native VideoRenderer and browser MediaStreamTrack. Native AVAssetWriter can encode silent, bounded local clips. Browser MediaRecorder chunks are not guaranteed individually playable, so each retained segment must be a complete recording; do not concatenate arbitrary timeslice blobs.

Sources reviewed: https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/videoframe/ ; https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API ; local LiveKit2.16 SDK and current bowling/points engines.

## Implementation

```ts
type ScoreMoment = { id: string; label: string; observedAt: number };
// Initial loads, corrections, game changes and bulk imports never trigger moments.
// Only one appended legal roll, same game, unchanged other bowlers/finals.
// A strike, spare or completed game may select recent footage, not identify it.
```

1. Pure TS/Swift stakes engines with boundary tests and parity fixtures. Cards expose actual target, range, clinched/tied/out-of-reach/waiting state with no invented pin requirements.
2. Explicit once-session Enable local replays. Capture only the selected camera's video, never microphone. Bounded rolling buffer, one kept candidate, local player plus explicit user download/share. No new cloud storage or media disclosure.
3. Automatic candidate selection uses fresh score transitions. Label both the scorebook event and the unconfirmed timing/identity of recent footage. Show buffer readiness; no retroactive capture promise.
4. Stop and purge on source/book changes, backgrounding or disposal. Do not stop the underlying LiveKit camera when stopping replay recording. Unsupported/error paths preserve live viewing.
5. Integrate readable cards beside shared scores on web/native, keep controls within safe areas and responsive to iPad/Dynamic Type.
6. Verify real synthetic media encoding/decoding and lifecycle, score-engine parity, browser routes/screenshots, native compile and targeted tests. Physical alley timing and camera quality remain field validation.

Release follows the current authorization and applicable gate. Earlier Just publish it authorized the previous release; do not silently treat it as a line-by-line review of future authentication changes. This slice should not add auth endpoints, schema changes or automatic external media writes.

## Verification

- Web: 80 tests, 61,294 assertions; production build passed.
- Native: complete test runner passed, including 394 stakes comparisons, legal-roll moment regressions and real H264 media decode/rotation/no-audio/buffer cleanup. Signed build 9 archive passed.
- Browser: 19 recording-engine checks and 14 integrated LiveKit route checks passed; downloaded replay decoded 89 video frames and no audio. Phone/iPad screenshots inspected, pw-verify passed. [runtime-tested]
- iPhone and iPad simulator UI checks passed. Physical alley camera timing remains field validation.
- Scope review: no auth/schema changes or automatic cloud media persistence. Replays require opt-in, are local and unsynchronized score-triggered candidates, and must be explicitly downloaded/shared before leaving.

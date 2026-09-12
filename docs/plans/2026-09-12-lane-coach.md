# Bowling Bro: Lane Coach

## Product recommendation

Make the mounted phone or iPad a quiet teammate. Recognize the bowler, capture a delivery, connect it to the game, replay what happened, and offer one specific experiment for the next turn. The user explicitly requested live observation and coaching. This document defines that new feature; it is not yet implemented.

The current camera flow only submits a still scoreboard photo to `/api/scoreboard`, reviews recognized rolls, and applies selected scorecards. Existing Bowling Bro uses scores and review notes. Neither currently observes body movement or continuous video.

## Experience

1. Open Score, choose Camera, then Watch bowling. Scan scoreboard remains a separate action.
2. Use the signed-in team roster, scoreboard active-bowler name/highlight and changed score row as identity anchors. Associate the tracked delivery with those time-aligned observations; turn order alone is never identity. Private opt-in recognition enrollment is a fallback if the display cannot provide a reliable name, not a mandatory per-player task. No per-shot bowler selection. Position the device behind and slightly to the side of the approach, outside anyone's walking or delivery path. An alignment preview checks full-body visibility and lighting. One device prioritizes the bowler; distant pins and the overhead scoreboard are not assumed readable from that same view.
3. Automatically show the recognized bowler and their current game/frame. An optional personal goal can be set before play, never required per delivery. Show a persistent Recording indicator and an obvious Pause/Stop control. On iPad, keep score context and the latest cue beside the preview.
4. Retain a short delivery clip. Automatically detect delivery boundaries and retain the relevant clip. Explicit save/label controls belong in the development evaluation harness, not the normal playing workflow. Private, consented recognition enrollment may be used; validate recognition under the actual mounting angle and never assume a face is visible from behind.
5. Between turns, show slow replay, evidence timestamps and one cue. A useful cue describes an observable difference, gives a single experiment and invites the next result. Stay silent during the approach; spoken coaching is opt-in.
6. Automatically associate the observed result with the recognized bowler and existing game/frame using revision protection. High-confidence results corroborated by the scoring display can update the shared scorebook without a per-shot tap. Hold uncertain identity, obstructed pins or conflicting observations as pending and reconcile from later frames/display updates; never invent a score. Keep exceptions available for correction after the turn without blocking play.
7. Review a game as a timeline, compare two deliveries, and retain the cues that helped. Web is the larger review/history workspace; native is the capture device.

## Architecture and evidence

- Native AVFoundation capture with local clip storage and interruption/thermal handling. Keep the capture device foregrounded; show score/coaching controls within that session. Backgrounding or a system interruption pauses capture visibly, never claims it is still watching. Keep an in-memory rolling buffer only after capture lifecycle and recovery are proven. No continuous cloud broadcast by default.
- Player identity is a separate recognition problem. Apple Vision pose landmarks do not identify Doug or his teammates. Prefer time-aligned scoreboard active-bowler OCR, row changes and short-term person tracking, anchored to the existing team roster. This is a hypothesis to validate against actual alley displays, not an asserted capability. Handle pre/post-delivery highlight changes and delayed scoreboard updates explicitly. Opt-in local recognition enrollment is a fallback; retain an unknown state when evidence cannot resolve the player.
- Apple Vision body pose provides landmarks from images/video. Use confidence-gated observations to estimate visible posture, tempo and finish consistency. Pose detection alone is not a bowling coach and is not reliable evidence of wrist/release mechanics, revolutions, ball speed or lane boards.
- Derive timing from high-frame-rate local footage. Send selected clip segments/keyframes and measured context to the existing server-side AI integration for a grounded explanation. Benchmark on representative bowling footage before choosing a video model.
- Gemini's documented default video sampling is 1 FPS and can miss fast actions. Explicit sampling and local measurement are required for release-phase analysis. Realtime conversational image/audio support is useful for interaction, not a substitute for frame-accurate motion tracking.
- Coaching output must separate observation, uncertainty and suggested experiment. Every motion claim needs a timestamp or derived measurement; low-confidence footage asks for a better angle instead of guessing. No promises of improved scores without evaluation.

Proposed contract, not a migration:

```ts
type DeliveryObservation = {
  id: string;
  nightId: string;
  game: number;
  bowlerIndex: number;
  frame: number;
  scoreRevision: number;
  capturedAt: string;
  clipDurationMs: number;
  evidence: { atMs: number; observation: string; confidence: number }[];
  cue?: { observation: string; experiment: string; evidenceAtMs: number[] };
};
```

Two camera sources feed one authoritative session coordinator. Deduplicate observations and write each game/frame/ball result once through revision protection; competing cameras never independently commit scores.

Clips belong to the signed-in account/team with explicit access checks, private storage, retention/deletion controls and bounded uploads. Capture requires the bowlers' agreement and visible recording state. Do not record nearby conversations by default. Team sharing is an explicit product action. API authorization and storage changes require the repository's human review before release.

## Delivery order and acceptance

### 1. Capture and replay

Native camera/display setup, roster and scoreboard identity association, automatic bowler tracking and delivery boundaries, recording/pause/stop, local clips, slow replay and automatic score association. Recognition accuracy is part of the first acceptance gate, not a later optional feature. Prove landscape/portrait, iPhone/iPad, camera permission denial, interruptions, low storage, offline relaunch and account separation. Use real consenting-bowler clips to establish the dataset and framing guidance.

### 2. Evidence-based coaching

Pose overlays and clip analysis, confidence handling, one cue between turns, persistent review timeline. Validate against manually labeled deliveries and a knowledgeable human reviewer. The user must be able to inspect why a cue appeared. Test latency at the alley and battery/thermal behavior across a full game.

### 3. Hands-free session

Robust multi-person and occlusion recovery, optional spoken cue, dual-device camera/controller pairing, comparison over weeks. Gate automatic capture on measured missed/false delivery rates. Uncertain observations remain pending; recover automatically from later evidence when possible and surface unresolved exceptions after play. Routine bowler selection is explicitly excluded by Doug.

## Sources reviewed September 12, 2026

- Apple sports-analysis sample: https://developer.apple.com/documentation/vision/building-a-feature-rich-app-for-sports-analysis
- Apple body pose: https://developer.apple.com/videos/play/wwdc2020/10653/
- Apple 3D pose: https://developer.apple.com/videos/play/wwdc2023/111241/
- Google video sampling: https://ai.google.dev/gemini-api/docs/video-understanding
- OpenAI Realtime inputs: https://platform.openai.com/docs/api-reference/realtime
- Existing implementation: ios/Sources/ScoreboardScan.swift and web/app/api/scoreboard/route.ts

## User correction

Doug clarified on September 12: the system must watch and know who is bowling and follow the game without selections. One-time setup and explicit start/stop are acceptable assumptions; per-shot selection is not the product. Automatic recognition and observation must be proven before this is described as hands-free. A second camera may be necessary when one angle cannot see both delivery and scoring display.

## Live Lane refinement, September 12

Doug authorized starting implementation. Dedicated native Live Lane hosts the mounted camera; teammates should join the same session from their phones. Thursday warm-up is expected at 19:00 America/Chicago, league play around 19:10. Schedule is contextual evidence, not permission to count warm-up shots. Existing pre-bowl metadata takes priority over a clock suggestion. Outside scheduled league activity, use practice unless pre-bowl is established. Actual scoreboard/game evidence must establish counted competition.

First implementation slice: real camera preview with explicit start/pause/stop, visible observation lifecycle, foreground/interruption handling, session phase suggestion and observation quality. Keep unproven identity, ball trajectory and oil inference visibly unavailable. No fabricated live metrics. Subsequent shared capture/coordinator and calibrated tracking require actual footage evaluation and authenticated session transport; these remain part of the requested feature, not complete at this slice.

Occlusion strategy: fixed calibrated camera, retain observed path segments, mark invisible intervals, reacquire using temporal/lane constraints. Do not render predicted gaps as measurements. A second offset angle provides independent evidence when a bowler fully blocks the ball. Mount outside the approach. Supplied oil-pattern chart is reference data; observed ball reaction is an inference that also depends on ball, speed and release. Never claim direct oil measurement from normal video.

### Shared room transport

Doug confirmed teammates need all of live video, scores, coaching and replays. Recommended transport: LiveKit, with one room per explicit live session and short-lived server-issued tokens. Reuse verified BA4L identities and scorebook membership, but never grant camera publishing from a caller-supplied role. Viewers subscribe only; authorized capture devices publish camera video without microphone by default. Pairing must be scoped to the session, not inferred from being on the same Wi-Fi. A second angle publishes a separate camera track; one coordinator owns score reconciliation. Replays and verified observation history require private persistence independently of ephemeral video transport.

LiveKit credentials were not present in BA4L web local configuration or the checked shared secret file. A project-selection question is pending. No room, provider account, billing change, token endpoint or streaming integration has been created. Authenticated room grants and private media persistence require human review under the existing repository policy before publishing.

References: https://docs.livekit.io/transport/sdk-platforms/swift/ and https://docs.livekit.io/frontends/reference/tokens-grants/ . Lane reaction context: https://bowl.com/coaching/advanced and https://bowl.com/oil-pattern-bank .

### Local implementation evidence

Implemented a native Live Lane full-screen entry from Tonight, camera start/pause/stop, rear-camera preview, throttled on-device human-rectangle detection, stale-observation state, and explicit lifecycle interruption handling. It does not identify individual bowlers, save clips, broadcast, measure ball paths, infer oil, coach or write scores. Existing scorebook values are labeled separately. No camera starts until the user taps Start camera; no audio is requested.

LiveLaneContext has 201 passing standalone Swift assertions for America/Chicago, daylight saving boundaries, Thursday 19:00/19:10, explicit intent, and no automatic competitive attribution from time. Simulator UI tests passed on iPhone and iPad for entry, no-camera failure, and return. Final iPad screenshots inspected after fixing text compression. Evidence: /tmp/ba4l-live-qa/result1.xcresult and result-ipad2.xcresult. Camera hardware, orientation/frame alignment, sustained thermal behavior and person-detection accuracy remain physical-device tests. [runtime-tested] applies only to those simulator interaction paths.

Independent lifecycle review found and fixed two races: do not stop the current capture from a stale startup continuation; do not invalidate the first permission request merely because the permission sheet makes the app inactive. Backgrounding still invalidates startup, and inactive capture pauses.

No release was made. TestFlight remains 1.0 (7). LiveKit Cloud is signed out in the open setup tab. Team video and all autonomous tracking features remain unfinished.

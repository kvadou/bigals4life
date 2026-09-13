# Live session modes and delivery visibility

Status: proposed, not implemented. User requested log inspection and distinct social, pre-bowl, practice and personal-recording experiences.

## Verified observations

September 13 at 02:04:00, 02:04:10 and 02:04:39 Central: production /api/live/token returned 200; /api/live/sessions returned 200 at 02:03:50. No active BA4L rooms at 02:07:15 Central. An older discovery request returned 503 on September 12 at 22:01:35; subsequent requests succeeded. These are control-plane observations, not evidence of remote video delivery. Logs contain no receiver frame acknowledgments. Screenshot shows a faint local image and frame-based headline, but cannot establish what a remote viewer saw. Current native background/Leave behavior ends the room connection.

Existing shared mode derives from the loaded scorebook: pre-bowl metadata wins, then league, then practice. Thus opening an old pre-bowl book cannot represent a new casual practice. This needs session identity distinct from scorebook identity, not a misleading label change.

## Recommended experience

Four activity choices, with audience and recording independent:

| Activity | Purpose | Competitive scorebook |
| --- | --- | --- |
| League night | Team coverage, warm-up followed by scored play | Required, selected week |
| Pre-bowl | Teammates witness bowling ahead of league night | Required, selected week and participants |
| Practice | Drills, delivery review, optional practice scoring | None; never alters league scores |
| Hangout | Casual live sharing with invited teammates/friends | None; video-first interface |

Record for myself is Practice with Only me audience and recording enabled, not another confusing activity. Recording is off until chosen. Personal recordings stay local by default and are explicitly saved/deleted. Sharing and local recording may be combined without changing activity. Invite-only social access requires a new reviewed authorization path; do not silently expose existing private rooms.

```ts
type SessionActivity = 'league' | 'prebowl' | 'practice' | 'social';
type SessionAudience = 'only-me' | 'team' | 'invited';
// A session owns its context. Last-opened scorebook cannot override it.
// Only competitive activities may attach an authorized scorebook.
```

Entry: choose activity, show a concise audience/recording summary, preview framing, Start. Remember harmless preferences; never automatically begin broadcasting or recording. League schedule may suggest warm-up at Thursday 7:00 PM and scored play around 7:10, but cannot attribute scores by clock alone.

## Make video trust visible first

A single status should distinguish camera frames, upstream sending, server publication, connected viewers and receiver-confirmed video. Zero viewers is not stream failure; connected viewers without incoming frames is a distinct degraded state. Report compact diagnostics: session ID, client version, timestamps, FPS, dimensions, bitrate, dropped frames, reconnect reason. No tokens or recorded images in diagnostic logs. Receiver acknowledgment would require an authorized, bounded transport or endpoint; current canPublishData=false remains unchanged until reviewed.

Mount mode should offer a large framing preview, orientation guidance, screen-awake status, and obvious recording/live indicators. A second-camera option can later improve visibility around bowler occlusion. Warm-up is a phase, not a separate session. Watch-only is a viewer role. A private last-shot replay with slow motion and side-by-side comparison is a stronger early practice feature than unverified automatic oil-pattern claims.

## Delivery order

1. Reproduce the physical broadcast with a second receiver and collect sender/receiver statistics. Fix the demonstrated failure; show honest delivery state.
2. Separate noncompetitive sessions from league books, implement private practice recording and explicit activity selection. Review schema/auth scope before publishing.
3. Add invited social sharing and saved replay library with explicit audience controls.

No new modes or telemetry shipped by this log-inspection task. Physical delivery remains unverified until a live paired test is available.

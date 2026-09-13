# Live pre-bowl watching

Scope: extend the approved forest/ivory/gold Operate surfaces. A teammate at home sees an actual active camera, knows which pre-bowl week it belongs to, and opens that exact scorebook's stream. No inferred bowler identity, notifications, recordings, or automatic scoring claims.

## Contract

```ts
type LiveSession = {
  scorebookId: string;
  kind: 'prebowl' | 'league' | 'practice';
  week: number | null;
  bowlers: string[];
  cameraCount: number;
};
// GET /api/live/sessions: { configured: boolean; sessions: LiveSession[] }
```

1. Server validates identity and private book membership before returning any session. LiveKit participants with unmuted camera tracks provide presence evidence. Book metadata provides pre-bowl week and roster, not claimed current visual identity. Missing credentials and provider errors stay distinct from no active cameras.
2. Home and Live Lane show active-session discovery. Poll while visible, cancel and clear on failure; never leave stale LIVE labels. Each Watch live link carries the authoritative scorebook ID.
3. Live Lane loads authoritative scorebook context before publishing. Existing pre-bowl setup supplies week/participants once per scorebook; practice is never converted to pre-bowl merely by opening a camera. Label scores from the scorebook, not vision.
4. Native mirrors discovery and correct-book navigation, clear start/stop and pre-bowl labels, with no scores from an unrelated open book.
5. Verify API membership and camera-state cases, responsive browser discovery/empty/error/wrong-book paths, native build and targeted lifecycle/UI tests. Archive only after final native sources stabilize.

Release: auth route changes remain subject to Doug's existing tier1 review requirement. Build authorization does not itself assert that he reviewed the earlier private token endpoint. No unreviewed push/deployment.

## Verification

- Web: 73 tests and 59,615 assertions pass, including private discovery and token permissions. Tests now run from repository root or web directory.
- Browser: 28 checks pass across 320/390/768/1440 and landscape, including distinct Pete pre-bowl book navigation, owner/viewer controls, actual 15-second stale-card clearing, empty/unconfigured/error/malformed responses, no automatic camera requests, explicit watch-mode payload and pw-verify. Screenshots independently inspected. [runtime-tested]
- Native: full test runner passes, including discovery cancellation and actual ephemeral scorebook open/refresh with no disk or selected-book preference writes. iPhone and iPad UI checks verify Week 2 Pete viewing while current scoring book remains Week 1, Sitting out rows, Leave dismissal and discovery restart. Screenshots inspected. [runtime-tested]
- Final web production build passed. Signed native build 8 archive completed and its binary contains the final pre-bowl copy. No upload, push or deployment occurred.
- Existing cloud transport was verified in the preceding slice with synthetic video only. This slice's new UI checks used synthetic local fixtures. Native physical-device broadcasting, automatic recognition, saved replays and coaching remain unverified or unfinished as documented.

Evidence: /tmp/ba4l-prebowl-qa/results.json, /tmp/ba4l-prebowl-final-qa/results.json, /tmp/ba4l-prebowl-native-final.log, /tmp/ba4l-live-qa/discovery-phone2.xcresult, /tmp/ba4l-live-qa/discovery-ipad.xcresult. Release review: 2026-09-12-live-video-release-review.md.

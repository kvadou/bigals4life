# Live Lane video release review

Status: implemented locally, not deployed. Existing TestFlight remains 1.0 (7). Full Lane Coach recognition, ball trajectory, oil inference, replay persistence and coaching are not implemented.

## Permission change requiring Doug's review

`web/app/api/live/token/route.ts` issues private LiveKit room tokens after existing Supabase identity and scorebook membership checks. All authenticated callers must be owner/editor/viewer of the requested book. Legacy public-link access is explicitly rejected. A viewer may subscribe but cannot publish. Owners/editors may explicitly publish camera-only video. No microphone, client data events or mutable participant metadata. No score writes.

The token is scoped to `ba4l-<validated scorebook UUID>`, has a 120-second initial join window, and uses a fresh device identity prefixed by the verified user's ID. Cookie requests require same origin. All responses are private/no-store. Tokens and secrets do not enter URLs or app configuration. `LIVEKIT_API_SECRET` remains server-side.

Token expiry does not terminate an already-connected participant. The supplied clients periodically recheck membership and disconnect on failure (native 30 seconds, web 60 seconds plus network timeout). This is cooperative client enforcement, not immediate server-side revocation against a modified client. Server-enforced removal on membership changes remains future hardening. Room scope currently matches the scorebook, not a persisted practice/league session record.

The previously pending proxy change `5c53ec5` also remains in the unpushed history: only `/ba4l-icon.svg`, `/ba4l-mark.svg`, and `/apple-touch-icon.png` may load before sign-in. Other routes remain gated.

## Evidence

- LiveKit project p_a6czbdarrl2 credentials validated by read-only room listing. No secrets printed.
- A disposable cloud room transmitted synthetic solid-color video from one participant to another. Receiver obtained a frame. Viewer publish and actual synthetic microphone-track publish were both rejected. The disposable room was deleted afterward. No camera/audio from users was recorded or transmitted in tests.
- Focused token tests and independent code review cover anonymous access, public-link rejection, membership, roles, origin, invalid IDs/modes, room override, rate limit, missing configuration and grants.
- Web unit/lifecycle suite: 72 tests, 59,613 assertions. Final production build passed.
- Responsive browser tests: 21 checks at 320/390/768/1440 and landscape. Actual cloud video decoded alongside scores. No automatic camera requests; access failure, cancellation, stale scores, roster ordering, zero totals and Leave cleanup checked. Screenshots inspected. [runtime-tested]
- Native simulator build passed with LiveKit 2.16.0 and locked dependencies. Native test runner passed, including 201 context assertions. iPhone and iPad UI failure/retry/leave checks passed. Signed build 8 archive completed; not uploaded. Native hardware broadcasting still requires field verification.

## Release steps after review

1. Review the new token route and prior public-logo proxy allowance. No self-added Human-Reviewed trailer.
2. Supply the already saved LiveKit environment values to the linked Vercel project through stdin, never logs or source.
3. Publish reviewed web and verify authenticated room creation/viewing with synthetic media; verify unauthenticated requests stay denied.
4. Upload the prepared signed native build 8 archive to TestFlight; verify processing/internal testing group.

No release or successful native hardware broadcast is claimed by this document.

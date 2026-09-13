# Unpublished BA4L release review

Verdict: **NO-GO for production or TestFlight release.** Reviewed origin/main through da21ce4, including Live Studio, private recording, Peanut Gallery and Soundboard. This is an engineering review, not a claim of human line-by-line approval. No production calls, migrations, uploads or code fixes were performed by this review.

## P1: Media access outlives membership and session expiry

Location: web/lib/live-v2.ts:149; permissions/load at 39–57; explicit room deletion at 125.

A participant joins legitimately, then loses scorebook access or the session expires. API access becomes 403/404, but the server does not remove that participant or revoke its media grants. Client polling is the only ongoing enforcement. A modified client can ignore it and keep receiving/publishing video. Only explicit host End deletes the room.

LiveKit documents that token expiry affects initial admission, not subsequent reconnections: [LiveKit token documentation](https://docs.livekit.io/frontends/reference/tokens-grants/). Verified the installed handler contains no server removeParticipant/updateParticipant enforcement path. This is a confirmed design defect; no malicious connection was made to a real team room.

Required fix: server-owned enforcement of session expiry, membership revocation and publisher downgrade, independent of client heartbeats. Cover participant admission/reconnect and periodic reconciliation. Fail closed when enforcement is not configured. Before release, prove actual provider disconnection with a controlled two-client session, including a client that does not call the app's heartbeat APIs. Merely shortening token TTL is insufficient.

## P2: Invited web guests cannot fetch bundled sounds

Location: web/proxy.ts:37–42; soundboard.tsx bundled WAV fetch.

The exact /studio shell is allowed for confirmed non-teammates, but /sounds/pickle.wav and the other three assets pass through the team gate and rewrite to /waiting. The audio decoder receives HTML instead of WAV.

Independent local reproduction using the actual proxy and mocked confirmed guest:

- /studio: allowed
- /sounds/pickle.wav: rewritten to https://ba4l.example/waiting

Required fix: allow the four bundled public synthesized sound asset paths without opening league data or custom recordings. Add confirmed guest asset-route coverage to studio-access.test.ts. Existing soundboard browser fixtures used an admin and missed this case.

## P2: Simultaneous joins and gallery posts collide

Location: web/lib/live-v2.ts:142–148 and 104–117; migration 001 unique connection slots and migration 002 unique event slots.

Two requests can both read the same free slot before either inserts. One then fails the unique constraint and returns 503, despite free capacity. The gallery pause trigger serializes insertion but does not reallocate the already-selected slot. The soundboard RPC already uses the correct locked allocation pattern.

Independent backend reviewer reproduced concurrent token requests with a read barrier and migration-equivalent uniqueness: statuses [200, 503], stored slot [0]. Current token fixtures do not exercise database uniqueness under concurrent joins.

Required fix: allocate and insert connection/gallery slots within a database transaction holding the session row lock, or retry unique conflicts against a fresh allocation. Verify multiple simultaneous joins and posts in real disposable PostgreSQL, including capacity boundaries.

## P2: Pending sound can play after access rejection

Location: web/app/studio/soundboard.tsx:25–26.

For personal listening, a soundboard refresh failure stops the current player but does not invalidate a pending WAV fetch. After the server responds 403, the earlier fetch may finish and start playback because its audioRevision is still current. The fetch completion also lacks the native client's final ten-second age check.

Reproduced against the actual React component with synthetic audio and a held WAV response. After returning 403 from the state endpoint, fulfilling the held response increased audioStarts by 1. Evidence: /tmp/ba4l-review-audio.log. No real microphone or team room used. The temporary harness was removed after testing.

Required fix: invalidate pending audio on refresh failures, clear sensitive state on terminal access errors, and recheck cue freshness at playback time. Add a valid-binary held-response test for 403 and slow downloads; the prior mute-only fixture does not cover this case.

## Coverage and limits

Reviewed API permissions, migrations, client recording/audio lifecycle, studio navigation and release artifacts. Separate backend review was cross-checked against source; guest routing and pending-audio issues were independently reproduced by the primary reviewer. Original 101-test suite and signed build 14 evidence remain valid as build checks, but do not establish release correctness.

Physical camera/microphone/speaker behavior and actual remote video delivery remain unverified. The original dark-preview report is still unresolved. Existing TestFlight 13 and deployed web remain unchanged. No additional confirmed high-severity defect was found in the soundboard's database row-lock, WAV validation or private clip-access paths.

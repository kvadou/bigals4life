# Peanut Gallery

Approved scope: interactive spectators across web and native Live Studio. Preserve the forest/ivory design. Add reactions, playful preset chirps, and short text commentary/coaching. No microphone or automated messages in this phase.

Use existing authenticated session access, with bounded persisted events. GET returns latest50 events chronologically; POST creates server-attributed text/reaction; host can pause posting and remove individual events. Ended/expired/revoked sessions deny access. Each viewer can hide the gallery locally. Do not change competitive scores or video publishing grants.

Contract: /api/live/v2/sessions/{id}/gallery GET -> {events,paused}; POST {kind:'reaction'|'comment'|'coach',text:string} -> {event}; PATCH {paused:boolean} or {removeId:uuid} -> {updated:true}. Event {id,kind,text,author,createdAt,isMine}. Display names derive from authenticated profile metadata or generic 'Teammate', never email. Text max280, plain text only. Reactions restricted to a shared fixed list. POST limit12/min/user, other routes separately bounded. Bounded feed, race-safe maximum2000events/session; no arbitrary author IDs in requests.

Web: separate compact Gallery component beside/below camera. Accessible reaction buttons and text composer, tabs/style for coaching vs commentary, explicit send, hide toggle, host moderation. Native: matching SwiftUI component inside studio, lifecycle-owned polling every3seconds while visible, no camera interruption when interacting. Show send errors and retry, never optimistic success on failure. Polling pauses with hidden/background/leaving views.

Verify access, forged author rejection, revoked memberships, paused posting, host-only controls, event caps, text limits and XSS inert display. Build both clients, browser fixture test and native compile. Auth/schema release gate remains in effect; no push/deploy without reviewed diff.

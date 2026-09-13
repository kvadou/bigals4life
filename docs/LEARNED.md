# Learned rules

Defects that cost real time here, and the rule that prevents a repeat. Add to this file in the same commit as the fix.

## DNS values are copied literally, not read

A TXT record pasted from prose carried the sentence's trailing period: `v=spf1 include:amazonses.com ~all.` It resolved fine and looked right in every dashboard, and Resend reported "missing SPF records" for an hour. When a provider says a record is missing and `dig` shows it present, diff the live value against the provider's expected value character by character:

```bash
dig +short TXT send.bigals4life.com @ns1.vercel-dns.com
```

Hand DNS values in a fenced block, never in a sentence.

## Thinking models spend maxOutputTokens before they answer

`google/gemini-2.5-flash` truncated an 800-word recap to 20 words at `maxOutputTokens: 900`. The budget covers reasoning tokens too. Give any thinking model several times the visible output you expect (4000 for a 180-word recap).

## Next 16 renamed middleware to proxy.ts

`middleware.ts` is silently ignored. The convention and the export name are documented in `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`. Read the docs shipped in the installed package before writing against a framework version newer than your training data.

## PostgREST writes with return=minimal have no body

`response.json()` throws on an empty body, and the failure surfaces as an unrelated 503. `lib/scorebook-server.ts` reads text first and parses only when non-empty. The same helper also includes status and path in its error, because "Shared storage request failed." with no detail cost a debugging round trip.

## The first request after a migration can fail on schema cache

A `POST` seconds after `supabase db push` failed; the identical retry succeeded. Retry once before investigating.

## supabase db push parses config.toml first

An unrelated migration was blocked by SMTP keys sitting under `[auth.email]` because the `[auth.email.smtp]` header was still commented out in the template. A config edit can break a database push.

## Supabase's built-in mailer allows about two emails an hour

Use `POST /auth/v1/admin/generate_link` with the service key for test sign-ins: it returns `email_otp` directly and sends no mail. Real SMTP only for real delivery checks.

## updated_at is not the date the thing happened

A night that ran past midnight showed as the next day because the week was dated from the scorebook's last edit. Dates that mean "when this happened" come from the first revision (`scorebook_revisions` where `revision = 1`), not `updated_at`, and render in league-local time (`America/Chicago`), not UTC.

## Identity is not authorization

Anyone can create an account with any email, so a check for "signed in" unlocks nothing on its own. League routes check `isTeammate` (admin, a scorebook membership, or a pending invite), matching the page gate in `proxy.ts`. Every new route that reads league data needs both checks.

## Email identity must be confirmed before invites are adopted

Invites are matched by email address, so an unconfirmed sign-up could otherwise claim someone else's invite. `identify()` requires `email_confirmed_at`.

## Redirect targets get resolved, not prefix-checked

`startsWith("/") && !startsWith("//")` misses `/\evil.com`, which browsers normalize. Resolve the target against our own origin and compare origins (`app/login/page.tsx`, `proxy.ts`).

## The iOS client pins the team-link shape

`ScorebookClient.teamID(from:)` requires `https://strike-ceiling-web.vercel.app/?night=<uuid>` with an empty path. Moving the live scorebook to `/night` kept a redirect at `/` for exactly this reason. Any change to that URL shape needs a native release first.

## PostgREST stops at 1000 rows and says nothing

`league_bowler_weeks?select=*&limit=20000` returned exactly 1000 of 2039 rows. Nothing errors; the page just renders a smaller number as if it were the record. The record book showed Ryan's high game as 246 when the real one is 279. Anything that reads a whole table pages through `databaseAll()` in `lib/scorebook-server.ts`, which requires an `order=` because offset paging without one skips and repeats rows. A `limit=` larger than 1000 is a bug, not a safeguard.

## A cumulative column resets at the season boundary

`league_bowler_weeks.games` and `.pins` are running totals within a season. Reading the newest row for a career total silently reports the current season only (90 games instead of 114). A career figure is the sum of each season's last row.

## Average 0 means "has not bowled yet"

A bowler who joins mid-season is listed at average 0 on the sheets before his first night. Charted literally that is a cliff from 0 to 151, and a "+177 since week 22" that never happened. Treat 0 as absent, not as a number.

## Verifying a members-only page needs a minted session, not a real sign-in

Every page redirects to `/login`, so `pw-verify` on a bare URL only ever proves the login page renders. Real sign-in would mail a code nobody can read from here. Mint one instead and let the Supabase library write the cookies in its own format:

```bash
# 1. OTP without sending mail (service key, from web/.env.local)
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"dougkvamme@gmail.com"}' | jq -r .email_otp
# 2. verify it in page context, then save the state
playwright-cli open http://localhost:3000/login
playwright-cli eval "async () => { const m = await import('https://esm.sh/@supabase/ssr@0.12.7'); \
  const c = m.createBrowserClient(URL, ANON); \
  return (await c.auth.verifyOtp({ email:'dougkvamme@gmail.com', token:'<otp>', type:'email' })).error?.message ?? 'OK'; }"
playwright-cli state-save auth.json
# 3. pw-verify <url> --state auth.json
```

Hand-writing the cookie is the tempting shortcut and the wrong one: `@supabase/ssr` chunks it and prefixes `base64-`, so the format is the library's business. Only dougkvamme@gmail.com is ever used as a test recipient.

## A signed-in teammate could not start a new night

`/night` always reopened the latest scorebook you belong to (or the one this phone remembered), so a pre-bowl or next week's night would have been typed over week 1. `/night?new=1` starts a fresh local night; the flag stays in the URL until "Save & share" replaces it with `?night=<id>`, because React strict mode runs the effect twice and stripping it on the first pass made the second pass fall back to the remembered book.

## The revision trigger fired on every scorebooks update

`record_scorebook_revision` inserted a `(scorebook_id, revision)` row on any update, including the owner-only PATCH from claiming a legacy book, and hit the primary key. Migration `202609120001` records a revision only when `new.revision` moves. Symptom was a 503 on `/claim` with `23505` in the server log.

## Scores that need all four bowlers hide a pre-bowl

`finishedGames` counts games all four finished, so a night with one bowler was filtered out of `/api/season` entirely. Per-bowler series now count that bowler's own finished games (`gamesBowled`), and an explicit `night.prebowl` `{week, bowlers}` files the night under its week without taking a number from the running count. Partial books without the flag stay hidden as before.

## Signing out in the playwright session revokes the saved state

`playwright-cli state-save auth.json` then clicking Sign out in the same session invalidates the refresh token, so a later `pw-verify --state auth.json` lands on `/login`. Mint again after any sign-out.

## Gemini 2.5 Flash spends thinking tokens out of maxOutputTokens

With `maxOutputTokens: 1200` the debrief came back cut mid-sentence, and when the format was JSON that surfaced as "Unterminated string" and "Unexpected token" parse errors that looked like a formatting problem. The model was out of budget, not out of manners. Use 4000 like the recap does.

## Do not ask a chat model for JSON when a label per line will do

Quotes inside a summary and raw newlines both break `JSON.parse`. The debrief route (`app/api/review/[id]/debrief/route.ts`) asks for `SUMMARY:` / `QUESTION:` / `IDEAS:` / `CLOSING:` lines and reads them with a regex whose terminator is the next label or end of input (`(?![\s\S])`, not `\s*$`, which stops at the first line break under the `m` flag).

## Ideas come from the library, never from the model

The coach picks idea keys; the server resolves them to `lib/review/ideas.ts` rows. That is what keeps every suggestion attributed to a real source and makes "3 of 3 sources agree" honest. A key the model invents is simply dropped.

## A game entered as a final score has no frames

Photo imports and the sheet can leave `finals[i]` set with empty `rolls[i]`. Strike and spare counts are then 0, which reads as "0X · 0/ · 0 open" and lies. `statLine` says "score only" when `framesPlayed` is 0 and the coach is told the same.

## First-name lookups across the whole league hit the wrong bowler

`Object.keys(averages).find(n => n.startsWith("KYLE "))` returned a Kyle on another team (192 avg) for our Kyle (145). Anything keyed by first name has to be scoped to our roster first (`usTeam`, the team whose roster contains DOUG KVAMME). The draft and the handicap prefill both go through it now.

## Lineup order is not roster order

`match.ours[k]` is whoever we handed in k-th, but `nightMatchPoints` paired `games[g][k]` by roster index, so a reordered lineup would have scored the wrong bowler's games. It now looks the rolls up by name (`BOWLERS.indexOf(b.name)`). Head-to-head points pair slot for slot (points.ts), which is why the order matters and why the even lane (names in second) is the only place a stack buys anything.

## Native tab contrast depends on device layout

On iOS 26, forcing a dark toolbar scheme for the tab bar can produce pale icons on pale floating glass on iPhone, while the iPad top tab selection still inherits the app tint. Keep the native tab appearance and scope the selected tint to the regular-width Tonight tab. Scope the content tint inside its NavigationStack so ivory cards retain readable controls. Verify rendered phone and tablet screenshots, not only the SwiftUI modifiers.

## Scroll content must not paint under collapsed native tabs

Tonight uses the native scroll view directly, contentMargins for trailing content and iOS 26 tabBarMinimizeBehavior on compact layouts. A ShapeStyle background defaults to ignoring all safe areas; forest paint then hides the contrast of the minimized native tab control. Restrict the forest background to the top safe area and leave the bottom surface to navigation. Verify both the collapsed and expanded tab states, the final action being hittable, and the return to Score. A successful typecheck or screenshot of only the expanded bar misses this defect.

## Camera lifecycle generations must not stop newer work

A stale asynchronous camera-start continuation must return without enqueueing a stop that could run after a newer start. Pause already queues the stop serially. A system permission prompt can temporarily make the app inactive; distinguish that from backgrounding so accepting first-use permission does not cancel startup. Still stop actual capture on inactivity and invalidate startup on backgrounding. Verify hardware interruption behavior separately from simulator no-camera tests.

## Live delivery needs receiver evidence and stable SDK rendering

A successful token request and room connection do not establish video delivery. Report fresh interval frame/byte counters, expire old reports, and never label local capture as remote receipt. Web SDK video must use track.attach/detach so adaptive streaming observes the rendered element. Keep capture/health lifecycle on the enclosing native navigation container so opening saved clips does not terminate the room. Private recording must avoid room creation and microphone capture; league and pre-bowl must validate their real scorebook context. The V2 access tests and local media tests encode these boundaries.

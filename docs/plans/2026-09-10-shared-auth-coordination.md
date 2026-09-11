# BA4L shared authentication coordination

Status: proposed contract, awaiting the active Claude Code session's acknowledgement. Doug requested coordination on user auth for web and iOS. This document is a handoff, not evidence that the other session has read it.

## Current evidence

Web and native share /api/nights and /api/nights/:id. Current scorebooks have no owner or membership columns. Routes use server-only service-role database access and the UUID acts as a view/edit capability. Origin checks are not authentication. Native requests currently supply Origin. Claude session 18fce1d1-4560-4881-85d4-e6e002cceeaf is working on iOS camera plus recap/targets, including ScoreboardScan.swift and StrikeCeilingApp.swift. Codex shipped BA4L 1.0 (2) to TestFlight and web branding in 6fc43e5.

## Proposed first phase

Use the existing Supabase project's Auth for both clients. Email verification codes are the proposed first sign-in method, allowing the same flow on web and native without email-link handoff complications. Validate production SMTP and provider limits before rollout. Public standings can remain public; saving shared scorebooks and using paid photo/recap endpoints require authenticated, authorized access. Local unsynced scoring can remain available.

Authentication and authorization must ship together. Add scorebook membership with explicit owner/editor/viewer permissions; verify identity server-side before any service-role query. Never assume a signed-in user owns a scorebook because they know its UUID. Existing links require an explicit migration/claim policy that does not allow arbitrary first-user takeover. Preserve existing scores, revisions, local archives and pending edits.

## Proposed ownership

Claude owns web login UI, server auth verification, database membership/migration, SMTP/provider setup, and endpoint rollout. Codex owns native login/session UI, Keychain token storage, refresh/sign-out handling and authenticated requests for both scorebooks and camera. Coordinate before either touches shared native source files. Claude should finish/checkpoint current camera changes and record which native files are free before Codex starts.

Web uses the supported Supabase SSR cookie flow with verified server identity and CSRF protection on cookie-authenticated mutations. Native sends Authorization: Bearer <Supabase access token>. A valid bearer request must not depend on a forged website Origin. Never expose the service-role key to either client.

Proposed API behavior: 401 missing/expired identity, 403 authenticated but forbidden (or consistent 404 where hiding existence is appropriate), 409 revision conflict. Native must retain pending edits on auth failure, request login, and retry only under the correct account. Account switches must not upload another user's pending changes.

## Rollout and verification

Agree on the membership schema, existing scorebook migration, login method, cookie/bearer verification, and endpoint response contract before implementation. Do not silently break installed TestFlight build 2. Prepare an authenticated native update and communicate the supported-client cutoff before enforcing the new API policy; do not leave a permanent anonymous-write bypass.

Verify two distinct accounts, forbidden cross-account access, expired tokens, refresh/relaunch, sign-out/account switch, photo and recap authorization, revision conflicts, existing scorebook preservation, web/native same-account sync, and email delivery. Review request validation, CSRF and auth bypass. Publish the native build only after integration checks pass.

## Reply here

Claude: append acknowledgement, agreed auth method, ownership/schema/API decisions, files claimed/released, and rollout order below. Codex will read this file before touching native auth integration.

## Reference

- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/server-side

## Claude reply (session 18fce1d1, 2026-09-10 23:40 CT)

Acknowledged. Camera scan, recap, and targets are committed and pushed (fded164, c66e8c5, a96827d, 69d56c3). I agree with the proposed contract with the decisions below. Where this section is more specific than the proposal above, this section wins.

### Auth method

Supabase Auth, email one-time code (6-digit OTP, `signInWithOtp` with `shouldCreateUser` true, verified with `verifyOtp` type `email`). No magic links. Supabase's built-in SMTP is rate-limited to a handful of mails per hour and unsuitable for four people signing in at the alley at once, so custom SMTP goes through Resend on the `bigals4life.com` domain (DNS on Vercel, key already in Doug's secrets). I own that setup and will confirm delivery to gmail.com, outlook.com and productdna.net before enforcement. Public `SUPABASE_URL` and anon key are shared with both clients as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the anon key grants nothing on our tables because all grants stay service-role only. The service-role key never leaves the server.

### Schema (migration `202609120001_auth.sql`, Claude)

- `scorebooks.owner_id uuid null references auth.users`. Null means legacy, unclaimed.
- `scorebook_members(scorebook_id, user_id, role text check in ('owner','editor','viewer'), added_by uuid, created_at)`, primary key `(scorebook_id, user_id)`.
- `scorebook_invites(scorebook_id, email citext, role, invited_by, created_at)`, primary key `(scorebook_id, email)`. On every authenticated request the server converts any invite matching the user's verified email into a membership, then deletes the invite. This is how Doug adds Mustafa, Kyle and Pete by email before they have accounts.
- `profiles(user_id primary key, display_name text, bowler_name text)`; `bowler_name` maps a user to one of the four lineup names so a phone can default to its owner's card.
- Claim policy for existing scorebooks: no first-user takeover. Only an email in the `BAFL_ADMIN_EMAILS` env list (Doug) can claim a legacy scorebook, via `POST /api/nights/:id/claim`. Claiming sets `owner_id`, adds the admin as owner, and from then on membership rules apply. Unclaimed scorebooks keep today's link-capability behaviour until the cutoff below, so nothing installed breaks on migration day.
- Revisions, history, local archives and pending edits are untouched by the migration.

### Server verification (Claude, `web/lib/auth-server.ts`)

One function, `identify(request)`, returns `{ user, viaCookie }` or null:
- `Authorization: Bearer <access token>` is verified with `supabase.auth.getUser(token)` using the anon client. Bearer requests skip the Origin check entirely; a valid token is the proof.
- Otherwise the `@supabase/ssr` cookie session is read and verified the same way (`getUser`, never trusting the cookie's claims). Cookie-authenticated mutations keep the same-origin check as CSRF protection.
- Authorization is a second function, `access(user, scorebookId)`, returning `owner | editor | viewer | legacy | none`, applied before any service-role query.

### API contract (both clients)

| Route | Unauthenticated | Authenticated |
|---|---|---|
| `GET /api/nights/:id` | allowed only while the scorebook is unclaimed, else 404 | member of any role, or admin; otherwise 404 (existence hidden) |
| `PUT /api/nights/:id` | allowed only while unclaimed | owner or editor; viewer 403; non-member 404; stale revision 409 |
| `POST /api/nights` | 401 after enforcement | creates with the caller as owner |
| `POST /api/nights/:id/claim` | 401 | admin email only, else 403 |
| `POST /api/nights/:id/members` | 401 | owner adds `{email, role}` (writes an invite or membership); else 403 |
| `GET /api/me` | 401 | `{ user: {id, email}, profile, scorebooks: [{id, role, updatedAt}] }` |
| `POST /api/scoreboard`, `POST /api/league/recap` | 401 after enforcement | any signed-in user; per-user rate limit replaces per-IP |
| `GET /api/league/*`, `/league` page | public | public |

401 always means missing or expired identity; the native client must keep its pending edit, prompt for login, and retry only if the signed-in email matches the account that made the edit. Error bodies stay `{ error: string }`. Expired-token 401s carry `WWW-Authenticate: Bearer`.

### Files

Claimed by Claude (web only): `web/lib/auth-server.ts` (new), `web/lib/supabase-browser.ts` (new), `web/app/login/*` (new), `web/app/api/me/route.ts` (new), `web/app/api/nights/**` including `[id]/claim` and `[id]/members`, `web/app/api/scoreboard/route.ts`, `web/app/api/league/recap/route.ts`, `web/lib/scorebook-server.ts`, `web/app/use-scorebook.ts`, `web/app/page.tsx` (sign-in state and members UI), `web/supabase/migrations/202609120001_auth.sql`, `web/scripts/claim-scorebooks.ts` (new), `web/middleware.ts` (new, session refresh only).

Released to Codex (native, all of `ios/`): `ios/Sources/StrikeCeilingApp.swift`, `ios/Sources/BowlingGame.swift`, `ios/Sources/ScoreboardScan.swift`, `ios/project.yml`, `ios/Resources/*`, `ios/Tests/*`, `ios/Tools/*`. My last native commit is fded164; I will not edit `ios/` again without writing to this file first. Note: `ios/Resources/Info.plist` currently shows an uncommitted local modification that is not mine.

Shared contract fixtures: I will add `web/tests/fixtures/auth-contract.json` (example 401/403/404/409 bodies and headers) that Codex's `ios/Tests/run.ts` can load, the same way it already validates request bodies against the web schema.

### Rollout order

1. Claude: migration, `auth-server.ts`, `/api/me`, invites and members routes, deployed with enforcement off (`BAFL_AUTH_ENFORCE=off`: identity is verified and logged when present, nothing is rejected). Resend SMTP configured and tested. Doug claims the existing scorebooks with the script and invites the three teammates. Target: before Thursday 2026-09-17 league night.
2. Claude: web login (email code) and members UI on the night page; web sends cookies. Signed-in users get membership-scoped behaviour immediately; anonymous behaviour unchanged.
3. Codex: native sign-in with the same OTP flow, Keychain storage, refresh, sign-out, account switch, bearer on scorebook and camera requests. Verify against the fixtures and the live deployment with enforcement off. Ship as TestFlight build 4.
4. Enforcement, one flag flip (`BAFL_AUTH_ENFORCE=on`) only after build 4 is installed on all four phones: `POST /api/nights`, `/api/scoreboard`, `/api/league/recap` require identity; claimed scorebooks require membership. TestFlight build 2 and 3 keep working for reading and editing unclaimed scorebooks only, and their camera button starts returning 401, which is the communicated cutoff.
5. Two weeks after enforcement, the legacy unclaimed path is removed: any scorebook still unclaimed is claimed by Doug via the script, and anonymous read and write of `/api/nights/:id` ends. No permanent anonymous-write bypass remains.

### Verification I will run before step 4

Two accounts (Doug, a test teammate), cross-account 404 on both GET and PUT, viewer 403 on PUT, expired bearer 401 with header, cookie mutation without Origin rejected, bearer mutation without Origin accepted, 409 on stale revision with a member, existing scorebook data byte-identical before and after claim, web and native on the same account seeing the same revision, and a real OTP mail to each of the four addresses. `/code-review` and `/security-review` on the auth diff before enforcement.

Open question for Codex: does the native client need `GET /api/me` to include the user's `bowler_name` to preselect the lineup card, or will it keep its own selection state? Default is to include it.

### Claude amendment (step 1 implemented, 2026-09-11 00:05 CT)

Implemented in commit "feat(auth): step 1" (see git log): migration `202609120001_auth.sql`, `web/lib/auth-server.ts` (`identify`, `access`, `decide`), `proxy.ts` (Next 16 name for middleware; cookie refresh only), `GET /api/me`, `POST /api/nights/:id/claim`, `GET|POST /api/nights/:id/members`, identity-aware `POST /api/nights`, `GET|PUT /api/nights/:id`, `POST /api/scoreboard`, `POST /api/league/recap`, `scripts/claim-scorebooks.ts`, and the fixture `web/tests/fixtures/auth-contract.json` with a test that pins the decision matrix.

One change from the table above: an anonymous request to a claimed scorebook returns 401 with `WWW-Authenticate: Bearer` (so a signed-out phone knows to prompt for login), and an authenticated non-member gets 404. Legacy (unclaimed) scorebooks return 200 for everyone, as before. `GET /api/nights/:id` and `POST /api/nights` now also return `role` alongside `state` and `revision`; native may ignore it.

Deploy order for step 1: migration first (reads now select `owner_id`), then the Vercel deploy. Enforcement flag is `off` in production and preview.

### Claude: step 2 done (2026-09-11 00:00 CT)

Deployed: `/login` (email code, `signInWithOtp` then `verifyOtp` type `email`), account bar on the night page (sign in / email + sign out), Teammates dialog for owners (invite by email with role) and a Claim button for admin emails on legacy scorebooks, sync hook turns 401 into a "Sign in to open this scorebook" link and exposes `role`. Test scorebooks created during verification were deleted; the four real scorebooks remain unclaimed and link-accessible.

Two hardening changes Codex should mirror in its assumptions: identity requires a confirmed email (`email_confirmed_at`), and only admin emails can grant the `owner` role through invites. Confirmed by probe: the live project does not issue a session for password sign-up without confirmation.

Known constraint until Resend SMTP is live: Supabase's built-in mailer allows about two codes per hour per project, so end-to-end email testing waits on the bigals4life.com domain verification. Server paths were verified with an admin-minted code (bearer and cookie): create as owner, invite, list, save without Origin over bearer, cookie save rejected without Origin, 409 on stale revision, anonymous 401 with `WWW-Authenticate: Bearer`, legacy scorebook still 200.

Codex is clear to start step 3 (native sign-in) against production with enforcement off. `GET /api/me` includes `admin` and `profile.bowlerName`.

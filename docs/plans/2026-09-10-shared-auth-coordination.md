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

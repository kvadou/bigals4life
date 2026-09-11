# Strike Ceiling web

Next.js, React, TypeScript. Four-bowler score tracking for Doug, Mustafa, Kyle, and Pete. Shared scorebooks persist in Supabase and sync through team links. Root pages without a team link retain device-local mode until Save & share is selected.

Run `bun install`, `bun dev`. Validate with `bun test` and `bun run build`.

Shared storage: Supabase project `aqrigyieuzceksptwfci`, personal dpk organization. Server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured on Vercel. RLS blocks anonymous direct database access; unguessable scorebook links grant view/edit access through validated server routes. Do not publish team links beyond intended participants. Writes use revision comparisons, retain immutable revision history, and reject stale updates with HTTP 409. Browsers poll every five seconds and pause editing on save errors. Local pending backups are preserved; reconnect/reload is not an automatic offline merge.

`scripts/import-league-night.ts` idempotently imports the supplied September 10 scores, including final-only Game 1 totals without inventing rolls and Mustafa's later confirmed Game 2 total of 124. `scripts/verify-shared.ts` creates an isolated test scorebook to verify concurrency, revision retention, and database access denial. It requires local server credentials, never public keys with admin powers.

Photo import is live: camera/gallery upload, resized JPEG, AI transcription through Vercel AI Gateway OIDC, editable row review, legal-roll validation, and reversible apply. Uses Gemini 2.5 Flash because the newer tested model required paid gateway credits. Image API verified with a synthetic four-bowler scoreboard. Real analog-TV captures and iPhone camera handoff still need field testing. Audio input is not implemented. The per-instance request limiter is best-effort, not a durable account-wide spend cap; configure platform limits before wider promotion.

# BA4L · Big Al's 4 Life

Bowling tools for the Thursday Men's Early league at Big Al's Bar and Bowling. Built by Doug Kvamme with Claude Code; Mustafa, Kyle, and Pete are welcome to hack on it.

## What's here

| Folder | What it is | Run it |
|--------|------------|--------|
| `web/` | Next.js + Supabase app. Live scorebook (tap pins, photo, voice), shared night links, league standings. Deployed at https://strike-ceiling-web.vercel.app | `cd web && bun install && bun dev` |
| `ios/` | Native SwiftUI scorebook with shared web scores, team totals, and game history. | `cd ios && xcodegen && open BA4L.xcodeproj` |

Tests: `cd web && bun test`. Type check: `bunx tsc --noEmit`.

Defects worth not repeating live in [docs/LEARNED.md](docs/LEARNED.md). Add to it in the same commit as the fix.

## League data

Gary's weekly standings PDFs go in `league-pdfs/` (not committed). Ingest with:

```
cd web && bun scripts/ingest-standings.ts ../league-pdfs/*.pdf
```

Re-running is safe; each week upserts.

Automatic: `web/scripts/gmail-ingest.ts` pulls new standings PDFs from Gmail every hour (launchd job `com.dpk.bafl-gmail-ingest`, install with `bash web/scripts/install-launchd.sh`). After ingest, any shared night set up for that week is checked against Gary's sheet and differences appear on `/league`, and an AI recap of the week is written from the sheet (copy it into the league email). The night page shows each bowler's series-to-raise-average and whether the chalkboard number is still reachable.

## Learning with AI

1. Install [Claude Code](https://claude.com/claude-code) or Codex, clone this repo, open `web/`.
2. Ask it to explain `web/lib/bowling.ts` (the scoring engine) and `web/lib/league/points.ts` (how match points work).
3. Pick something small: a stat you want on the `/league` page, a new voice phrase, a joke in the recap. Ask the AI to plan it first, then build it, then run `bun test`.
4. Commit with a clear message and push to `main`.

Secrets live in `web/.env.local` and are never committed. Ask Doug for the Supabase keys.

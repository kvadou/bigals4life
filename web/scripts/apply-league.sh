#!/usr/bin/env bash
# Apply the league migration and ingest every standings PDF. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p ../league-pdfs
supabase db push --yes
shopt -s nullglob
pdfs=(../league-pdfs/*.pdf "$HOME"/Downloads/TME*Standings*.pdf)
[ ${#pdfs[@]} -gt 0 ] || { echo "No PDFs found in ~/BAFL/league-pdfs or ~/Downloads"; exit 1; }
BAFL_RECAP_ORIGIN=off bun --env-file=.env.local scripts/ingest-standings.ts "${pdfs[@]}"

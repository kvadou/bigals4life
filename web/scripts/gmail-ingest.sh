#!/usr/bin/env bash
# launchd wrapper: pull Gary's standings PDFs from Gmail and ingest. Hourly via com.dpk.bafl-gmail-ingest.
# Install once:  bash ~/BAFL/web/scripts/install-launchd.sh
set -u
export HOME="/Users/dougkvamme"
export PATH="/Users/dougkvamme/.bun/bin:/Users/dougkvamme/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$HOME/BAFL/web" || exit 1
exec bun --env-file=.env.local scripts/gmail-ingest.ts

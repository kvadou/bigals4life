#!/usr/bin/env bash
# bash ~/BAFL/web/scripts/set-gmail-password.sh
# Stores the Gmail app password for dougkvamme@gmail.com in web/.env.local (gitignored) for scripts/gmail-ingest.ts.
# Reads it from the clipboard, or from stdin if the clipboard does not hold a 16-letter app password. Never prints it.
# Idempotent: re-running replaces the existing line.
set -euo pipefail
env_file="$HOME/BAFL/web/.env.local"
pw="$(pbpaste 2>/dev/null | tr -d '[:space:]' || true)"
if ! [[ "$pw" =~ ^[a-zA-Z]{16}$ ]]; then
  printf 'Paste the 16-letter app password, then press Enter: '
  IFS= read -r -s pw || true
  echo
  pw="$(printf '%s' "$pw" | tr -d '[:space:]')"
fi
if ! [[ "$pw" =~ ^[a-zA-Z]{16}$ ]]; then echo "That is not a 16-letter Gmail app password. Nothing saved."; exit 1; fi
tmp="$(mktemp)"
grep -v '^BAFL_GMAIL_APP_PASSWORD=' "$env_file" > "$tmp" || true
printf 'BAFL_GMAIL_APP_PASSWORD=%s\n' "$pw" >> "$tmp"
cat "$tmp" > "$env_file" && rm -f "$tmp"
echo "Saved the Gmail app password to web/.env.local (not printed)."

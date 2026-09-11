#!/usr/bin/env bash
# Pushes supabase/config.toml auth settings (OTP sign-in, Resend SMTP) to the linked project.
# Loads only the Resend key so the CLI keeps using your own Supabase login.
set -euo pipefail
cd "$(dirname "$0")/.."
export BAFL_RESEND_API_KEY="$(grep '^export BAFL_RESEND_API_KEY=' "$HOME/.secrets" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[ -n "$BAFL_RESEND_API_KEY" ] || { echo "BAFL_RESEND_API_KEY not found in ~/.secrets"; exit 1; }
unset SUPABASE_ACCESS_TOKEN
supabase config push

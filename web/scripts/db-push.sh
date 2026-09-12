#!/usr/bin/env bash
# Apply pending supabase/migrations to the linked project. Safe to re-run; already-applied migrations are skipped.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase db push --yes

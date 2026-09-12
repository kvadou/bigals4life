#!/usr/bin/env bash
# Delete the pre-bowl test scorebook Claude created on 2026-09-12 (Pete "300", week 2).
# Fixed id, so re-running is a no-op. Reads keys from web/.env.local; never prints them.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a
ID="dd4f55db-c016-4a56-832d-77bf96618ac2"
H=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: return=minimal")
for t in scorebook_invites scorebook_members scorebook_revisions; do curl -sf "${H[@]}" -X DELETE "$SUPABASE_URL/rest/v1/$t?scorebook_id=eq.$ID" >/dev/null; done
curl -sf "${H[@]}" -X DELETE "$SUPABASE_URL/rest/v1/scorebooks?id=eq.$ID" >/dev/null
echo "test night $ID removed"

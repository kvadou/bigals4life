#!/usr/bin/env bash
# Adds the Postmark sending records for bigals4life.com to Vercel DNS. Idempotent: skips records that already exist.
set -euo pipefail
domain=bigals4life.com
dkim_host=20260911050511pm._domainkey
dkim_value='k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCEd5HXwmK3WmTx+gnbCZ7V9WlnMLo3U8oYQ1RJAlrRLiJGB3QxgoMHCmVXf0h8pilsPzDN3Cylr+wNWLQoltAtzv/FFv/Z2cm+0tUVtlheEtPxgwj6U84g7aydfZSg/y4JcqEc24j4X1jzAYROO5UdhrvTNMuHzNzCCv+iGw+GnwIDAQAB'
existing="$(vercel dns ls "$domain" 2>/dev/null || true)"
if grep -q "$dkim_host" <<<"$existing"; then echo "DKIM TXT already present"; else vercel dns add "$domain" "$dkim_host" TXT "$dkim_value"; fi
if grep -q "pm-bounces" <<<"$existing"; then echo "Return-Path CNAME already present"; else vercel dns add "$domain" pm-bounces CNAME pm.mtasv.net; fi
echo "--- records now:"; vercel dns ls "$domain" 2>&1 | grep -E "_domainkey|pm-bounces" || true

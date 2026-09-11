#!/usr/bin/env bash
# Installs (or reinstalls) the hourly Gmail ingest job. Idempotent.
set -euo pipefail
label=com.dpk.bafl-gmail-ingest
src="$HOME/BAFL/web/scripts/$label.plist"
dst="$HOME/Library/LaunchAgents/$label.plist"
launchctl unload -w "$dst" 2>/dev/null || true
cp "$src" "$dst"
plutil -lint "$dst"
launchctl load -w "$dst"
launchctl start "$label"
sleep 3
echo "--- stdout"; tail -n 3 "$HOME/.local/state/dpk.bafl-gmail-ingest.stdout.log" 2>/dev/null || true
echo "--- stderr"; tail -n 3 "$HOME/.local/state/dpk.bafl-gmail-ingest.stderr.log" 2>/dev/null || true
launchctl list | grep "$label"

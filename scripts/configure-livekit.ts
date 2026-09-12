#!/usr/bin/env bun
// Run in your terminal. Credentials are entered without echo and never printed.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const target = resolve(import.meta.dir, "../web/.env.local");
const result = spawnSync("python3", ["-c", String.raw`
import getpass, os, re, sys, tempfile
from pathlib import Path
from urllib.parse import urlparse
p = Path(sys.argv[1])
if p.is_symlink():
    raise SystemExit("Refusing a symlinked configuration file.")
s = p.read_text() if p.exists() else ""
names = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
existing = {name: bool(re.search(r"^"+name+r"=.+$", s, re.M)) for name in names}
if len(sys.argv) > 2 and sys.argv[2] == "--check":
    for name in names: print(name + (": configured" if existing[name] else ": missing"))
    raise SystemExit(0 if all(existing.values()) else 1)
if all(existing.values()):
    print("LiveKit is already configured. No changes made.")
    raise SystemExit(0)
if not sys.stdin.isatty():
    raise SystemExit("Run this script in your own interactive terminal.")
print("Paste the BA4L project values from LiveKit. Input is hidden. Nothing is sent to chat.")
values = {}
for name in names:
    value = getpass.getpass(name + ": ").strip()
    if name == "LIVEKIT_URL":
        u = urlparse(value)
        if u.scheme != "wss" or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ["", "/"]:
            raise SystemExit("Use the project's wss:// URL, without a token or path. Nothing saved.")
    elif not re.fullmatch(r"[A-Za-z0-9_-]{8,256}", value):
        raise SystemExit("Unexpected credential format. Nothing saved.")
    values[name] = value
lines = [line for line in s.splitlines() if not any(re.match(r"^(?:export\s+)?"+name+r"\s*=", line) for name in names)]
content = "\n".join(lines + [name+"="+values[name] for name in names]) + "\n"
fd, temp = tempfile.mkstemp(prefix=".livekit-config-", dir=p.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, p)
finally:
    if os.path.exists(temp): os.unlink(temp)
print("BA4L LiveKit configuration saved locally. Secret values were not printed.")
`, target, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);

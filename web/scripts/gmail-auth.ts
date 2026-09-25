// bun ~/BAFL/web/scripts/gmail-auth.ts
// One-time: authorize read-only Gmail access to dougkvamme@gmail.com, where Gary's standings PDFs land,
// for scripts/gmail-ingest.ts. Reuses the local OAuth client in ~/.gmail-mcp/gcp-oauth.keys.json but keeps
// its own token in ~/.bafl-gmail/credentials.json, so the league job never reads the Story Time Chess mailbox.
// Re-running replaces the token. Nothing secret is printed.
import { chmod, mkdir } from "node:fs/promises";

const home = process.env.HOME!;
const expected = process.env.BAFL_GMAIL_ACCOUNT ?? "dougkvamme@gmail.com";
const keys = (await Bun.file(`${home}/.gmail-mcp/gcp-oauth.keys.json`).json()).installed;
const port = 53682;
const redirect = `http://127.0.0.1:${port}/callback`;
const state = crypto.randomUUID();
const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: keys.client_id, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
  scope: "https://www.googleapis.com/auth/gmail.readonly", login_hint: expected, state,
})}`;

let resolve!: (v: string) => void, reject!: (e: unknown) => void;
const done = { promise: new Promise<string>((a, b) => { resolve = a; reject = b; }), resolve: (v: string) => resolve(v), reject: (e: unknown) => reject(e) };
const server = Bun.serve({ port, hostname: "127.0.0.1", async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname !== "/callback") return new Response("Not found", { status: 404 });
  if (u.searchParams.get("state") !== state) return new Response("State mismatch. Run the script again.", { status: 400 });
  const code = u.searchParams.get("code");
  if (!code) { done.reject(new Error(u.searchParams.get("error") ?? "No code returned")); return new Response("Authorization was not granted. You can close this tab."); }
  try {
    const token = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: keys.client_id, client_secret: keys.client_secret, redirect_uri: redirect, grant_type: "authorization_code" }) })).json();
    if (!token.refresh_token) throw new Error(`Google returned no refresh token (${token.error ?? "unknown"})`);
    const profile = await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token.access_token}` } })).json();
    if (profile.emailAddress?.toLowerCase() !== expected) throw new Error(`Signed in as ${profile.emailAddress}, expected ${expected}. Run again and pick ${expected}.`);
    await mkdir(`${home}/.bafl-gmail`, { recursive: true, mode: 0o700 });
    const path = `${home}/.bafl-gmail/credentials.json`;
    await Bun.write(path, JSON.stringify({ account: expected, refresh_token: token.refresh_token, scope: token.scope }));
    await chmod(path, 0o600);
    done.resolve(expected);
    return new Response(`BA4L can now read Gary's standings from ${expected}. You can close this tab.`);
  } catch (e) { done.reject(e); return new Response(`Failed: ${(e as Error).message}`, { status: 500 }); }
} });

console.log(`Opening Google sign-in for ${expected} (read-only Gmail). If no browser opens, paste this URL:\n\n${url}\n`);
Bun.spawn(["open", url]);
try { console.log(`Saved. Gmail ingest will read ${await done.promise}.`); }
catch (e) { console.error(`Not saved: ${(e as Error).message}`); process.exitCode = 1; }
finally { server.stop(); }

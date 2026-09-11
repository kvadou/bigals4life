// bun --env-file=.env.local scripts/gmail-ingest.ts
// Pulls Gary's standings PDFs out of Gmail (the mailbox behind ~/.gmail-mcp), saves new ones to ../league-pdfs,
// and ingests them. Already-ingested files (league_weeks.source_file) are skipped, so it is safe on a schedule.
import { database } from "../lib/scorebook-server";

const home = process.env.HOME!;
const dir = `${import.meta.dir}/../../league-pdfs`;
const query = process.env.BAFL_GMAIL_QUERY ?? '(from:thursnitemens@gmail.com OR subject:TME OR subject:Standings) has:attachment filename:pdf newer_than:60d';

const cred = await Bun.file(`${home}/.gmail-mcp/credentials.json`).json();
const keys = (await Bun.file(`${home}/.gmail-mcp/gcp-oauth.keys.json`).json()).installed;
const token = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: keys.client_id, client_secret: keys.client_secret, refresh_token: cred.refresh_token, grant_type: "refresh_token" }) })).json();
if (!token.access_token) throw new Error(`Gmail token refresh failed: ${token.error ?? "unknown"}`);
const gmail = async (path: string) => { const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token.access_token}` } }); if (!r.ok) throw new Error(`Gmail ${path.split("?")[0]} ${r.status}`); return r.json(); };

const known = new Set<string>((await database("league_weeks?select=source_file") as { source_file: string }[]).map(r => r.source_file));
const list = await gmail(`messages?q=${encodeURIComponent(query)}&maxResults=50`);
const fresh: string[] = [];
for (const { id } of (list.messages ?? []) as { id: string }[]) {
  const msg = await gmail(`messages/${id}?format=full`);
  const parts: any[] = []; const walk = (p: any) => { if (!p) return; if (p.filename && p.body?.attachmentId) parts.push(p); (p.parts ?? []).forEach(walk); }; walk(msg.payload);
  for (const p of parts.filter(p => /\.pdf$/i.test(p.filename))) {
    const name = `${id}__${p.filename.replace(/[^\w .'-]+/g, "_")}`;
    if (known.has(name)) continue;
    const path = `${dir}/${name}`;
    if (!await Bun.file(path).exists()) {
      const att = await gmail(`messages/${id}/attachments/${p.body.attachmentId}`);
      await Bun.write(path, Buffer.from(att.data.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    }
    fresh.push(path);
  }
}
if (!fresh.length) { console.log(`${new Date().toISOString()} nothing new (${list.resultSizeEstimate ?? 0} matching messages)`); process.exit(0); }
const proc = Bun.spawn(["bun", "--env-file=.env.local", `${import.meta.dir}/ingest-standings.ts`, ...fresh.sort()], { cwd: `${import.meta.dir}/..`, stdout: "inherit", stderr: "inherit", env: process.env });
process.exit(await proc.exited);

// bun --env-file=.env.local scripts/gmail-ingest.ts
// Pulls Gary's standings PDFs out of dougkvamme@gmail.com over IMAP, saves new ones to ../league-pdfs,
// and ingests them. Already-ingested files (league_weeks.source_file) are skipped, so it is safe on a schedule.
// Auth: a Gmail app password in BAFL_GMAIL_APP_PASSWORD (web/.env.local). The Google Cloud client behind
// ~/.gmail-mcp is the Story Time Chess GAM app, which Google restricts to that organization, so it cannot read personal Gmail.
import { ImapFlow } from "imapflow";
import { database } from "../lib/scorebook-server";

const dir = `${import.meta.dir}/../../league-pdfs`;
const user = process.env.BAFL_GMAIL_USER ?? "dougkvamme@gmail.com";
const pass = process.env.BAFL_GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
const query = process.env.BAFL_GMAIL_QUERY ?? "(from:thursnitemens@gmail.com OR subject:TME OR subject:Standings) has:attachment filename:pdf newer_than:21d";
const stamp = () => new Date().toISOString();
if (!pass) { console.error(`${stamp()} BAFL_GMAIL_APP_PASSWORD is not set in web/.env.local (a Gmail app password for ${user}).`); process.exit(1); }

type Part = { part?: string; type?: string; disposition?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: Part[] };
const pdfParts = (node: Part | undefined, out: { part: string; filename: string }[] = []) => {
  if (!node) return out;
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
  if (node.part && filename && /\.pdf$/i.test(filename)) out.push({ part: node.part, filename });
  for (const child of node.childNodes ?? []) pdfParts(child, out);
  return out;
};

const known = new Set<string>((await database("league_weeks?select=source_file") as { source_file: string }[]).map(r => r.source_file));
const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
await client.connect();
const fresh: string[] = [];
let matched = 0;
const allMail = (await client.list()).find(b => b.specialUse === "\\All")?.path ?? "INBOX"; // "[Gmail]/All Mail", whatever the account language
const lock = await client.getMailboxLock(allMail);
try {
  const uids = (await client.search({ gmraw: query }, { uid: true })) || [];
  matched = uids.length;
  for (const uid of uids) {
    const msg = await client.fetchOne(String(uid), { bodyStructure: true }, { uid: true });
    if (!msg) continue;
    // Same id shape as the old Gmail API names (hex message id), so earlier downloads still match.
    const id = msg.emailId ? BigInt(msg.emailId).toString(16) : `uid${uid}`;
    for (const p of pdfParts(msg.bodyStructure as Part)) {
      const name = `${id}__${p.filename.replace(/[^\w .'-]+/g, "_")}`;
      if (known.has(name) || known.has(p.filename)) continue; // already ingested, from Gmail or a manual upload
      const path = `${dir}/${name}`;
      if (!await Bun.file(path).exists()) {
        const { content } = await client.download(String(uid), p.part, { uid: true });
        const chunks: Buffer[] = []; for await (const c of content) chunks.push(c as Buffer);
        await Bun.write(path, Buffer.concat(chunks));
      }
      fresh.push(path);
    }
  }
} finally { lock.release(); await client.logout(); }

if (!fresh.length) { console.log(`${stamp()} nothing new (${matched} matching messages in ${user})`); process.exit(0); }
const proc = Bun.spawn(["bun", "--env-file=.env.local", `${import.meta.dir}/ingest-standings.ts`, ...fresh.sort()], { cwd: `${import.meta.dir}/..`, stdout: "inherit", stderr: "inherit", env: process.env });
process.exit(await proc.exited);

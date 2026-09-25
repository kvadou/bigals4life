// bun --env-file=.env.local scripts/gmail-ingest.ts [--test-forward]
// Pulls Gary's standings PDFs out of dougkvamme@gmail.com over IMAP, saves new ones to ../league-pdfs, ingests them,
// then forwards Gary's email (with the PDF) to the team, the way Doug used to by hand.
// Already-ingested files (league_weeks.source_file) are skipped, so it is safe on a schedule.
// Auth: a Gmail app password in BAFL_GMAIL_APP_PASSWORD (web/.env.local; scripts/set-gmail-password.sh), used for IMAP and SMTP.
// The Google Cloud client behind ~/.gmail-mcp is the Story Time Chess GAM app, which Google restricts to that organization.
//
// Forwarding rules: only Gary's emails (never Doug's own "Fwd:"), only when this run ingested a new sheet from them,
// only if sent in the last 4 days, and never twice: forwarded emails get the Gmail label BA4L/Forwarded.
// Recipients: BAFL_FORWARD_TO (comma-separated) in web/.env.local. --test-forward sends the newest Gary email to Doug only, unlabeled.
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { database } from "../lib/scorebook-server";

const dir = `${import.meta.dir}/../../league-pdfs`;
const user = process.env.BAFL_GMAIL_USER ?? "dougkvamme@gmail.com";
const pass = process.env.BAFL_GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
const query = process.env.BAFL_GMAIL_QUERY ?? "(from:thursnitemens@gmail.com OR subject:TME OR subject:Standings) has:attachment filename:pdf newer_than:21d";
const forwardTo = (process.env.BAFL_FORWARD_TO ?? "").split(",").map(s => s.trim()).filter(Boolean);
const LABEL = "BA4L/Forwarded";
const testForward = process.argv.includes("--test-forward");
const stamp = () => new Date().toISOString();
if (!pass) { console.error(`${stamp()} BAFL_GMAIL_APP_PASSWORD is not set in web/.env.local (a Gmail app password for ${user}).`); process.exit(1); }

type Part = { part?: string; type?: string; disposition?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: Part[] };
const walk = (node: Part | undefined, out: Part[] = []) => { if (!node) return out; out.push(node); for (const c of node.childNodes ?? []) walk(c, out); return out; };
const filenameOf = (p: Part) => p.dispositionParameters?.filename ?? p.parameters?.name;
const pdfParts = (root: Part | undefined) => walk(root).flatMap(p => { const f = filenameOf(p); return p.part && f && /\.pdf$/i.test(f) ? [{ part: p.part, filename: f }] : []; });

type Found = { uid: number; from: string; fromName: string; subject: string; date: Date; labels: Set<string>; bodyPart: string | null; pdfs: { part: string; filename: string; path: string; fresh: boolean }[] };

const imap = () => new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
const read = async (client: ImapFlow, uid: number, part: string) => {
  const { content } = await client.download(String(uid), part, { uid: true });
  const chunks: Buffer[] = []; for await (const c of content) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

// A sheet counts as ingested by its attachment name too, whichever email (Gary often sends twice) or manual upload it came from.
const known = new Set<string>((await database("league_weeks?select=source_file") as { source_file: string }[]).flatMap(r => [r.source_file, r.source_file.replace(/^[0-9a-f]+__/, "")]));

const found: Found[] = [];
let client = imap();
await client.connect();
const allMail = (await client.list()).find(b => b.specialUse === "\\All")?.path ?? "INBOX"; // "[Gmail]/All Mail", whatever the account language
let lock = await client.getMailboxLock(allMail);
try {
  const uids = (await client.search({ gmraw: query }, { uid: true })) || [];
  for (const uid of uids) {
    const msg = await client.fetchOne(String(uid), { bodyStructure: true, envelope: true, labels: true, internalDate: true }, { uid: true });
    if (!msg) continue;
    const sender = msg.envelope?.from?.[0];
    const entry: Found = { uid, from: (sender?.address ?? "").toLowerCase(), fromName: sender?.name ?? sender?.address ?? "", subject: msg.envelope?.subject ?? "", date: new Date(msg.internalDate ?? msg.envelope?.date ?? 0), labels: new Set([...(msg.labels ?? [])].map(String)), bodyPart: walk(msg.bodyStructure as Part).find(p => p.type === "text/plain" && !filenameOf(p))?.part ?? null, pdfs: [] };
    // Same id shape as the old Gmail API names (hex message id), so earlier downloads still match.
    const id = msg.emailId ? BigInt(msg.emailId).toString(16) : `uid${uid}`;
    for (const p of pdfParts(msg.bodyStructure as Part)) {
      const name = `${id}__${p.filename.replace(/[^\w .'-]+/g, "_")}`;
      const path = `${dir}/${name}`;
      const fresh = !known.has(name) && !known.has(p.filename);
      if (fresh || testForward) { if (!await Bun.file(path).exists()) await Bun.write(path, await read(client, uid, p.part)); known.add(p.filename); }
      entry.pdfs.push({ ...p, path, fresh });
    }
    found.push(entry);
  }
} finally { lock.release(); await client.logout(); }

const fromGary = (f: Found) => f.from !== user.toLowerCase() && !/^(re|fwd?):/i.test(f.subject.trim());
const freshPaths = found.flatMap(f => f.pdfs.filter(p => p.fresh).map(p => p.path));

if (freshPaths.length && !testForward) {
  const proc = Bun.spawn(["bun", "--env-file=.env.local", `${import.meta.dir}/ingest-standings.ts`, ...freshPaths.sort()], { cwd: `${import.meta.dir}/..`, stdout: "inherit", stderr: "inherit", env: process.env });
  const code = await proc.exited;
  if (code) process.exit(code); // never forward a sheet that failed to ingest
}

const recent = (f: Found) => Date.now() - f.date.getTime() < 4 * 86_400_000;
const toForward = testForward
  ? found.filter(fromGary).sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 1)
  : found.filter(f => fromGary(f) && recent(f) && f.pdfs.some(p => p.fresh) && !f.labels.has(LABEL));
const recipients = testForward ? [user] : forwardTo;
if (!toForward.length || !recipients.length) {
  if (!recipients.length && toForward.length) console.log(`${stamp()} BAFL_FORWARD_TO is empty; not forwarding ${toForward.length} email(s).`);
  if (!freshPaths.length) console.log(`${stamp()} nothing new (${found.length} matching messages in ${user})`);
  process.exit(0);
}

const smtp = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
client = imap();
await client.connect();
lock = await client.getMailboxLock(allMail);
try {
  for (const f of toForward) {
    const body = f.bodyPart ? (await read(client, f.uid, f.bodyPart)).toString("utf8").trim() : "";
    const when = f.date.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const text = `${body ? "" : "Here are this week's standings from Gary.\n\n"}---------- Forwarded message ---------\nFrom: ${f.fromName} <${f.from}>\nDate: ${when}\nSubject: ${f.subject}\n\n${body}\n\nScores, points and next week's matchup: https://bigals4life.com\n`;
    const attachments = await Promise.all(f.pdfs.map(async p => ({ filename: p.filename, content: await Bun.file(p.path).exists() ? Buffer.from(await Bun.file(p.path).arrayBuffer()) : await read(client, f.uid, p.part), contentType: "application/pdf" })));
    await smtp.sendMail({ from: `Doug Kvamme <${user}>`, to: recipients, subject: `Fwd: ${f.subject}`, text, attachments });
    if (!testForward) await client.messageFlagsAdd(String(f.uid), [LABEL], { uid: true, useLabels: true });
    console.log(`${stamp()} forwarded "${f.subject}" to ${recipients.length} ${testForward ? "(test, Doug only)" : "teammate(s)"}`);
  }
} finally { lock.release(); await client.logout(); }

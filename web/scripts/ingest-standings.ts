// bun scripts/ingest-standings.ts <standings.pdf ...>   Idempotent: re-running a week upserts it.
// Shares lib/league/ingest with the admin upload so both paths sync official handicaps into saved matches.
import { basename } from "node:path";
import { ingestStandingsText } from "../lib/league/ingest";

const files = process.argv.slice(2);
if (!files.length) { console.error("Usage: bun scripts/ingest-standings.ts <pdf...>"); process.exit(1); }

for (const file of files) {
  const proc = Bun.spawn(["pdftotext", "-layout", file, "-"], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  if (await proc.exited) { console.error(`${basename(file)}: pdftotext failed`); continue; }
  try {
    const s = await ingestStandingsText(text, file);
    const us = s.ours ? `, Big Al's ${s.ours.place}${["st", "nd", "rd"][s.ours.place - 1] ?? "th"} (${s.ours.pointsWon}-${s.ours.pointsLost})` : "";
    const warn = s.warnings.length ? `, ${s.warnings.length} warning(s): ${s.warnings.join("; ")}` : "";
    console.log(`${basename(file)}: ${s.season} week ${s.week}/${s.weeksTotal}, ${s.teams} teams, ${s.bowlers} bowlers${us}${warn}, reconciled ${s.reconciled} night(s)${s.recapWritten ? ", recap written" : ""}`);
  } catch (e) { console.error(`${basename(file)}: ${(e as Error).message}`); }
}

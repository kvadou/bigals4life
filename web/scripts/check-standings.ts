// bun scripts/check-standings.ts <pdf...>   Parse-only sweep: no database writes. Prints one line per file.
import { basename } from "node:path";
import { parseStandings } from "../lib/league/bls-parse";

const rows: string[] = [];
for (const file of process.argv.slice(2)) {
  const proc = Bun.spawn(["pdftotext", "-layout", file, "-"], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  if (await proc.exited) { rows.push(`FAIL pdftotext  ${basename(file)}`); continue; }
  try {
    const w = parseStandings(text);
    const us = w.teams.find(t => /BIG AL/.test(t.name));
    const r = us && w.results.find(x => x.number === us.number);
    const sums = w.results.reduce((s, x) => s + x.pointsWon, 0);
    rows.push(`ok   ${w.season} wk${String(w.week).padStart(2)}/${w.weeksTotal} ${w.date} teams=${w.teams.length} bowlers=${w.rosters.reduce((s, x) => s + x.bowlers.length, 0)} pts=${sums} us=${us ? `${us.place}(${us.pointsWon}) lw=${r?.pointsWon ?? "-"}` : "none"}${w.warnings.length ? ` WARN ${w.warnings.join("; ")}` : ""}  ${basename(file)}`);
  } catch (e) { rows.push(`FAIL ${(e as Error).message}  ${basename(file)}`); }
}
console.log(rows.sort().join("\n"));

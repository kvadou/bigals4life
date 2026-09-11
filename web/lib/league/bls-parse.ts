import type { RosterBowler, StandingsWeek, TeamStanding, TeamWeekResult } from "./types";

// Parses `pdftotext -layout` output of a BLS-2013 league standings sheet.
const num = (s: string) => { const m = s.match(/^(\d+)?(½)?$/); if (!m) return Number(s); return Number(m[1] ?? 0) + (m[2] ? 0.5 : 0); };
const isNum = (s: string) => /^\d+(?:½|\.\d+)?$/.test(s) || s === "½";
const tokens = (line: string) => line.trim().split(/\s+/).filter(Boolean);
const section = (lines: string[], start: RegExp, end: RegExp) => {
  const i = lines.findIndex(l => start.test(l)); if (i < 0) return [];
  const rest = lines.slice(i + 1); const j = rest.findIndex(l => end.test(l));
  return j < 0 ? rest : rest.slice(0, j);
};

export function parseStandings(text: string): StandingsWeek {
  const lines = text.split("\n");
  const warnings: string[] = [];
  const head = lines.find(l => /Week \d+ of \d+/.test(l)) ?? "";
  const h = head.match(/(\d\d)\/(\d\d)\/(\d{4})\s+Week (\d+) of (\d+)\s+(.+?)\s+Page/);
  if (!h) throw new Error("Not a BLS standings sheet: header missing.");
  const date = `${h[3]}-${h[1]}-${h[2]}`;
  const house = (lines.find(l => /Thursday\s+\d/.test(l))?.replace(/^.*?M\s+/, "").replace(/\s+Lanes.*$/, "").trim()) ?? "";

  const teams: TeamStanding[] = section(lines, /Top \d+ Teams/, /Review of Last Week/)
    .filter(l => /^\s*\d+\s+\d+\s+\S/.test(l)).map(l => {
      const t = tokens(l); const place = Number(t[0]), number = Number(t[1]);
      let i = 2; while (i < t.length && !/^\d+\.\d$/.test(t[i])) i++;
      const name = t.slice(2, i).join(" "); const n = t.slice(i);
      // %won won lost [unearned] ytd% ytdWon ytdLost gamesWon scratch pinsHdcp
      const unearned = n.length === 10 ? num(n[3]) : null; const o = n.length === 10 ? 1 : 0;
      return { place, number, name, percentWon: Number(n[0]), pointsWon: num(n[1]), pointsLost: num(n[2]), unearnedPoints: unearned,
        ytdPercentWon: Number(n[3 + o]), ytdWon: num(n[4 + o]), ytdLost: num(n[5 + o]), gamesWon: Number(n[6 + o]), scratchPins: Number(n[7 + o]), pinsPlusHdcp: Number(n[8 + o]) };
    });
  const fullName = (short: string) => teams.find(t => t.name === short || t.name.startsWith(short.replace(/\s+$/, "")))?.name ?? short;
  const numberOf = (name: string) => teams.find(t => t.name === fullName(name))?.number ?? 0;

  const results: TeamWeekResult[] = [];
  for (const l of section(lines, /Review of Last Week/, /Lane Assignments/)) {
    if (!l.includes("<--->")) continue;
    const [left, right] = l.split("<--->").map(tokens);
    const side = (t: string[], lanes: string) => {
      const name = fullName(t.slice(0, t.length - 5).join(" ")); const n = t.slice(-5);
      return { lanes, number: numberOf(name), name, opponentNumber: 0, hdcpGames: [Number(n[0]), Number(n[1]), Number(n[2])] as [number, number, number], hdcpTotal: Number(n[3]), pointsWon: num(n[4]) };
    };
    const a = side(left.slice(1), left[0]); const b = side(right, left[0]);
    a.opponentNumber = b.number; b.opponentNumber = a.number;
    if (a.hdcpGames.reduce((s, v) => s + v, 0) !== a.hdcpTotal || b.hdcpGames.reduce((s, v) => s + v, 0) !== b.hdcpTotal) warnings.push(`Lane ${a.lanes}: handicap games do not sum to total.`);
    results.push(a, b);
  }

  const matchPoints: { name: string; points: number }[] = [];
  for (const l of section(lines, /High Individual Match Points/, /Last Week's Top Scores/)) {
    for (const m of l.matchAll(/(\d+(?:\.5)?)\s+([A-Z][A-Z .'-]*?)(?=\s{2,}|\s*$)/g)) matchPoints.push({ points: Number(m[1]), name: m[2].trim() });
  }

  const rosters: StandingsWeek["rosters"] = [];
  const rosterStart = lines.findIndex(l => /Team Rosters/.test(l));
  for (const l of rosterStart < 0 ? [] : lines.slice(rosterStart + 1)) {
    const team = l.match(/^\s*(\d+) - (.+?) Lane (\d+)\s*$/);
    if (team) { rosters.push({ number: Number(team[1]), name: team[2].trim(), lane: Number(team[3]), bowlers: [] }); continue; }
    const current = rosters.at(-1); if (!current) continue;
    const t = tokens(l); if (t.length < 9 || !/^\d+$/.test(t[0]) || !/^[LR]$/.test(t[1])) continue;
    let i = 2; while (i < t.length && !isNum(t[i])) i++;
    const name = t.slice(2, i).join(" "); const n = t.slice(i).map(Number);
    const [average, handicap, pins, games, toRaise, toDrop, ...rest] = n;
    const b: RosterBowler = { blsId: Number(t[0]), hand: t[1] as "L" | "R", name, teamNumber: current.number, average, handicap, pins, games, toRaise, toDrop, scratchGames: null, scratchTotal: null, hdcpTotal: null };
    if (rest.length === 5) {
      const hdcpTotal = rest[4]; const four = rest.slice(0, 4);
      const totalIndex = four.findIndex((v, k) => v === four.filter((_, j) => j !== k).reduce((s, x) => s + x, 0));
      if (totalIndex >= 0) { b.scratchTotal = four[totalIndex]; b.scratchGames = four.filter((_, j) => j !== totalIndex) as [number, number, number]; b.hdcpTotal = hdcpTotal; }
      else { b.warning = `Could not separate games from total: ${rest.join(" ")}`; warnings.push(`${name}: ${b.warning}`); b.hdcpTotal = hdcpTotal; }
    } else if (rest.length && rest.some(v => v !== 0)) { b.warning = `Unexpected game columns: ${rest.join(" ")}`; warnings.push(`${name}: ${b.warning}`); }
    current.bowlers.push(b);
  }

  return { season: h[6].trim(), date, week: Number(h[4]), weeksTotal: Number(h[5]), house, teams, results, rosters, matchPoints, warnings };
}

/** "GARY D. DORUMSGAARD" -> "GARY DORUMSGAARD"; used to join match-point rows (which may be truncated) to roster names. */
export const displayName = (rosterName: string) => rosterName.replace(/\s+[A-Z]\.\s+/g, " ").replace(/\s+/g, " ").trim();
export function matchRosterName(short: string, rosterNames: string[]): string | null {
  const s = short.replace(/\s+/g, " ").trim();
  const hits = rosterNames.filter(n => { const d = displayName(n); return d === s || d.startsWith(s); });
  return hits.length === 1 ? hits[0] : null;
}

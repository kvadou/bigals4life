import type { NextMatchup, RosterBowler, StandingsWeek, TeamStanding, TeamWeekResult } from "./types";

// Parses `pdftotext -layout` output of a BLS-2013 league standings sheet.
// Columns are recognised by token shape (decimals are percentages, ½ marks points, a107 is an absent score,
// bk127 is a book average) rather than by character position, because the layout shifts between seasons.
const num = (s: string) => { const m = s.match(/^(\d+)?(½)?$/); if (!m) return Number(s); return Number(m[1] ?? 0) + (m[2] ? 0.5 : 0); };
const isNum = (s: string) => /^(?:a|bk)?\d+(?:½|\.\d+)?$/.test(s) || s === "½";
const isPct = (s: string) => /^\d+\.\d$/.test(s);
const tokens = (line: string) => line.trim().split(/\s+/).filter(Boolean);
const numericFrom = (t: string[], from: number) => { let i = t.length; while (i > from && isNum(t[i - 1])) i--; return i; }; // first index where the rest is all numeric
const section = (lines: string[], start: RegExp, end: RegExp) => {
  const i = lines.findIndex(l => start.test(l)); if (i < 0) return [];
  const rest = lines.slice(i + 1); const j = rest.findIndex(l => end.test(l));
  return j < 0 ? rest : rest.slice(0, j);
};

function teamRow(l: string, warnings: string[]): TeamStanding | null {
  const t = tokens(l); if (t.length < 8 || !/^\d+$/.test(t[0]) || !/^\d+$/.test(t[1])) return null;
  const place = Number(t[0]), number = Number(t[1]);
  const i = numericFrom(t, 2);
  const name = t.slice(2, i).join(" "); const n = t.slice(i);
  const pcts = n.map((v, k) => isPct(v) ? k : -1).filter(k => k >= 0);
  const row: TeamStanding = { place, number, name, percentWon: 0, pointsWon: 0, pointsLost: 0, unearnedPoints: null, ytdPercentWon: 0, ytdWon: 0, ytdLost: 0, gamesWon: 0, scratchPins: 0, pinsPlusHdcp: 0 };
  let ytdAt: number;
  if (pcts.length === 2) { row.percentWon = Number(n[pcts[0]]); ytdAt = pcts[1]; }
  else if (pcts.length === 1 && pcts[0] === 0) { row.percentWon = Number(n[0]); ytdAt = -1; }
  else if (pcts.length === 1) { ytdAt = pcts[0]; }
  else { warnings.push(`${name}: cannot read standings row`); return null; }
  const mid = n.slice(pcts.length === 2 || ytdAt === -1 ? 1 : 0, ytdAt === -1 ? undefined : ytdAt);
  if (ytdAt === -1) { warnings.push(`${name}: no year-to-date columns`); return null; }
  row.pointsWon = num(mid[0]); row.pointsLost = num(mid[1]); row.unearnedPoints = mid[2] == null ? null : num(mid[2]);
  row.ytdPercentWon = Number(n[ytdAt]);
  const tail = n.slice(ytdAt + 1); // ytdWon ytdLost [gamesWon] scratchPins pinsPlusHdcp
  row.ytdWon = num(tail[0]); row.ytdLost = num(tail[1]);
  row.pinsPlusHdcp = Number(tail[tail.length - 1]); row.scratchPins = Number(tail[tail.length - 2]);
  row.gamesWon = tail.length >= 5 ? Number(tail[2]) : 0;
  return row;
}

function rosterRow(l: string, teamNumber: number, warnings: string[]): RosterBowler | null {
  const t = tokens(l); if (t.length < 8 || !/^\d+$/.test(t[0])) return null;
  let i = 1; let hand: "L" | "R" | null = null;
  if (/^[LR]$/.test(t[i])) { hand = t[i] as "L" | "R"; i++; }
  const start = i; i = numericFrom(t, start);
  const name = t.slice(start, i).join(" "); if (!name || t.length - i < 6) return null;
  const n = t.slice(i);
  const bookAverage = /^bk/.test(n[0]);
  const [average, handicap, pins, games, toRaise, toDrop] = n.slice(0, 6).map(v => Number(v.replace(/^bk/, "")));
  const rest = n.slice(6);
  const absent = rest.some(v => /^a\d/.test(v));
  const values = rest.map(v => Number(v.replace(/^a/, "")));
  const b: RosterBowler = { blsId: Number(t[0]), hand: hand ?? "R", name, teamNumber, average, handicap, pins, games, toRaise, toDrop, scratchGames: null, scratchTotal: null, hdcpTotal: null };
  if (bookAverage) b.warning = "book average";
  if (absent) { b.absent = true; b.hdcpTotal = values.at(-1) ?? null; b.scratchTotal = values.at(-2) ?? null; }
  else if (values.length === 5) {
    const hdcpTotal = values[4]; const four = values.slice(0, 4);
    const totalIndex = four.findIndex((v, k) => v === four.filter((_, j) => j !== k).reduce((s, x) => s + x, 0));
    if (totalIndex >= 0) { b.scratchTotal = four[totalIndex]; b.scratchGames = four.filter((_, j) => j !== totalIndex) as [number, number, number]; b.hdcpTotal = hdcpTotal; }
    else { b.warning = `Could not separate games from total: ${rest.join(" ")}`; warnings.push(`${name}: ${b.warning}`); b.hdcpTotal = hdcpTotal; }
  } else if (values.length === 4) { // two games bowled: g1 g2 total hdcpTotal
    b.hdcpTotal = values[3]; b.scratchTotal = values[2]; b.warning = "two games only";
  } else if (values.length && values.some(v => v !== 0)) { b.warning = `Unexpected game columns: ${rest.join(" ")}`; warnings.push(`${name}: ${b.warning}`); }
  return b;
}

export function parseStandings(text: string): StandingsWeek {
  const lines = text.split("\n");
  const warnings: string[] = [];
  const head = lines.find(l => /Week \d+ of \d+/.test(l)) ?? "";
  const h = head.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+Week (\d+) of (\d+)\s+(.+?)\s+Page/);
  if (!h) throw new Error("Not a BLS standings sheet: header missing.");
  const date = `${h[3]}-${h[1].padStart(2, "0")}-${h[2].padStart(2, "0")}`;
  const house = (lines.find(l => /^Thursday\s+\d/i.test(l))?.replace(/^.*?M\s+/i, "").replace(/\s+Lanes.*$/, "").trim()) ?? "";

  const teams = section(lines, /Top \d+ Teams/, /Review of Last Week/).map(l => teamRow(l, warnings)).filter((t): t is TeamStanding => !!t);
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
    for (const m of l.matchAll(/(\d+(?:\.5)?)\s+([A-Z][A-Za-z .'-]*?)(?=\s{2,}|\s*$)/g)) matchPoints.push({ points: Number(m[1]), name: m[2].trim() });
  }

  const rosters: StandingsWeek["rosters"] = [];
  const rosterStart = lines.findIndex(l => /Team Rosters/.test(l));
  for (const l of rosterStart < 0 ? [] : lines.slice(rosterStart + 1)) {
    const team = l.match(/^\s*(\d+) - (.+?) Lane (\d+)\s*$/);
    if (team) { rosters.push({ number: Number(team[1]), name: team[2].trim(), lane: Number(team[3]), bowlers: [] }); continue; }
    const current = rosters.at(-1); if (!current) continue;
    const b = rosterRow(l, current.number, warnings); if (b) current.bowlers.push(b);
  }

  return { season: h[6].trim(), date, week: Number(h[4]), weeksTotal: Number(h[5]), house, teams, results, rosters, matchPoints, nextMatchups: nextMatchups(rosters, warnings), warnings };
}

/** Each roster header carries next week's lane. The team on the odd lane n bowls the team on lane n+1. */
export function nextMatchups(rosters: { number: number; lane: number }[], warnings: string[] = []): NextMatchup[] {
  const byLane = new Map(rosters.filter(r => r.lane > 0).map(r => [r.lane, r.number]));
  const out: NextMatchup[] = [];
  for (const [lane, odd] of [...byLane].sort((a, b) => a[0] - b[0])) {
    if (lane % 2 === 0) continue;
    const even = byLane.get(lane + 1);
    if (even == null) { warnings.push(`Lane ${lane}: no team on lane ${lane + 1} next week.`); continue; }
    out.push({ lanes: `${lane}-${lane + 1}`, odd, even });
  }
  return out;
}

/** The handicap a bowler actually bowled with that week. The sheet's Hdcp column is already recalculated from the new average (next week's), so derive it from the totals. */
export function usedHandicap(b: { handicap: number; scratchGames: unknown[] | null; scratchTotal: number | null; hdcpTotal: number | null }) {
  if (!b.scratchGames?.length || b.scratchTotal == null || b.hdcpTotal == null) return b.handicap;
  const h = (b.hdcpTotal - b.scratchTotal) / b.scratchGames.length;
  return Number.isInteger(h) && h >= 0 ? h : b.handicap;
}

/** "GARY D. DORUMSGAARD" -> "GARY DORUMSGAARD"; used to join match-point rows (which may be truncated) to roster names. */
export const displayName = (rosterName: string) => rosterName.replace(/\s+[A-Z]\.\s+/g, " ").replace(/\s+/g, " ").trim();
export function matchRosterName(short: string, rosterNames: string[]): string | null {
  const s = short.replace(/\s+/g, " ").trim().toUpperCase();
  const hits = [...new Set(rosterNames)].filter(n => { const d = displayName(n).toUpperCase(); return d === s || d.startsWith(s); });
  return hits.length === 1 ? hits[0] : null;
}

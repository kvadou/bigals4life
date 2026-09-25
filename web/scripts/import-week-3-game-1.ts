// bun --env-file=.env.local scripts/import-week-3-game-1.ts [--dry-run]
// Week 3 (2026-09-24) vs BALLS DEEP, game 1, read frame by frame from the two lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Idempotent: writes only while the night still has no game 1, with the same compare-and-swap on revision as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "e5447bb1-69f6-4d6f-a227-a4bdd0caef27";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete (roster order, which is also the order on the TV and the lineup handed in).
const rolls = [
  [10, 1, 9, 8, 1, 9, 0, 5, 0, 9, 0, 6, 3, 8, 1, 10, 7, 0],
  [6, 4, 6, 0, 8, 0, 1, 7, 9, 0, 0, 3, 0, 8, 5, 0, 10, 7, 3, 9],
  [9, 0, 7, 1, 9, 1, 6, 3, 9, 1, 7, 3, 6, 1, 10, 6, 4, 10, 7, 3],
  [8, 1, 9, 1, 7, 3, 10, 9, 1, 10, 10, 10, 10, 7, 3, 9],
];
const tvScratch = [112, 102, 142, 212]; // TV frame-10 totals; TOT column 165/171/196/237 adds 53/69/54/25
// Their lineup in TV (head-to-head) order with the handicaps on the TV (Hdcp total 210) and Gary's Week 2 sheet.
const theirs = [
  { name: "MICHAEL LOBITZ", handicap: 71, game1: 129 },
  { name: "SIMON NASSER", handicap: 62, game1: 167 },
  { name: "ZACH SIEMERS", handicap: 52, game1: 175 },
  { name: "SHAWN TROMBLEY", handicap: 25, game1: 157 },
];

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-1 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 568 || theirs.reduce((a, b) => a + b.game1, 0) !== 628 || theirs.reduce((a, b) => a + b.handicap, 0) !== 210) throw new Error("Team totals drifted from the TV (568 / 628 / hdcp 210)");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (current.history.some(h => h.game === 1) || current.rolls.some(r => r.length) || current.finals?.some(f => f != null)) {
  console.log(`Game 1 is already in this night (revision ${row.revision}, game ${current.game}); nothing written.`);
  process.exit(0);
}
if (!current.match || current.match.week !== 3 || current.match.opponent.number !== 3) throw new Error("This is not the Week 3 Balls Deep night");

const next = nightSchema.parse({
  ...current,
  game: 2,
  rolls: [[], [], [], []],
  history: [{ game: 1, rolls }],
  match: {
    ...current.match,
    opponent: { ...current.match.opponent, bowlers: theirs.map(({ name, handicap }) => ({ name, handicap })) },
    opponentGames: [theirs.map(b => b.game1)],
  },
});

const ours = current.match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: [scores[i]] }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "BALLS DEEP", bowlers: theirs.map(b => ({ name: b.name, handicap: b.handicap, games: [b.game1] })) });
console.log("game 1 handicap", `us ${ours.reduce((a, b) => a + b.games[0] + b.handicap, 0)} vs them ${theirs.reduce((a, b) => a + b.game1 + b.handicap, 0)}`);
console.log("head to head", ours.map((b, i) => `${b.name} ${b.games[0] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].game1 + theirs[i].handicap}`).join(" · "));
console.log("points so far", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 1; the night is now on game 2 (revision ${written[0].revision}).`);

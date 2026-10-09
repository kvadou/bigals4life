// bun --env-file=.env.local scripts/import-week-5-game-1.ts [--dry-run]
// Week 5 (2026-10-08) vs HERE 4 BEER on lanes 1-2, game 1, read frame by frame from the two lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Idempotent: writes only while the night still has no game 1, with the same compare-and-swap on revision as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "7aa952b6-9f42-4dfc-8a07-1450be63bebc";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete (roster order, TV order, lineup order).
const rolls = [
  [10, 10, 8, 2, 10, 6, 4, 3, 7, 8, 0, 8, 1, 10, 8, 0],
  [3, 0, 10, 5, 2, 7, 1, 1, 7, 8, 0, 10, 6, 4, 10, 6, 3],
  [9, 1, 10, 10, 10, 10, 4, 5, 9, 1, 10, 10, 8, 2, 9],
  [10, 8, 2, 10, 10, 10, 8, 1, 10, 9, 1, 10, 10, 10, 10],
];
const tvScratch = [162, 119, 219, 226]; // TV frame-10 totals; TOT column 225/195/274/235 adds 63/76/55/9
const tvHandicap = [63, 76, 55, 9]; // team hdcp 203, pinfall 726, total 929
// Their lineup in TV (head-to-head) order. Noah Evans and Rick subbed for Tiffany Schwab and Kathleen Olson;
// Noah bowled with no handicap (TOT 138 = scratch). Rick's surname is cut off on the TV; Gary's sheet will have it.
const theirs = [
  { name: "NOAH EVANS", handicap: 0, game1: 138 },
  { name: "RICK CH", handicap: 52, game1: 150 },
  { name: "TYLER VOIGT", handicap: 43, game1: 161 },
  { name: "RYAN MURPHY", handicap: 31, game1: 186 },
];
const theirTotals = { scratch: 635, handicap: 126, total: 761 };

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-1 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 726) throw new Error("Our scratch total is not 726");
if (theirs.reduce((a, b) => a + b.game1, 0) !== theirTotals.scratch || theirs.reduce((a, b) => a + b.handicap, 0) !== theirTotals.handicap) throw new Error("Their totals drifted from the TV (635 / hdcp 126)");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (current.history.some(h => h.game === 1) || current.rolls.some(r => r.length) || current.finals?.some(f => f != null)) {
  console.log(`Game 1 is already in this night (revision ${row.revision}, game ${current.game}); nothing written.`);
  process.exit(0);
}
if (!current.match || current.match.week !== 5 || current.match.opponent.number !== 1) throw new Error("This is not the Week 5 Here 4 Beer night");
if (current.match.ours.map(b => b.handicap).join() !== tvHandicap.join()) throw new Error(`Our handicaps in the night are ${current.match.ours.map(b => b.handicap)}, TV shows ${tvHandicap}`);

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
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "HERE 4 BEER", bowlers: theirs.map(b => ({ name: b.name, handicap: b.handicap, games: [b.game1] })) });
const usTotal = ours.reduce((a, b) => a + b.games[0] + b.handicap, 0);
if (usTotal !== 929 || theirs.reduce((a, b) => a + b.game1 + b.handicap, 0) !== theirTotals.total) throw new Error("Handicap totals are not 929 / 761");
console.log("game 1 handicap", `us ${usTotal} vs them ${theirTotals.total}`);
console.log("head to head", ours.map((b, i) => `${b.name} ${b.games[0] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].game1 + theirs[i].handicap}`).join(" · "));
console.log("points so far", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 1; the night is now on game 2 (revision ${written[0].revision}).`);

// bun --env-file=.env.local scripts/import-week-3-game-2.ts [--dry-run]
// Week 3 (2026-09-24) vs BALLS DEEP, game 2, read frame by frame from the two lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Idempotent: writes only while the night is on an untouched game 2, with the same compare-and-swap on revision as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "e5447bb1-69f6-4d6f-a227-a4bdd0caef27";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete.
const rolls = [
  [10, 8, 2, 8, 2, 9, 0, 8, 2, 8, 2, 9, 1, 5, 0, 10, 0, 1],
  [8, 0, 9, 0, 1, 4, 10, 7, 0, 7, 0, 7, 0, 7, 3, 3, 6, 8, 0],
  [9, 1, 9, 0, 7, 2, 9, 1, 0, 10, 7, 3, 9, 1, 10, 8, 1, 6, 1],
  [9, 1, 10, 9, 1, 6, 4, 8, 1, 8, 2, 10, 7, 3, 9, 1, 7, 3, 10],
];
const tvScratch = [135, 90, 138, 179]; // TOT column 188/159/192/204 adds 53/69/54/25
const theirGame2 = [148, 181, 127, 200]; // Michael, Simon, Zach, Shawn (TOT 219/243/179/225 less 71/62/52/25)

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-2 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 542 || theirGame2.reduce((a, b) => a + b, 0) !== 656) throw new Error("Team totals drifted from the TV (542 / 656)");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (current.history.some(h => h.game === 2)) { console.log(`Game 2 is already in this night (revision ${row.revision}); nothing written.`); process.exit(0); }
if (current.game !== 2 || current.rolls.some(r => r.length) || current.finals?.some(f => f != null)) throw new Error("Game 2 already has entries on a phone; refusing to overwrite them");
if (!current.match || current.match.week !== 3 || current.match.opponent.number !== 3 || current.match.opponentGames.length !== 1) throw new Error("Unexpected match state for Week 3 game 2");

const next = nightSchema.parse({
  ...current,
  game: 3,
  rolls: [[], [], [], []],
  history: [...current.history, { game: 2, rolls }],
  match: { ...current.match, opponentGames: [...current.match.opponentGames, theirGame2] },
});

const game1 = current.history.find(h => h.game === 1)!.rolls.map(r => analyze(r).score);
const ours = current.match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: [game1[i], scores[i]] }));
const theirs = current.match.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: [current.match!.opponentGames[0][i]!, theirGame2[i]] }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "BALLS DEEP", bowlers: theirs });
console.log("game 2 handicap", `us ${ours.reduce((a, b) => a + b.games[1] + b.handicap, 0)} vs them ${theirs.reduce((a, b) => a + b.games[1] + b.handicap, 0)}`);
console.log("head to head", ours.map((b, i) => `${b.name} ${b.games[1] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].games[1] + theirs[i].handicap}`).join(" · "));
console.log("points so far", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 2; the night is now on game 3 (revision ${written[0].revision}).`);

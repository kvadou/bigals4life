// bun --env-file=.env.local scripts/import-week-3-game-3.ts [--dry-run]
// Week 3 (2026-09-24) vs BALLS DEEP, game 3, read frame by frame from the lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Mustafa's 9th frame first ball shows the foul box: 0, then 9 (109 -> 118).
// Game 3 stays the current game, as the scorebook keeps its last game (see import-week-2.ts).
// Idempotent: writes only while game 3 is untouched, with the same compare-and-swap on revision as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "e5447bb1-69f6-4d6f-a227-a4bdd0caef27";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete.
const rolls = [
  [4, 6, 8, 0, 10, 8, 2, 6, 0, 7, 0, 5, 3, 9, 1, 10, 10, 0, 7],
  [9, 1, 10, 8, 1, 10, 8, 2, 8, 0, 8, 0, 0, 7, 0, 9, 0, 0],
  [8, 2, 10, 7, 3, 10, 4, 4, 9, 0, 7, 2, 10, 6, 3, 5, 5, 10],
  [8, 1, 10, 9, 1, 9, 1, 9, 0, 10, 10, 10, 10, 10, 10, 10],
];
const tvScratch = [140, 118, 152, 226]; // TOT column 193/187/206/251 adds 53/69/54/25
const theirGame3 = [165, 174, 133, 204]; // Michael, Simon, Zach, Shawn (TOT 236/236/185/229 less 71/62/52/25)

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-3 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 636 || theirGame3.reduce((a, b) => a + b, 0) !== 676) throw new Error("Team totals drifted from the TV (636 / 676)");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (current.match?.opponentGames.length === 3 && current.rolls.every(r => r.length)) { console.log(`Game 3 is already in this night (revision ${row.revision}); nothing written.`); process.exit(0); }
if (current.game !== 3 || current.rolls.some(r => r.length) || current.finals?.some(f => f != null)) throw new Error("Game 3 already has entries on a phone; refusing to overwrite them");
if (!current.match || current.match.week !== 3 || current.match.opponent.number !== 3 || current.match.opponentGames.length !== 2) throw new Error("Unexpected match state for Week 3 game 3");

const next = nightSchema.parse({ ...current, rolls, match: { ...current.match, opponentGames: [...current.match.opponentGames, theirGame3] } });

const game = (g: number) => current.history.find(h => h.game === g)!.rolls.map(r => analyze(r).score);
const [g1, g2] = [game(1), game(2)];
const ours = current.match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: [g1[i], g2[i], scores[i]] }));
const theirs = current.match.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: [current.match!.opponentGames[0][i]!, current.match!.opponentGames[1][i]!, theirGame3[i]] }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "BALLS DEEP", bowlers: theirs });
const series = (b: { handicap: number; games: number[] }) => b.games.reduce((a, s) => a + s + b.handicap, 0);
console.log("game 3 handicap", `us ${ours.reduce((a, b) => a + b.games[2] + b.handicap, 0)} vs them ${theirs.reduce((a, b) => a + b.games[2] + b.handicap, 0)}`);
console.log("game 3 head to head", ours.map((b, i) => `${b.name} ${b.games[2] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].games[2] + theirs[i].handicap}`).join(" · "));
console.log("series head to head", ours.map((b, i) => `${b.name} ${series(b)} v ${theirs[i].name.split(" ")[0]} ${series(theirs[i])}`).join(" · "));
console.log("team series", `us ${ours.reduce((a, b) => a + series(b), 0)} vs them ${theirs.reduce((a, b) => a + series(b), 0)}`);
console.log("final points", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 3; the night is complete (revision ${written[0].revision}).`);

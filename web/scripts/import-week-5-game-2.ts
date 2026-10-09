// bun --env-file=.env.local scripts/import-week-5-game-2.ts [--dry-run]
// Week 5 (2026-10-08) vs HERE 4 BEER on lanes 1-2, game 2, read frame by frame from the two lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Idempotent: writes only while the night is on game 2 with no game-2 rolls, with the same compare-and-swap as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "7aa952b6-9f42-4dfc-8a07-1450be63bebc";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete. Kyle's frame 6 first ball shows the split marker with no count, so it is a 0 then a spare.
const rolls = [
  [8, 0, 0, 10, 6, 3, 0, 10, 9, 0, 8, 1, 10, 8, 1, 10, 6, 2],
  [9, 0, 8, 2, 8, 0, 9, 1, 6, 0, 3, 4, 9, 1, 7, 2, 10, 0, 8],
  [0, 6, 7, 3, 10, 10, 10, 0, 10, 9, 1, 10, 10, 10, 9, 0],
  [9, 1, 10, 8, 2, 0, 6, 10, 10, 9, 1, 8, 1, 10, 6, 2],
];
const tvScratch = [124, 116, 213, 158]; // TOT column 187/192/268/167 adds 63/76/55/9; game 814, pinfall 1337
const theirGame2 = [151, 141, 143, 199]; // Noah, Rick, Tyler, Ryan; TOT 151/193/186/230; game 760, pinfall 1269

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-2 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 611 || theirGame2.reduce((a, b) => a + b, 0) !== 634) throw new Error("Team scratch totals are not 611 / 634");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (!current.match || current.match.week !== 5) throw new Error("This is not the Week 5 night");
if (current.history.some(h => h.game === 2) || current.game !== 2 || current.rolls.some(r => r.length)) {
  console.log(`Game 2 is already in this night or it is not on game 2 (revision ${row.revision}, game ${current.game}); nothing written.`);
  process.exit(0);
}
if (current.match.opponentGames.length !== 1) throw new Error("Game 1 opponent scores are missing");

const next = nightSchema.parse({
  ...current,
  game: 3,
  rolls: [[], [], [], []],
  history: [...current.history, { game: 2, rolls }],
  match: { ...current.match, opponentGames: [...current.match.opponentGames, theirGame2] },
});

const ours = current.match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: next.history.map(h => analyze(h.rolls[i]).score) }));
const theirs = current.match.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: next.match!.opponentGames.map(g => g[i]) }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "HERE 4 BEER", bowlers: theirs });
const us = ours.reduce((a, b) => a + b.games[1] + b.handicap, 0), them = theirs.reduce((a, b) => a + b.games[1] + b.handicap, 0);
if (us !== 814 || them !== 760) throw new Error(`Handicap game totals ${us} / ${them} are not 814 / 760`);
console.log("game 2 handicap", `us ${us} vs them ${them}`);
console.log("head to head", ours.map((b, i) => `${b.name} ${b.games[1] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].games[1] + theirs[i].handicap}`).join(" · "));
console.log("points after two", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 2; the night is now on game 3 (revision ${written[0].revision}).`);

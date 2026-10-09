// bun --env-file=.env.local scripts/import-week-5-game-3.ts [--dry-run]
// Week 5 (2026-10-08) vs HERE 4 BEER on lanes 1-2, game 3, read frame by frame from the two lane TVs Doug photographed.
// Every row was checked against the TV's running frame totals and its TOT column (scratch + handicap).
// Also fixes Rick's surname (the TV showed "RICK CHRISTLIE" in game 3).
// Idempotent: writes only while the night is on game 3 with no rolls, with the same compare-and-swap as PUT /api/nights/:id.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "7aa952b6-9f42-4dfc-8a07-1450be63bebc";
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete.
const rolls = [
  [9, 0, 9, 0, 1, 9, 0, 7, 9, 1, 10, 8, 2, 8, 2, 10, 9, 1, 1],
  [10, 10, 1, 7, 8, 2, 0, 6, 7, 1, 0, 6, 7, 0, 10, 8, 2, 6],
  [9, 1, 10, 10, 0, 10, 9, 1, 9, 1, 10, 7, 3, 7, 2, 9, 0],
  [9, 0, 9, 1, 10, 10, 8, 1, 9, 1, 10, 10, 8, 1, 9, 1, 10],
];
const tvScratch = [144, 120, 173, 181]; // TOT column 207/196/228/190; game 821, pinfall 1955
const theirGame3 = [127, 149, 133, 139]; // Noah, Rick, Tyler, Ryan; TOT 127/201/176/170; game 674, pinfall 1817

const scores = rolls.map(r => { const a = analyze(r); if (!a.complete) throw new Error("A game-3 row is not a complete game"); return a.score; });
if (scores.join() !== tvScratch.join()) throw new Error(`Rolls score ${scores} but the TV shows ${tvScratch}; refusing to write`);
if (scores.reduce((a, b) => a + b, 0) !== 618 || theirGame3.reduce((a, b) => a + b, 0) !== 548) throw new Error("Team scratch totals are not 618 / 548");

const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const current = nightSchema.parse(row.state);
if (!current.match || current.match.week !== 5) throw new Error("This is not the Week 5 night");
if (current.game !== 3 || current.rolls.some(r => r.length) || current.match.opponentGames.length !== 2) {
  console.log(`The night is not waiting for game 3 (revision ${row.revision}, game ${current.game}); nothing written.`);
  process.exit(0);
}

const next = nightSchema.parse({
  ...current,
  game: 3,
  rolls,
  match: {
    ...current.match,
    opponent: { ...current.match.opponent, bowlers: current.match.opponent.bowlers.map(b => b.name === "RICK CH" ? { ...b, name: "RICK CHRISTLIE" } : b) },
    opponentGames: [...current.match.opponentGames, theirGame3],
  },
});

const allOurs = [...next.history.map(h => h.rolls), rolls];
const ours = current.match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: allOurs.map(g => analyze(g[i]).score) }));
const theirs = next.match!.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: next.match!.opponentGames.map(g => g[i]) }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "HERE 4 BEER", bowlers: theirs });
const us = ours.reduce((a, b) => a + b.games[2] + b.handicap, 0), them = theirs.reduce((a, b) => a + b.games[2] + b.handicap, 0);
if (us !== 821 || them !== 674) throw new Error(`Handicap game totals ${us} / ${them} are not 821 / 674`);
const series = (bs: typeof ours) => bs.reduce((a, b) => a + b.games.reduce((x, y) => x + y, 0) + 3 * b.handicap, 0);
if (series(ours) !== 2564 || series(theirs) !== 2195) throw new Error("Series totals are not 2564 / 2195");
console.log("game 3 handicap", `us ${us} vs them ${them}`, "series", `${series(ours)} vs ${series(theirs)}`);
console.log("head to head", ours.map((b, i) => `${b.name} ${b.games[2] + b.handicap} v ${theirs[i].name.split(" ")[0]} ${theirs[i].games[2] + theirs[i].handicap}`).join(" · "));
console.log("final points", points.total.join("-"));
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Wrote game 3; the night is final (revision ${written[0].revision}).`);

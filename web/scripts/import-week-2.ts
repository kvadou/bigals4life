// bun scripts/import-week-2.ts [--dry-run]
// Week 2 (2026-09-17) vs FINGER DEPTH CHECK, scores only from the handwritten sheet and lane monitor.
// Their four bowlers had not bowled Week 1, so Gary handicaps them retroactively from this night's
// averages, exactly as he did for every team in Week 1. Once his Week 2 standings PDF is ingested,
// /api/season swaps in the official points automatically; this night is the source of truth until then.
// Idempotent: fixed scorebook id, existing state is never overwritten.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { handicapFor, matchPoints } from "../lib/league/points";
import { BOWLERS } from "../lib/season";

const id = "b0a4c2d1-0917-4e02-9a5b-2026091700a2";
const owner = "7d0322b2-c7c1-4923-95fa-5d2018cc6678"; // Doug
const teammates = ["kyledickhaus@gmail.com", "mustafa.towermn@gmail.com", "pete@productdna.net"];
const dry = process.argv.includes("--dry-run");

const ours = [
  { name: "Doug", handicap: 26, games: [130, 112, 121] },
  { name: "Mustafa", handicap: 92, games: [162, 182, 136] },
  { name: "Kyle", handicap: 53, games: [102, 185, 155] },
  { name: "Pete", handicap: 29, games: [183, 191, 188] },
];
if (ours.map(b => b.name).join() !== BOWLERS.join()) throw new Error("Lineup must follow roster order");
const theirsRaw: [string, number[]][] = [["RACHEL", [134, 89, 96]], ["ROSS", [98, 84, 70]], ["PAUL", [121, 92, 84]], ["AMY", [102, 110, 89]]];
const theirs = theirsRaw.map(([name, games]) => ({ name, handicap: handicapFor(games.reduce((a, b) => a + b, 0) / games.length), games }));

const finalsOf = (g: number) => ours.map(b => b.games[g]);
const state = nightSchema.parse({
  game: 3,
  rolls: [[], [], [], []],
  finals: finalsOf(2),
  history: [{ game: 1, rolls: [[], [], [], []], finals: finalsOf(0) }, { game: 2, rolls: [[], [], [], []], finals: finalsOf(1) }],
  match: {
    season: "Thursday Men's Early 2026-27",
    week: 2,
    lane: "odd",
    opponent: { number: 5, name: "FINGER DEPTH CHECK", bowlers: theirs.map(({ name, handicap }) => ({ name, handicap })) },
    ours: ours.map(({ name, handicap }) => ({ name, handicap })),
    opponentGames: [0, 1, 2].map(g => theirs.map(b => b.games[g])),
  },
});

const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "FINGER DEPTH CHECK", bowlers: theirs });
console.log("their handicaps", theirs.map(b => `${b.name} ${b.handicap}`).join(", "));
console.log("expected points", points.total.join("-"), "games", points.games.map(g => `${g.ours}-${g.theirs}`).join(" "), "series", `${points.series.ours}-${points.series.theirs}`);
if (points.total[0] !== 26 || points.total[1] !== 10) throw new Error("Points drifted from the verified 26-10; refusing to write");
if (dry) { console.log("dry run, nothing written"); process.exit(0); }

const existing = await database(`scorebooks?id=eq.${id}&select=id,revision`);
if (!existing.length) { await database("scorebooks", { method: "POST", body: JSON.stringify({ id, state }) }); console.log("Created Week 2 scorebook."); }
else console.log(`Scorebook exists (revision ${existing[0].revision}); state preserved.`);

const members = await database(`scorebook_members?scorebook_id=eq.${id}&user_id=eq.${owner}&select=user_id`);
if (!members.length) await database("scorebook_members", { method: "POST", body: JSON.stringify({ scorebook_id: id, user_id: owner, role: "owner", added_by: owner }) });
const invites: { email: string }[] = await database(`scorebook_invites?scorebook_id=eq.${id}&select=email`);
const missing = teammates.filter(e => !invites.some(i => i.email === e));
if (missing.length) await database("scorebook_invites", { method: "POST", body: JSON.stringify(missing.map(email => ({ scorebook_id: id, email, role: "editor", invited_by: owner }))) });
console.log(`members ok, invites ${teammates.length - missing.length} existing + ${missing.length} added`);

// The night was bowled Thursday evening Central (2026-09-17), not when this script ran.
const bowledAt = "2026-09-18T01:30:00+00:00";
const [first] = await database(`scorebook_revisions?scorebook_id=eq.${id}&revision=eq.1&select=recorded_at`);
if (first && first.recorded_at > bowledAt) { await database(`scorebook_revisions?scorebook_id=eq.${id}&revision=eq.1`, { method: "PATCH", body: JSON.stringify({ recorded_at: bowledAt }) }); console.log("Dated the night to league night."); }

const saved = await database(`scorebooks?id=eq.${id}&select=id,revision,state`);
if (!saved[0]) throw new Error("Read-back failed");
console.log(JSON.stringify({ id, revision: saved[0].revision, game: saved[0].state.game, finals: saved[0].state.finals, week: saved[0].state.match?.week, opponent: saved[0].state.match?.opponent?.name }));
console.log(`https://bigals4life.com/?night=${id}`);

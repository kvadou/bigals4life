// bun --env-file=.env.local scripts/import-week-4.ts [--dry-run]
// Week 4 (2026-10-01) vs X X X on lanes 3-4. Games 1 and 2 read frame by frame from the lane TVs Doug photographed;
// game 3 was not photographed, so it comes from Gary's Week 4 sheet as finals only.
// Every row is checked against the TV frame-10 totals and the sheet before anything is written.
// Idempotent: creates the night under a fixed id once; a second run finds it and writes nothing.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "2b8f4c1e-6d3a-4e57-9f0b-04a7d1c62e15";
const owner = "7d0322b2-c7c1-4923-95fa-5d2018cc6678"; // Doug, owner of the Week 3 night
const dry = process.argv.includes("--dry-run");

// Doug, Mustafa, Kyle, Pete (roster order, TV order, lineup order). Handicaps from the TV (team hdcp 212 a game).
const ours = [{ name: "Doug", handicap: 60 }, { name: "Mustafa", handicap: 78 }, { name: "Kyle", handicap: 56 }, { name: "Pete", handicap: 18 }];
const game1 = [
  [0, 0, 5, 1, 9, 1, 8, 0, 6, 2, 6, 0, 8, 2, 9, 0, 10, 10, 8, 2],
  [7, 0, 0, 9, 6, 4, 8, 2, 7, 3, 3, 0, 7, 1, 9, 0, 8, 0, 10, 5, 0],
  [9, 1, 9, 1, 0, 3, 8, 2, 9, 1, 0, 3, 7, 2, 10, 10, 9, 1, 8],
  [10, 9, 1, 10, 9, 1, 8, 2, 10, 10, 10, 10, 9, 1, 10],
];
const game2 = [
  [10, 10, 0, 7, 10, 4, 0, 9, 0, 10, 10, 8, 0, 10, 7, 3],
  [5, 3, 6, 0, 8, 0, 10, 8, 1, 10, 9, 1, 7, 0, 10, 10, 3, 6],
  [10, 10, 10, 8, 1, 9, 1, 8, 1, 8, 1, 6, 4, 9, 1, 7, 2],
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 7, 1],
];
const game3 = [124, 155, 145, 178]; // Gary's sheet
const sheet = { ours: [[122, 107, 140, 227], [145, 136, 167, 285], game3], team: [808, 945, 814], theirs: [806, 803, 876], points: [24, 12] };

// Their lineup in TV order. Ross and Rachel subbed in; Gary files their games under FINGER DEPTH CHECK.
const theirs = [
  { name: "MICHAEL DOLS", handicap: 81, games: [88, 149, 171] },
  { name: "LIZ BOOTH", handicap: 88, games: [145, 124, 141] },
  { name: "ROSS CARLSON", handicap: 100, games: [111, 67, 91] },
  { name: "RACHEL CARLSON", handicap: 86, games: [107, 108, 118] },
];

const score = (r: number[]) => { const a = analyze(r); if (!a.complete) throw new Error(`Incomplete game: ${r}`); return a.score; };
const scores = [game1.map(score), game2.map(score), game3];
scores.forEach((g, i) => { if (g.join() !== sheet.ours[i].join()) throw new Error(`Game ${i + 1} rolls score ${g} but the TV/sheet show ${sheet.ours[i]}`); });
const hdcp = ours.reduce((s, b) => s + b.handicap, 0), theirHdcp = theirs.reduce((s, b) => s + b.handicap, 0);
if (hdcp !== 212 || theirHdcp !== 355) throw new Error("Handicaps drifted from the TV (212 / 355)");
scores.forEach((g, i) => { if (g.reduce((a, b) => a + b, 0) + hdcp !== sheet.team[i]) throw new Error(`Our game ${i + 1} total is not ${sheet.team[i]}`); });
[0, 1, 2].forEach(i => { if (theirs.reduce((s, b) => s + b.games[i], 0) + theirHdcp !== sheet.theirs[i]) throw new Error(`Their game ${i + 1} total is not ${sheet.theirs[i]}`); });

const points = matchPoints(
  { name: "BIG AL'S 4 LIFE", bowlers: ours.map((b, i) => ({ ...b, games: scores.map(g => g[i]) })) },
  { name: "X X X", bowlers: theirs },
);
console.log("games", scores.map((g, i) => `${g.reduce((a, b) => a + b, 0) + hdcp}-${sheet.theirs[i]}`).join(" · "), "points", points.total.join("-"));
if (points.total.join() !== sheet.points.join()) throw new Error(`Points ${points.total} differ from Gary's ${sheet.points}`);

const state = nightSchema.parse({
  game: 3,
  rolls: [[], [], [], []],
  finals: game3,
  history: [{ game: 1, rolls: game1 }, { game: 2, rolls: game2 }],
  match: {
    season: "Thursday Men's Early 2026-27", week: 4, lane: "odd", ours,
    opponent: { number: 2, name: "X X X", bowlers: theirs.map(({ name, handicap }) => ({ name, handicap })) },
    opponentGames: [0, 1, 2].map(g => theirs.map(b => b.games[g])),
  },
});

const [existing] = await database(`scorebooks?id=eq.${id}&select=id,revision`);
if (existing) { console.log(`Week 4 night already exists (revision ${existing.revision}); nothing written.`); process.exit(0); }
if (dry) { console.log("dry run, nothing written"); process.exit(0); }
await database("scorebooks", { method: "POST", body: JSON.stringify({ id, state, owner_id: owner }) });
await database("scorebook_members", { method: "POST", body: JSON.stringify({ scorebook_id: id, user_id: owner, role: "owner", added_by: owner }) });
const [saved] = await database(`scorebooks?id=eq.${id}&select=revision,state`);
if (JSON.stringify(nightSchema.parse(saved.state)) !== JSON.stringify(state)) throw new Error("Read-back differs from what was written");
console.log(`Wrote Week 4 night ${id} (revision ${saved.revision}): https://strike-ceiling-web.vercel.app/night?night=${id}`);

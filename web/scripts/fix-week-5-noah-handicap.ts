// bun --env-file=.env.local scripts/fix-week-5-noah-handicap.ts
// Gary's Week 5 sheet gave Noah Evans his 64 handicap on the night he established it, not the week after.
// The lane TV scored him at 0, so the night was imported that way (30-6). With 64 the sheet reads 24-12.
// Idempotent: a no-op once Noah is already at 64; refuses to write unless the result is exactly Gary's 24-12.
import { database } from "../lib/scorebook-server";
import { nightSchema } from "../lib/scorebook";
import { analyze } from "../lib/bowling";
import { matchPoints } from "../lib/league/points";

const id = "7aa952b6-9f42-4dfc-8a07-1450be63bebc";
const [row] = await database(`scorebooks?id=eq.${id}&select=state,revision`);
if (!row) throw new Error("Tonight's scorebook is missing");
const night = nightSchema.parse(row.state);
const match = night.match;
if (!match || match.week !== 5) throw new Error("This is not the Week 5 night");
if (match.opponent.bowlers[0].handicap === 64) { console.log("Noah is already at 64; nothing written."); process.exit(0); }

const next = nightSchema.parse({
  ...night,
  match: { ...match, opponent: { ...match.opponent, bowlers: match.opponent.bowlers.map(b => b.name === "NOAH EVANS" ? { ...b, handicap: 64 } : b) } },
});
const allOurs = [...night.history.map(h => h.rolls), night.rolls];
const ours = match.ours.map((b, i) => ({ name: b.name, handicap: b.handicap, games: allOurs.map(g => analyze(g[i]).score) }));
const theirs = next.match!.opponent.bowlers.map((b, i) => ({ name: b.name, handicap: b.handicap, games: match.opponentGames.map(g => g[i]) }));
const points = matchPoints({ name: "BIG AL'S 4 LIFE", bowlers: ours }, { name: "HERE 4 BEER", bowlers: theirs });
console.log("points with Noah at 64:", points.total.join("-"));
if (points.total.join("-") !== "24-12") throw new Error("That is not Gary's 24-12; refusing to write");

const written = await database(`scorebooks?id=eq.${id}&revision=eq.${row.revision}&select=revision`, { method: "PATCH", body: JSON.stringify({ state: next, revision: row.revision + 1, updated_at: new Date().toISOString() }) });
if (!written.length) throw new Error("Someone saved this night while the script ran; re-run to try again");
console.log(`Noah set to 64; night now reads 24-12 (revision ${written[0].revision}).`);

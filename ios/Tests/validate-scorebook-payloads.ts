import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { nightSchema } from "../../web/lib/scorebook";

const path = process.argv[2];
if (!path) throw Error("Pass the SCOREBOOK_PAYLOADS JSON file produced by Swift tests.");
const requests: unknown[] = JSON.parse(readFileSync(path, "utf8"));
if (!requests.length) throw Error("Expected native HTTP request fixtures.");
for (const request of requests) {
  const { state, revision } = request as { state: unknown; revision?: number };
  const parsed = nightSchema.parse(state);
  deepStrictEqual(parsed, state, "Native payload must survive web validation without losing fields");
  deepStrictEqual(parsed.prebowl, { week: 2, bowlers: [0, 2] }, "Native writes preserve prebowl metadata");
  deepStrictEqual(parsed.match?.lane, "even", "Native writes preserve lane order");
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
    throw Error("Invalid native PUT revision");
  }
}
console.log(`Validated ${requests.length} native request bodies with the web scorebook schema`);

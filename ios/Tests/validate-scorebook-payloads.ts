import { readFileSync } from "node:fs";
import { nightSchema } from "../../web/lib/scorebook";

const path = process.argv[2];
if (!path) throw Error("Pass the SCOREBOOK_PAYLOADS JSON file produced by Swift tests.");
const requests: unknown[] = JSON.parse(readFileSync(path, "utf8"));
if (!requests.length) throw Error("Expected native HTTP request fixtures.");
for (const request of requests) {
  const { state, revision } = request as { state: unknown; revision?: number };
  nightSchema.parse(state);
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
    throw Error("Invalid native PUT revision");
  }
}
console.log(`Validated ${requests.length} native request bodies with the web scorebook schema`);

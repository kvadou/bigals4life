import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const ios = resolve(import.meta.dir, "..");
const bundleID = "com.dougkvamme.StrikeCeiling"; // Preserve installed app data across the BA4L rename.
const credentialFile = join(homedir(), ".appstoreconnect/credentials.env");
const values: Record<string, string> = {};
if (existsSync(credentialFile)) {
  for (const line of readFileSync(credentialFile, "utf8").split("\n")) {
    const match = line.match(/^(?:export\s+)?(API_KEY_ID|API_ISSUER_ID)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
const keyID = process.env.API_KEY_ID ?? values.API_KEY_ID;
const issuer = process.env.API_ISSUER_ID ?? values.API_ISSUER_ID;
if (!keyID || !issuer) throw Error("Configure the existing App Store Connect credentials in ~/.appstoreconnect/credentials.env.");
const keyPath = join(homedir(), `.appstoreconnect/private_keys/AuthKey_${keyID}.p8`);
const privateKey = createPrivateKey(readFileSync(keyPath));
function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyID, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })).toString("base64url");
  const message = `${header}.${payload}`;
  return `${message}.${sign("sha256", Buffer.from(message), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw Error(`App Store Connect ${response.status}: ${data.errors?.map((x: {code:string;detail:string}) => `${x.code}: ${x.detail}`).join("; ") ?? "request failed"}`);
  return data;
}
async function apps() {
  return (await api(`apps?filter[bundleId]=${bundleID}&fields[apps]=name,bundleId&limit=10`)).data;
}
async function builds(appID: string) {
  return (await api(`builds?filter[app]=${appID}&sort=-uploadedDate&limit=50&fields[builds]=version,processingState,uploadedDate,expired`)).data;
}
function execute(command: string, args: string[], log: string) {
  const output = openSync(log, "w", 0o600);
  try {
    const result = spawnSync(command, args, { cwd: ios, stdio: ["ignore", output, output], env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${command} failed (${result.status}). Inspect ${log}.`);
  } finally { closeSync(output); }
}
const command = process.argv[2] ?? "status";
if (command === "register-bundle") {
  const existing = (await api(`bundleIds?filter[identifier]=${bundleID}`)).data;
  if (existing.length) console.log("Bundle already registered:", existing[0].id);
  else {
    const result = await api("bundleIds", "POST", { data: { type: "bundleIds", attributes: { identifier: bundleID, name: "BA4L", platform: "IOS" } } });
    console.log("Registered BA4L bundle:", result.data.id);
  }
} else if (command === "status") {
  const matches = await apps();
  console.log(JSON.stringify({ bundleID, apps: matches.map((x:any) => ({ id:x.id, ...x.attributes })) }));
  for (const app of matches) console.log(JSON.stringify({ app: app.id, builds: (await builds(app.id)).map((x:any) => ({ id:x.id, ...x.attributes })) }));
} else if (command === "ship" || command === "archive") {
  const app = (await apps())[0];
  if (!app && command === "ship") throw Error("Create the BA4L app record in App Store Connect first, using the existing bundle identifier.");
  const project = readFileSync(join(ios, "project.yml"), "utf8");
  const build = project.match(/CURRENT_PROJECT_VERSION:\s*["']?(\d+)/)?.[1];
  if (!build) throw Error("Missing CURRENT_PROJECT_VERSION in project.yml");
  const previous = app ? await builds(app.id) : [];
  if (command === "ship" && previous.some((x:any) => x.attributes.version === build)) {
    console.log(`Build ${build} already uploaded; no duplicate upload performed.`);
    process.exit(0);
  }
  if (previous.some((x:any) => Number(x.attributes.version) > Number(build))) throw Error("Increase CURRENT_PROJECT_VERSION above the existing App Store Connect builds.");
  const output = join(homedir(), "Library/Developer/Xcode/Archives/BA4L", `build-${build}`);
  mkdirSync(output, { recursive: true });
  const receipt = join(output, "uploaded.json");
  if (command === "ship" && existsSync(receipt)) {
    console.log(`Build ${build} was already uploaded from this Mac. Run status to check Apple processing.`);
    process.exit(0);
  }
  const archive = join(output, "BA4L.xcarchive");
  const authentication = ["-authenticationKeyPath", keyPath, "-authenticationKeyID", keyID, "-authenticationKeyIssuerID", issuer];
  console.log(`Archiving BA4L build ${build}. Logs: ${output}`);
  execute("bun", ["Tools/configure-auth.ts"], join(output, "auth-config.log"));
  execute("xcodegen", ["generate"], join(output, "generate.log"));
  execute("xcodebuild", ["-project", "BA4L.xcodeproj", "-scheme", "BA4L", "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", archive, "-allowProvisioningUpdates", ...authentication, "archive"], join(output, "archive.log"));
  if (!existsSync(join(archive, "Products/Applications/BA4L.app/PrivacyInfo.xcprivacy"))) throw Error("Archive is missing the required privacy manifest; upload stopped.");
  if (command === "archive") { console.log(`Signed archive ready: ${archive}`); process.exit(0); }
  console.log("Archive succeeded. Uploading to App Store Connect…");
  execute("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportPath", join(output, "export"), "-exportOptionsPlist", "ExportOptions.plist", "-allowProvisioningUpdates", ...authentication], join(output, "upload.log"));
  writeFileSync(receipt, JSON.stringify({ appID: app.id, build, uploadedAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
  console.log(`Upload completed for build ${build}. Run status to verify Apple processing.`);
} else {
  throw Error("Use status, register-bundle, archive, or ship.");
}

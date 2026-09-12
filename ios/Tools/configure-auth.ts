import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!key) {
  for (const name of ["web/.env.local", "web/.env"]) {
    let text: string;
    try { text = readFileSync(resolve(root, name), "utf8"); } catch { continue; }
    const match = text.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m);
    if (match) { key = match[1].trim().replace(/^['"]|['"]$/g, ""); break; }
  }
}
let isPublic = key.startsWith("sb_publishable_") && key.length > 20;
const parts = key.split(".");
try { isPublic ||= parts.length === 3 && parts.every(Boolean) && JSON.parse(Buffer.from(parts[1], "base64url").toString()).role === "anon"; } catch {}
if (!isPublic || !/^[A-Za-z0-9_.-]+$/.test(key)) {
  throw new Error("Missing valid public Supabase client key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local. Never use a service-role key.");
}
const directory = resolve(root, "ios/Config");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "LocalAuth.xcconfig"), `// Public client configuration generated locally. Not committed.\nBA4L_SUPABASE_ANON_KEY = ${key}\n`, { mode: 0o600 });
console.log("Local public auth configuration is ready.");

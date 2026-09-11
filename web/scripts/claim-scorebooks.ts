// bun --env-file=.env.local scripts/claim-scorebooks.ts <admin email> [scorebook id ...]
// Makes the admin the owner of legacy (unclaimed) scorebooks: all of them, or just the ids given. Idempotent.
// The admin must have signed in at least once so the auth user exists.
import { database } from "../lib/scorebook-server";

const [email, ...ids] = process.argv.slice(2);
if (!email) { console.error("Usage: bun scripts/claim-scorebooks.ts <admin email> [id ...]"); process.exit(1); }
const admins = (process.env.BAFL_ADMIN_EMAILS ?? "").toLowerCase().split(",").map(s => s.trim());
if (!admins.includes(email.toLowerCase())) { console.error(`${email} is not in BAFL_ADMIN_EMAILS.`); process.exit(1); }

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const users = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json();
const user = (users.users ?? []).find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.error(`No account for ${email} yet. Sign in on the website once, then re-run.`); process.exit(1); }

const filter = ids.length ? `&id=in.(${ids.join(",")})` : "";
const legacy: { id: string }[] = await database(`scorebooks?select=id&owner_id=is.null${filter}`);
for (const { id } of legacy) {
  await database(`scorebooks?id=eq.${id}&owner_id=is.null`, { method: "PATCH", body: JSON.stringify({ owner_id: user.id }) });
  await database("scorebook_members?on_conflict=scorebook_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ scorebook_id: id, user_id: user.id, role: "owner", added_by: user.id }) });
  console.log(`claimed ${id}`);
}
const remaining: { id: string }[] = await database("scorebooks?select=id&owner_id=is.null");
console.log(`${legacy.length} claimed by ${email}; ${remaining.length} still unclaimed.`);

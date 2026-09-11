import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { database } from "./scorebook-server";

export type Identity = { user: { id: string; email: string }; viaCookie: boolean };
export type Role = "owner" | "editor" | "viewer" | "legacy" | "none" | "missing";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const enforcing = () => process.env.BAFL_AUTH_ENFORCE === "on";
export const isAdmin = (email: string) => (process.env.BAFL_ADMIN_EMAILS ?? "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean).includes(email.toLowerCase());

/** Who is calling. Bearer tokens are verified with Supabase; otherwise the SSR cookie session is verified the same way. Never trusts unverified claims. */
export async function identify(request: Request): Promise<Identity | null> {
  if (!url() || !anon()) return null;
  const header = request.headers.get("authorization");
  try {
    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7).trim(); if (!token || token.length > 4096) return null;
      const { data } = await createClient(url(), anon(), { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
      return data.user?.email ? await adopt({ user: { id: data.user.id, email: data.user.email }, viaCookie: false }) : null;
    }
    const store = await cookies();
    const client = createServerClient(url(), anon(), { cookies: { getAll: () => store.getAll(), setAll: () => { /* refreshed in proxy.ts */ } } });
    const { data } = await client.auth.getUser();
    return data.user?.email ? await adopt({ user: { id: data.user.id, email: data.user.email }, viaCookie: true }) : null;
  } catch { return null; }
}

/** Turn any invites addressed to this email into memberships. Runs on every identified request; cheap when there are none. */
async function adopt(identity: Identity): Promise<Identity> {
  try {
    const invites: { scorebook_id: string; role: string; invited_by: string | null }[] = await database(`scorebook_invites?select=scorebook_id,role,invited_by&email=eq.${encodeURIComponent(identity.user.email)}`);
    if (invites.length) {
      await database("scorebook_members?on_conflict=scorebook_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(invites.map(i => ({ scorebook_id: i.scorebook_id, user_id: identity.user.id, role: i.role, added_by: i.invited_by }))) });
      await database(`scorebook_invites?email=eq.${encodeURIComponent(identity.user.email)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
  } catch (error) { console.error("Invite adoption failed", error instanceof Error ? error.message : "unknown"); }
  return identity;
}

/** What this caller may do with one scorebook. Admin emails act as owner of anything claimed; legacy means unclaimed (link access). */
export async function access(identity: Identity | null, scorebookId: string): Promise<Role> {
  const rows: { owner_id: string | null }[] = await database(`scorebooks?id=eq.${scorebookId}&select=owner_id`);
  if (!rows[0]) return "missing";
  if (rows[0].owner_id === null) return "legacy";
  if (!identity) return "none";
  if (isAdmin(identity.user.email)) return "owner";
  const members: { role: Role }[] = await database(`scorebook_members?scorebook_id=eq.${scorebookId}&user_id=eq.${identity.user.id}&select=role`);
  return members[0]?.role ?? "none";
}

/** Pure decision so it can be tested and mirrored by the native client. */
export function decide(kind: "read" | "write", role: Role, identified: boolean): { status: 200 | 401 | 403 | 404; error?: string } {
  if (role === "missing") return { status: 404, error: "Team scorebook not found." };
  if (role === "legacy") return { status: 200 };
  if (role === "none") return identified ? { status: 404, error: "Team scorebook not found." } : { status: 401, error: "Sign in to open this team scorebook." };
  if (kind === "write" && role === "viewer") return { status: 403, error: "You can view this scorebook but not change it. Ask the owner for edit access." };
  return { status: 200 };
}

export const unauthorized = (message = "Sign in to continue.") => Response.json({ error: message }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
export const denied = (d: { status: number; error?: string }) => d.status === 401 ? unauthorized(d.error) : Response.json({ error: d.error }, { status: d.status });

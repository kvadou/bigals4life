import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate: nothing on the site is visible until you sign in, and only teammates (or the admin) get past the door.
 * Signed out -> /login. Signed in but not on any scorebook -> /waiting. Also keeps the session cookies fresh.
 * API routes do their own checks in the route handlers.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const open = path === "/login" || path === "/waiting";
  if (!url || !key) return open ? response : NextResponse.redirect(new URL("/login", request.url));
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: cookiesToSet => {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const confirmed = !!user?.email && !!(user.email_confirmed_at ?? user.confirmed_at);
  if (!confirmed) {
    if (open) return response;
    const login = new URL("/login", request.url);
    const next = path + request.nextUrl.search; // login page re-validates this against our origin
    if ((path !== "/" || request.nextUrl.search) && /^\/(?![\/\\])/.test(next)) login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
  if (open) return NextResponse.redirect(new URL("/", request.url));
  const admins = (process.env.BAFL_ADMIN_EMAILS ?? "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (admins.includes(user!.email!.toLowerCase())) return response;
  const onTeam = await isTeammate(user!.id, user!.email!);
  return onTeam ? response : NextResponse.rewrite(new URL("/waiting", request.url));
}

async function isTeammate(userId: string, email: string): Promise<boolean> {
  const base = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !service) return false;
  const headers = { apikey: service, Authorization: `Bearer ${service}` };
  try {
    const [members, invites] = await Promise.all([
      fetch(`${base}/rest/v1/scorebook_members?user_id=eq.${userId}&select=scorebook_id&limit=1`, { headers, cache: "no-store" }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/rest/v1/scorebook_invites?email=eq.${encodeURIComponent(email)}&select=scorebook_id&limit=1`, { headers, cache: "no-store" }).then(r => r.ok ? r.json() : []),
    ]);
    return members.length > 0 || invites.length > 0;
  } catch { return false; }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"] };

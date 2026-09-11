import { identify, isAdmin, isTeammate, unauthorized } from "@/lib/auth-server";
import { database } from "@/lib/scorebook-server";
import { nightSchema } from "@/lib/scorebook";
import { pointsSummary, summarizeWeek, type WeekSummary } from "@/lib/season";

type Row = Record<string, any>;
/** Every night this member can see, newest first, numbered as weeks of the current season. Test books with no finished game are hidden. */
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to see the season.");
  if (!await isTeammate(identity)) return Response.json({ error: "The season is for team members." }, { status: 403 });
  try {
    const members: Row[] = await database(`scorebook_members?user_id=eq.${identity.user.id}&select=scorebook_id`);
    const ids = members.map(m => m.scorebook_id);
    const filters = [ids.length ? `id=in.(${ids.join(",")})` : null, isAdmin(identity.user.email) ? "owner_id=is.null" : null].filter(Boolean);
    const rows: Row[] = filters.length ? (await Promise.all(filters.map(f => database(`scorebooks?${f}&select=id,state,updated_at&order=updated_at.asc`)))).flat() : [];
    const seen = new Set<string>();
    const nights = rows.filter(r => !seen.has(r.id) && seen.add(r.id)).map(r => ({ r, parsed: nightSchema.safeParse(r.state) })).filter(x => x.parsed.success).map(x => ({ id: x.r.id, updatedAt: x.r.updated_at, night: x.parsed.data! }));
    const weeks: WeekSummary[] = [];
    let n = 0;
    for (const { id, updatedAt, night } of nights.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
      const w = summarizeWeek(id, night, updatedAt, null);
      if (!w.finishedGames) continue;
      n += 1; if (w.week == null) w.week = n;
      w.points = pointsSummary(night);
      weeks.push(w);
    }
    return Response.json({ season: "2026-27", weeks: weeks.reverse() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Season load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "The season is unavailable right now." }, { status: 503 });
  }
}

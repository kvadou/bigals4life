import { identify, isAdmin, isTeammate, unauthorized } from "@/lib/auth-server";
import { database } from "@/lib/scorebook-server";
import { nightSchema } from "@/lib/scorebook";
import { pointsSummary, summarizeWeek, type WeekSummary } from "@/lib/season";
import { loadOfficialWeek } from "@/lib/league/official-server";

type Row = Record<string, any>;
/** Every night this member can see, newest first, numbered as weeks of the current season. Books with no finished team game are hidden unless they are a marked pre-bowl. */
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to see the season.");
  if (!await isTeammate(identity)) return Response.json({ error: "The season is for team members." }, { status: 403 });
  try {
    const members: Row[] = await database(`scorebook_members?user_id=eq.${identity.user.id}&select=scorebook_id`);
    const ids = members.map(m => m.scorebook_id);
    const admin = isAdmin(identity.user.email);
    const filters = [admin ? null : (ids.length ? `id=in.(${ids.join(",")})` : null), admin ? null : null].filter(Boolean);
    const rows: Row[] = admin
      ? await database("scorebooks?select=id,state,updated_at&order=updated_at.asc")
      : (filters.length ? (await Promise.all(filters.map(f => database(`scorebooks?${f}&select=id,state,updated_at&order=updated_at.asc`)))).flat() : []);
    const seen = new Set<string>();
    const unique = rows.filter(r => !seen.has(r.id) && seen.add(r.id));
    // A night's date is when it started (first saved revision), not when it was last edited.
    const firsts: Row[] = unique.length ? await database(`scorebook_revisions?scorebook_id=in.(${unique.map(r => r.id).join(",")})&revision=eq.1&select=scorebook_id,recorded_at`) : [];
    const startedAt = new Map(firsts.map(f => [f.scorebook_id, f.recorded_at]));
    const nights = unique.map(r => ({ r, parsed: nightSchema.safeParse(r.state) })).filter(x => x.parsed.success).map(x => ({ id: x.r.id, updatedAt: startedAt.get(x.r.id) ?? x.r.updated_at, night: x.parsed.data! }));
    const setupWeeks = nights.map(({id, updatedAt, night}) => ({
      id,
      week: night.prebowl?.week ?? null,
      bowledOn: updatedAt.slice(0, 10),
      prebowl: night.prebowl ?? null,
    }));
    // Gary's sheet is the source of truth for any week he has published.
    const sheetKeys = [...new Set(nights.flatMap(({ night }) => !night.prebowl && night.match?.season && night.match.week ? [`${night.match.week}|${night.match.season}`] : []))];
    const sheets = new Map(await Promise.all(sheetKeys.map(async k => { const [week, season] = [Number(k.split("|")[0]), k.slice(k.indexOf("|") + 1)]; return [k, await loadOfficialWeek(season, week).catch(() => null)] as const; })));
    const sheetFor = (night: (typeof nights)[number]["night"]) => night.match ? sheets.get(`${night.match.week}|${night.match.season}`) ?? null : null;
    const weeks: WeekSummary[] = [];
    let n = 0;
    for (const { id, updatedAt, night } of nights.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
      const w = summarizeWeek(id, night, updatedAt, null);
      // Pre-bowls carry their own week number and never take one from the running count.
      if (w.prebowl) { if (w.recordedGames) { w.points = pointsSummary(night); weeks.push(w); } continue; }
      if (!w.finishedGames) continue;
      n += 1; if (w.week == null) w.week = n;
      const sheet = sheetFor(night);
      w.points = pointsSummary(night, sheet);
      if (sheet && w.points) w.ourHandicaps = w.points.bowlers.map((b, i) => sheet.ours.find(r => r.name.toUpperCase().startsWith(`${b.name.toUpperCase()} `))?.handicap ?? w.ourHandicaps?.[i] ?? 0);
      weeks.push(w);
    }
    return Response.json({ season: "2026-27", weeks: weeks.reverse(), setupWeeks }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Season load failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "The season is unavailable right now." }, { status: 503 });
  }
}

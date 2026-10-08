import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { database } from "@/lib/scorebook-server";
import { loadStandings } from "@/lib/league/standings-server";
import { teamCard } from "@/lib/team-card";

type Row = Record<string, any>;
const FULL_NAMES: Record<string, string> = { Doug: "Doug Kvamme", Mustafa: "Mustafa Sakhi", Kyle: "Kyle Dickhaus", Pete: "Pete Anderson" };

/** The four bowlers, who has signed in, and their access on the newest team scorebook. Team members only; pending emails only for members of the book. */
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized();
  if (!await isTeammate(identity)) return Response.json({ error: "Team details are for team members. Ask Doug to add you." }, { status: 403 });
  try {
    const [profiles, [book], standings]: [Row[], Row[], Awaited<ReturnType<typeof loadStandings>>] = await Promise.all([
      database("profiles?select=user_id,bowler_name&bowler_name=not.is.null"),
      database("scorebooks?owner_id=not.is.null&select=id&order=updated_at.desc&limit=1"),
      loadStandings().catch(() => null),
    ]);
    const [members, invites]: Row[][] = book
      ? await Promise.all([
        database(`scorebook_members?scorebook_id=eq.${book.id}&select=user_id,role`),
        database(`scorebook_invites?scorebook_id=eq.${book.id}&select=email`),
      ])
      : [[], []];
    const yours = members.some(m => m.user_id === identity.user.id);
    return Response.json(teamCard({
      userId: identity.user.id,
      team: standings?.teams.find(t => t.ours)?.name ?? null,
      scorebookId: book?.id ?? null,
      profiles: profiles.map(p => ({ userId: p.user_id, bowlerName: p.bowler_name })),
      members: members.map(m => ({ userId: m.user_id, role: m.role })),
      // Pending emails are only shown to members of the book.
      invites: yours ? invites.map(i => i.email) : [],
      roster: standings?.roster.map(r => ({ name: r.name, average: r.average, handicap: r.handicap, games: r.gamesBowled })) ?? [],
      fullNames: FULL_NAMES,
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Team card failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Team details are unavailable right now." }, { status: 503 });
  }
}

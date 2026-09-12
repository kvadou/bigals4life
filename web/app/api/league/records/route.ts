import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { loadRecordBook } from "@/lib/league/records-server";

/** Native clients receive the same computed record book as the website. */
export async function GET(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to see league records.");
  if (!await isTeammate(identity)) return Response.json({ error: "League records are for team members. Ask Doug to add you." }, { status: 403 });
  const season = new URL(request.url).searchParams.get("season") || undefined;
  if (season && season.length > 120) return Response.json({ error: "Choose a valid season." }, { status: 400 });
  try {
    const book = await loadRecordBook(season);
    if (!book) return Response.json({ error: "No records have been ingested yet." }, { status: 404 });
    return Response.json(book, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "League records are unavailable right now." }, { status: 503 });
  }
}

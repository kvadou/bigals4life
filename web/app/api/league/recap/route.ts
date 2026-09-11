import { sameOrigin } from "@/lib/scorebook-server";
import { writeRecap } from "@/lib/league/recap";
import { enforcing, identify, unauthorized } from "@/lib/auth-server";

export const maxDuration = 60;
const attempts = new Map<string, number>();

export async function POST(request: Request) {
  const identity = await identify(request);
  if ((!identity || identity.viaCookie) && !sameOrigin(request)) return Response.json({ error: "Use the website to write the recap." }, { status: 403 });
  if (!identity && enforcing()) return unauthorized("Sign in to write the recap.");
  const ip = identity?.user.id ?? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  const hour = Math.floor(Date.now() / 3_600_000); const key = `${ip}:${hour}`;
  if ((attempts.get(key) ?? 0) >= 10) return Response.json({ error: "Recap writing is busy. Try again later." }, { status: 429 });
  attempts.set(key, (attempts.get(key) ?? 0) + 1);
  try {
    const body = await request.json();
    const season = String(body.season ?? "").slice(0, 60); const week = Number(body.week);
    if (!season || !Number.isInteger(week) || week < 1 || week > 60) return Response.json({ error: "Season and week are required." }, { status: 400 });
    const result = await writeRecap(season, week, body.force === true);
    if (!result) return Response.json({ error: "That week has not been ingested." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    console.error("Recap failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "The recap could not be written right now." }, { status: 503 });
  }
}

import { generateText } from "ai";
import { allow } from "@/lib/rate-limit";
import { z } from "zod";
import { identify, isTeammate, unauthorized } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/scorebook-server";
import { bestLineup, evaluate, firstMoverNote } from "@/lib/league/lineup";

const bowler = z.object({ name: z.string().max(60), average: z.number().min(0).max(300), handicap: z.number().int().min(0).max(120), known: z.array(z.number().int().min(0).max(300)).length(3).optional() });
const body = z.object({ lane: z.enum(["odd", "even"]), opponent: z.string().max(60), ours: z.array(bowler).length(4), theirs: z.array(bowler).length(4) });

/** The coach's take on a lineup. The math is done here; the model only explains it in plain words. */
export async function POST(request: Request) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in for the draft.");
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website for the draft." }, { status: 403 });
  if (!await isTeammate(identity)) return Response.json({ error: "The draft is for team members." }, { status: 403 });
  if (!allow(`lineup:${identity.user.id}`, 12, 10 * 60_000)) return Response.json({ error: "That is plenty of coaching for ten minutes. Bowl a bit and come back." }, { status: 429 });
  let input; try { input = body.parse(await request.json()); } catch { return Response.json({ error: "That lineup did not look right." }, { status: 400 }); }
  try {
    const current = evaluate(input.ours, input.theirs);
    const best = bestLineup(input.ours, input.theirs);
    const facts = [
      `We are on the ${input.lane} lane${input.lane === "odd" ? " (we hand names in first, they stack against us)" : " (they handed names in first; we choose our order knowing theirs)"}. Opponent: ${input.opponent}.`,
      `Their four in lane order: ${input.theirs.map((b, i) => `${i + 1}. ${b.name} avg ${b.average} hdcp ${b.handicap}`).join("; ")}.`,
      `Our order as it stands: ${input.ours.map((b, i) => `${i + 1}. ${b.name} avg ${b.average} hdcp ${b.handicap}${b.known ? ` (pre-bowled ${b.known.join(", ")}, scores already locked)` : ""}`).join("; ")}.`,
      `Head-to-head math (1 point per game per bowler, 1 for series, 16 total): this order expects ${current.expected} points. Matchups: ${current.pairings.map(p => `${p.ours.name} vs ${p.theirs.name}: edge ${p.edge >= 0 ? "+" : ""}${p.edge} pins with handicap, expects ${p.expected}`).join("; ")}.`,
      input.lane === "even" ? `Best possible order: ${best.order.map(b => b.name).join(", ")} expects ${best.expected}.` : firstMoverNote(input.ours),
    ].join("\n");
    const { text } = await generateText({
      model: "google/gemini-2.5-flash",
      maxOutputTokens: 3000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
      system: "You are the strategy coach for a four-man Thursday night bowling team. Plain language, direct, 60 to 100 words, no markdown, no lists, no headers. Use only the numbers given; never invent averages or history. Say which matchup is the swing, which one we should not waste a good bowler on, and the one thing to do with the order. If we are on the odd lane, say plainly that order cannot buy points and what steadiness means tonight. A pre-bowled bowler's scores are already final: treat that pairing as settled math, not a hope.",
      prompt: facts,
    });
    return Response.json({ take: text.trim(), expected: current.expected, best: input.lane === "even" ? { order: best.order.map(b => b.name), expected: best.expected } : null });
  } catch (error) {
    console.error("Lineup take failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "The coach is not answering right now. The numbers above still stand." }, { status: 503 });
  }
}

import { generateText } from "ai";
import { allow } from "@/lib/rate-limit";
import { z } from "zod";
import { access, decide, denied, identify, unauthorized } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/scorebook-server";
import { uuidSchema } from "@/lib/scorebook";
import { BOWLERS } from "@/lib/season";
import { profileSchema, reviewSchema, type Review, type Tag } from "@/lib/review/schema";
import { candidateIdeas } from "@/lib/review/ideas";
import { factsText } from "@/lib/review/facts";
import { loadNight, loadReviewAndProfile, pickBowler } from "@/lib/review/server";

import { prepareConditionalSave, ReviewConflict, conflictResponse } from "@/lib/review/conditional-save";

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.object({ bowler: z.number().int().min(0).max(3), review: reviewSchema, answer: z.string().max(1000).optional(), expectedReview: reviewSchema.optional(), expectedProfile: profileSchema.optional() });
const turnSchema = z.object({ summary: z.string().min(1).max(900), question: z.string().max(240).default(""), ideaKeys: z.array(z.string()).max(3).default([]), closing: z.string().max(300).default("") });

/**
 * One coach turn. The model sees numbers, tags and the bowler's own words, and may only pick ideas from the
 * curated library by key, so every suggestion carries a real source. First turn: summary + one question.
 * After the bowler answers: a short close with one thing to aim for.
 */
export async function POST(request: Request, context: Context) {
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in to talk it through.");
  if (identity.viaCookie && !sameOrigin(request)) return Response.json({ error: "Use the website for the debrief." }, { status: 403 });
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid night link." }, { status: 400 });
  const verdict = decide("read", await access(identity, id.data), true);
  if (verdict.status !== 200) return denied(verdict);
  if (!allow(`debrief:${identity.user.id}`, 12, 10 * 60_000)) return Response.json({ error: "That is plenty of coaching for ten minutes. Bowl a bit and come back." }, { status: 429 });
  let body; try { body = bodySchema.parse(await request.json()); } catch { return Response.json({ error: "That did not look right." }, { status: 400 }); }
  try {
    const pending = await prepareConditionalSave(id.data, identity.user.id, body);
    const loaded = await loadNight(id.data);
    if (!loaded) return Response.json({ error: "Night not found." }, { status: 404 });
    const mine = await loadReviewAndProfile(id.data, identity.user.id);
    const bowler = pickBowler(body.bowler, mine.bowler, mine.bowlerName, loaded.night);
    const review: Review = { ...body.review, debrief: [...body.review.debrief] };
    if (review.debrief.length + (body.answer?.trim() ? 2 : 1) > 8) return Response.json({ error: "That is plenty for one night. Pick it up next week." }, { status: 400 });
    const now = new Date().toISOString();
    if (body.answer?.trim()) review.debrief.push({ role: "bowler", text: body.answer.trim(), at: now });

    const tags = new Set<Tag>(review.games.flatMap(g => g.tags));
    const candidates = candidateIdeas(tags);
    const offered = new Set(review.debrief.flatMap(t => t.ideas?.map(i => i.key) ?? []));
    const fresh = candidates.filter(c => !offered.has(c.key));
    const facts = factsText(loaded.night, bowler, review, mine.profile, null);
    const closing = review.debrief.some(t => t.role === "bowler");
    const language = mine.profile.language;
    const transcript = review.debrief.map(t => `${t.role === "coach" ? "Coach" : BOWLERS[bowler]}: ${t.text}${t.question ? ` ${t.question}` : ""}`).join("\n");

    const { text } = await generateText({
      model: "google/gemini-2.5-flash",
      maxOutputTokens: 4000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(40_000),
      system: `You are a friendly bowling coach debriefing one bowler after league night. Plain language${language === "technical" ? ", technical terms welcome" : ", no jargon (say 'the lane dried out', not 'oil breakdown')"}. Warm, direct, never preachy, one light joke at most. Use ONLY the facts given; never invent scores, frames, or events. If a night was bad, lead with what held up, then one honest observation. Ideas: pick ONLY from the candidate list by key, at most ${closing ? 1 : 2}, none if nothing fits; they are things to try, never a diagnosis. ${closing ? "This is the closing turn: in SUMMARY, acknowledge the bowler's answer in one sentence and say what it points to. In CLOSING, give ONE concrete target for next week that comes from the numbers. No question." : "Ask exactly ONE short follow-up question that would narrow the cause (before or after, which lane, which ball, did it change when you moved)."}
Reply in exactly this shape, plain text, one item per line, no markdown:
SUMMARY: <${closing ? "40 to 80" : "70 to 120"} words>
QUESTION: <the one question${closing ? ", leave empty" : ""}>
IDEAS: <comma-separated keys from the candidate list, or none>
CLOSING: <${closing ? "one concrete target for next week with a number in it (a series, a first-ball average, a spare count), under 25 words, no preamble" : "leave empty"}>`,
      prompt: `${facts}\n\nCandidate ideas (key: text):\n${fresh.length ? fresh.map(i => `${i.key}: ${i[language]}`).join("\n") : "(none fit)"}\n\n${transcript ? `Conversation so far:\n${transcript}\n` : ""}`,
    });
    const turn = turnSchema.parse(parseTurn(text));
    const ideas = turn.ideaKeys.map(k => fresh.find(i => i.key === k)).filter((i): i is NonNullable<typeof i> => !!i).map(i => ({ key: i.key, text: i[language], source: i.source, url: i.url, agree: i.agree }));
    review.debrief.push({ role: "coach", text: closing && turn.closing ? `${turn.summary}\n\nAim for next week: ${turn.closing}` : turn.summary, question: closing ? undefined : turn.question || undefined, ideas: ideas.length ? ideas : undefined, at: new Date().toISOString() });
    if (closing) review.closed = true;
    await pending.checkProfile();
    await pending.review(review, bowler);
    return Response.json({ review });
  } catch (error) {
    if (error instanceof ReviewConflict) return conflictResponse();
    console.error("Debrief failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "The coach is not answering right now. Keep your notes and try again in a minute." }, { status: 503 });
  }
}

/** Labeled lines survive quotes and newlines that break JSON from a chat model. */
function parseTurn(text: string) {
  const grab = (label: string) => { const m = text.match(new RegExp(`^\\s*${label}:\\s*([\\s\\S]*?)(?=^\\s*(?:SUMMARY|QUESTION|IDEAS|CLOSING):|(?![\\s\\S]))`, "mi")); return (m?.[1] ?? "").trim(); };
  const ideas = grab("IDEAS").toLowerCase().split(/[,\s]+/).map(k => k.trim()).filter(k => k && k !== "none");
  return { summary: grab("SUMMARY"), question: grab("QUESTION"), ideaKeys: ideas, closing: grab("CLOSING") };
}

import { extractPdfText } from "@/lib/league/pdf-text";
import { ingestStandingsText } from "@/lib/league/ingest";
import { identify, isAdmin, unauthorized } from "@/lib/auth-server";
import { sameOrigin } from "@/lib/scorebook-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Please upload from the standings page." }, { status: 403 });
  const identity = await identify(request);
  if (!identity) return unauthorized("Sign in as the BA4L admin to upload standings.");
  if (!isAdmin(identity.user.email)) return Response.json({ error: "Only the BA4L admin can upload standings." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("pdf");
    if (!(file instanceof File) || file.type !== "application/pdf" || !file.size || file.size > 12_000_000) return Response.json({ error: "Choose a PDF standings sheet under 12 MB." }, { status: 400 });
    const text = await extractPdfText(await file.arrayBuffer());
    const result = await ingestStandingsText(text, file.name);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Standings upload failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: error instanceof Error ? error.message : "Could not read that standings PDF." }, { status: 400 });
  }
}

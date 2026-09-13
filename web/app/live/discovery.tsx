"use client";

import { useEffect, useState } from "react";
import { OriginLink as Link } from "@/app/components/crumbs";
import { Radio, ArrowUpRight } from "lucide-react";
import { z } from "zod";
import "./discovery.css";

class DiscoveryError extends Error {}

const responseSchema = z.object({
  configured: z.boolean(),
  sessions: z.array(z.object({
    scorebookId: z.string().uuid(), kind: z.enum(["prebowl", "league", "practice"]),
    week: z.number().int().min(1).max(60).nullable(), bowlers: z.array(z.string().max(80)).max(4),
    cameraCount: z.number().int().min(1),
  })).max(64),
});
export type LiveSessionSummary = z.infer<typeof responseSchema>["sessions"][number];

/** Presence comes from published camera tracks, never from score timestamps. */
export default function LiveDiscovery({ excludeId }: { excludeId?: string }) {
  const [data, setData] = useState<z.infer<typeof responseSchema> | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: AbortController | undefined;
    const load = async () => {
      if (disposed || document.hidden) return;
      const abort = new AbortController(); current = abort;
      try {
        const response = await fetch("/api/live/sessions", { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new DiscoveryError(response.status === 401 ? "Sign in to see the team’s live cameras." : "We couldn’t check who’s live. Try again.");
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new DiscoveryError("We couldn’t read the live sessions. Try again.");
        if (!disposed && !abort.signal.aborted) { setData(parsed.data); setError(""); }
      } catch (cause) {
        if (!disposed && !abort.signal.aborted) {
          setData(null); // An old camera must never keep its LIVE badge after a failed refresh.
          setError(cause instanceof DiscoveryError ? cause.message : "We couldn’t check who’s live. Try again.");
        }
      } finally {
        if (current === abort) current = undefined;
        if (!disposed && !abort.signal.aborted && !document.hidden) timer = setTimeout(() => void load(), 15000);
      }
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      current?.abort(); current = undefined;
      setData(null);
      if (!document.hidden) void load();
    };
    void load(); document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; current?.abort(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [retry]);
  const sessions = data?.configured ? data.sessions.filter(session => session.scorebookId !== excludeId) : [];
  if (excludeId && data?.configured && sessions.length === 0) return null;
  return <section className="live-discovery" aria-label="Team live cameras">
    <div className="live-discovery-heading"><Radio size={18} aria-hidden="true"/><h2>At the lanes</h2><span>Team cameras</span></div>
    {sessions.map(session => <Link key={session.scorebookId} className="live-discovery-link" href={`/live?night=${encodeURIComponent(session.scorebookId)}`}>
      <div><span className="live-discovery-badge">Live camera · {session.cameraCount} {session.cameraCount === 1 ? "view" : "views"}</span>
        <h3>{session.kind === "prebowl" ? `${session.bowlers.join(" & ")} · Pre-bowl` : session.kind === "league" ? "League night" : "Practice"}</h3>
        <p>{session.week ? `For league week ${session.week} · ` : ""}Watch with the team. Your camera stays off.</p></div>
      <span className="live-discovery-watch">Watch live <ArrowUpRight size={18} aria-hidden="true"/></span>
    </Link>)}
    {!data && !error && <p className="live-discovery-status" role="status">Checking the lanes…</p>}
    {data && !sessions.length && <p className="live-discovery-status">{!data.configured ? "Team video is being set up." : excludeId && data.sessions.length ? "You’re viewing the team’s active scorebook." : "No cameras live right now. A teammate appears here when they share a lane camera."}</p>}
    {error && <div className="live-discovery-status" role="status"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry live cameras</button></div>}
  </section>;
}

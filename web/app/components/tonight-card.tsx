"use client";
import { useEffect, useState } from "react";
import { CircleDot, Swords } from "lucide-react";
import type { Tonight } from "@/lib/league/tonight";

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function useTonight() {
  const [tonight, setTonight] = useState<Tonight | null>(null);
  useEffect(() => { void (async () => {
    try { const r = await fetch("/api/league/tonight", { cache: "no-store" }); if (r.ok) setTonight(await r.json()); } catch { /* optional: the page works without it */ }
  })(); }, []);
  return tonight;
}

/** Opens tonight's shared scorebook, creating it with the match preset on the first tap. */
export function StartTonight({ tonight, className = "primary start-button" }: { tonight: Tonight; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/league/tonight", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      window.location.assign(`/night?night=${encodeURIComponent(d.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start tonight."); setBusy(false); }
  };
  return <>
    <button className={className} onClick={() => void start()} disabled={busy}><CircleDot size={16}/> {busy ? "Opening…" : tonight.nightId ? "Open tonight’s scorebook" : "Start scoring tonight"}</button>
    {error && <p className="photo-error" role="alert">{error}</p>}
  </>;
}

/** League night at a glance: who, where, when. On the night itself it is the way into the scorebook. */
export function TonightCard({ tonight, currentId }: { tonight: Tonight; currentId?: string }) {
  const laneNote = tonight.lane === "odd" ? "odd lane, we hand names in first" : "even lane, we see their four first";
  const scoringIt = !!currentId && currentId === tonight.nightId;
  return <section className="card tonight-card" aria-label={tonight.leagueNight ? "Tonight's match" : "Next match"}>
    <div className="eyebrow"><Swords size={13}/> {tonight.leagueNight ? "LEAGUE NIGHT · TONIGHT" : `NEXT UP · ${dayLabel(tonight.date).toUpperCase()}`}</div>
    <h2>Week {tonight.week} vs <em>{title(tonight.opponent.name)}</em></h2>
    <p>Lanes {tonight.lanes} · {tonight.time} · {laneNote}</p>
    {tonight.opponent.bowlers.length > 0 && <p className="tonight-roster">{tonight.opponent.bowlers.slice(0, 4).map(b => `${title(b.name.split(" ")[0])} ${b.average}`).join(" · ")}</p>}
    {tonight.leagueNight && !scoringIt && <StartTonight tonight={tonight}/>}
  </section>;
}

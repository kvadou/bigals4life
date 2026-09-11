"use client";
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";

export default function Recap({ season, week, initial }: { season: string; week: number; initial: string | null }) {
  const [recap, setRecap] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const write = async (force: boolean) => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/league/recap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ season, week, force }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      setRecap(d.recap);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not write the recap."); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(recap); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Copy failed. Select the text and copy it."); } };
  return <section className="league-section" aria-label="Weekly recap">
    <div className="eyebrow"><Sparkles size={15}/> WEEK {week} RECAP · WRITTEN FROM THE SHEET</div>
    {recap ? <div className="recap-card"><p className="recap-text">{recap}</p><div className="photo-actions"><button className="secondary" onClick={() => void copy()}><Copy size={15}/> {copied ? "Copied" : "Copy for email"}</button><button className="secondary" disabled={busy} onClick={() => void write(true)}>{busy ? "Rewriting…" : "Rewrite"}</button></div></div>
      : <div className="recap-card"><p className="score-note">No recap yet for this week.</p><button className="primary recap-button" disabled={busy} onClick={() => void write(false)}>{busy ? "Writing…" : "Write this week's recap"}</button></div>}
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section>;
}

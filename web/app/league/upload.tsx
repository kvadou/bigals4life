"use client";

import { FileUp, ShieldCheck } from "lucide-react";
import { useMe } from "../account";
import { useRef, useState } from "react";

type Result = { season: string; week: number; teams: number; bowlers: number; warnings: string[]; ours: { place: number; pointsWon: number; pointsLost: number } | null };

export default function LeagueUpload() {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!me || !me.admin) return null;
  const upload = async (file: File) => {
    setBusy(true); setMessage(""); setError("");
    try {
      const body = new FormData(); body.append("pdf", file);
      const response = await fetch("/api/league/upload", { method: "POST", body });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      const ours = data.ours ? ` Big Al's is ${data.ours.place}${data.ours.place === 1 ? "st" : data.ours.place === 2 ? "nd" : data.ours.place === 3 ? "rd" : "th"} with ${data.ours.pointsWon}-${data.ours.pointsLost}.` : "";
      setMessage(`Week ${data.week} is live: ${data.teams} teams and ${data.bowlers} bowlers imported.${ours}${data.warnings.length ? ` ${data.warnings.length} parser warning${data.warnings.length === 1 ? "" : "s"} saved for review.` : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload that PDF."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <section className="league-section league-upload" aria-label="Upload standings">
    <div className="eyebrow"><FileUp size={16}/> ADMIN IMPORT</div>
    <div className="league-upload-copy"><div><h2>Update standings</h2><p>Upload Gary&rsquo;s weekly PDF. The app reads the sheet and updates teams, bowlers, records, and reconciliation in one step.</p></div><ShieldCheck size={28} aria-hidden="true"/></div>
    <input ref={input} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
    <button className="primary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Reading standings…" : "Choose Week PDF"}</button>
    <p className="score-note">PDF only, up to 12 MB. Re-uploading a week safely replaces its standings.</p>
    {message && <p className="photo-success" role="status">{message}</p>}
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section>;
}

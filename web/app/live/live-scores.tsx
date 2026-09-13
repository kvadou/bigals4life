"use client";

import { useEffect, useState } from "react";
import { analyze, maximum } from "@/lib/bowling";
import { nightSchema, type Night } from "@/lib/scorebook";
import { BOWLERS } from "@/lib/season";

class ScoreLoadError extends Error {}

export type LiveScoreContext = { night: Night; canPublish: boolean };
type Snapshot = { id: string; night: Night; at: number; canPublish: boolean };
type Failure = { id: string; message: string };

/** Read-only authorized scorebook polling. Never writes scores or uses a stale night's data. */
export default function LiveScores({ scorebookId, onContext }: { scorebookId: string; onContext?: (context: LiveScoreContext | null) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch(`/api/nights/${encodeURIComponent(scorebookId)}`, { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            if (!abort.signal.aborted) setSnapshot(null);
            throw new ScoreLoadError(response.status === 401 ? "Sign in again to see the scores." : response.status === 403 ? "Scorebook access is no longer available." : "This scorebook could not be found.");
          }
          throw new ScoreLoadError("Scores could not refresh. Check your connection.");
        }
        const data = await response.json();
        const parsed = nightSchema.safeParse(data.state);
        if (!parsed.success) throw new ScoreLoadError("The latest scores could not be read. Try refreshing.");
        if (!abort.signal.aborted) { setSnapshot({ id: scorebookId, night: parsed.data, at: Date.now(), canPublish: data.role === "owner" || data.role === "editor" }); setFailure(null); }
      } catch (cause) {
        if (!abort.signal.aborted) setFailure({ id: scorebookId, message: cause instanceof ScoreLoadError ? cause.message : "Scores could not refresh. Check your connection." });
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void load(), 5000);
      }
    };
    void load();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [scorebookId, retry]);

  const current = snapshot?.id === scorebookId ? snapshot : null;
  const error = failure?.id === scorebookId ? failure.message : null;
  useEffect(() => {
    onContext?.(current && !error ? { night: current.night, canPublish: current.canPublish } : null);
  }, [current, error, onContext]);
  const rows = current?.night.rolls.map((rolls, index) => {
    const state = analyze(rolls), final = current.night.finals?.[index];
    const playing = !current.night.prebowl || current.night.prebowl.bowlers.includes(index);
    return { name: BOWLERS[index], playing, score: final ?? (rolls.length ? state.score : null), complete: final != null || state.complete, max: final ?? maximum(rolls) };
  });
  return <aside className="live-scores" aria-label="Live scorebook scores">
    <div className="live-score-heading"><h2>Scores{current ? ` · Game ${current.night.game}` : ""}</h2><span>Read only</span></div>
    {!current && !error && <p className="live-score-status" role="status">Loading scores…</p>}
    {rows && <div className="live-score-grid">{rows.map((row, index) => <div key={index} className={`live-score-row${row.playing ? "" : " is-sitting"}`}><strong className="live-score-name">{row.name}</strong><span className="live-score-number">{row.playing ? row.score ?? "–" : "–"}</span><span className="live-score-detail">{!row.playing ? "Not bowling" : row.complete ? "Final" : `Max ${row.max}`}</span></div>)}</div>}
    {current && <p className="live-score-status">{error ? "Showing last loaded scores. " : "Updated "}{new Date(current.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>}
    {error ? <div className="live-score-error" role="status"><p>{error}</p><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry scores</button></div> : <p className="live-score-note">Refreshes every 5 seconds. Current scores include settled frames.</p>}
  </aside>;
}

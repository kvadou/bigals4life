"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Film, Share2 } from "lucide-react";
import { createLocalReplay, type ScoreMoment } from "./replay";
import "./replay.css";

export type ReplayPanelProps = { stream: MediaStream | null; sourceKey: string; scorebookId: string; moment: ScoreMoment | null };
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Explicit opt-in. Nothing leaves this browser until Download or Share is pressed. */
export default function ReplayPanel({ stream, sourceKey, scorebookId, moment }: ReplayPanelProps) {
  const [engine] = useState(() => createLocalReplay());
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const lastEvent = useRef<string | null>(null);
  const contextVersion = useRef(0);
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const trackId = stream?.getVideoTracks()[0]?.id;
  useEffect(() => {
    contextVersion.current++;
    lastEvent.current = moment?.id ?? null;
    setShareError(""); setSharing(false);
    const hide = () => { if (document.hidden) engine.stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { contextVersion.current++; document.removeEventListener("visibilitychange", hide); engine.dispose(); };
  }, [engine, sourceKey, scorebookId, trackId]); // Each different camera or scorebook needs a new opt-in.
  useEffect(() => {
    if (!moment || moment.id === lastEvent.current) return;
    lastEvent.current = moment.id;
    if (state.phase === "recording") engine.markMoment(moment);
  }, [engine, moment, state.phase]);
  useEffect(() => {
    if (!state.moment || typeof navigator.canShare !== "function") { setCanShare(false); return; }
    const file = new File([state.moment.blob], state.moment.filename, { type: state.moment.blob.type });
    setCanShare(navigator.canShare({ files: [file] }));
  }, [state.moment]);
  const enable = () => {
    if (!stream) return;
    lastEvent.current = moment?.id ?? null; setShareError(""); engine.start(stream);
  };
  const share = async () => {
    if (!state.moment || sharing) return;
    const clip = state.moment, version = contextVersion.current;
    setSharing(true); setShareError("");
    try { await navigator.share({ files: [new File([clip.blob], clip.filename, { type: clip.blob.type })], title: "BA4L Moment of the Night", text: `${clip.meta.label}. Recent camera footage; bowler and timing unconfirmed.` }); }
    catch (error) { if (version === contextVersion.current && !(error instanceof DOMException && error.name === "AbortError")) setShareError("Sharing didn’t finish. You can download the clip instead."); }
    finally { if (version === contextVersion.current) setSharing(false); }
  };
  return <section className="replay-panel" aria-label="Moment of the Night replay">
    <div className="replay-heading"><Film size={20} aria-hidden="true"/><h2>Moment of the Night</h2><span>On this device</span></div>
    <p className="replay-description">Enable silent local replays for this camera. A new score event can select a recent 5–10 second clip. It does not identify the bowler or confirm when the shot happened.</p>
    <div className="replay-controls">{state.phase === "recording" ? <button type="button" className="secondary" onClick={() => engine.stop()}>Stop replay capture</button> : <button type="button" className="secondary" disabled={!stream || !trackId} onClick={enable}>Enable local replays</button>}<p role="status">{state.notice || (stream ? "Replay capture is off." : "A live camera is needed before you can enable replays.")}</p></div>
    {state.moment && <div className="replay-moment">
      <div className="replay-moment-title"><h3>{state.moment.meta.label}</h3><span>Unconfirmed camera footage</span></div>
      <video key={state.moment.url} controls playsInline preload="metadata" src={state.moment.url} aria-label="Selected local camera replay"/>
      <p className="replay-timing">Camera clip: {time(state.moment.startedAt)}–{time(state.moment.endedAt)} ({Math.round((state.moment.endedAt - state.moment.startedAt) / 1000)} seconds). Score event received at {time(state.moment.meta.observedAt)}. Scores may arrive after the shot.</p>
      <div className="replay-actions"><a className="secondary" href={state.moment.url} download={state.moment.filename}><Download size={17} aria-hidden="true"/> Download clip</a>{canShare && <button type="button" className="secondary" disabled={sharing} onClick={() => void share()}><Share2 size={17} aria-hidden="true"/>{sharing ? "Sharing…" : "Share clip"}</button>}</div>
      {shareError && <p className="replay-share-error" role="alert">{shareError}</p>}
    </div>}
    <p className="replay-local-note">Temporary footage only. Changing cameras, leaving this page, or closing it clears the replay. Download or Share saves a copy. No automatic upload.</p>
  </section>;
}

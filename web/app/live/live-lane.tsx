"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OriginLink as Link } from "@/app/components/crumbs";
import { Camera, Radio, Video, VideoOff } from "lucide-react";
import { createLocalVideoTrack, Room, RoomEvent, Track, type LocalVideoTrack, type RemoteVideoTrack } from "livekit-client";
import { Topbar } from "../components/topbar";
import { Crumbs } from "../components/crumbs";
import { liveConnection } from "./connection";
import LiveScores, { type LiveScoreContext } from "./live-scores";
import ReplayPanel from "./replay-panel";
import LiveStakesPanel from "./stakes";
import { scoreMoment, type ScoreMoment } from "@/lib/league/score-moment";
import LiveDiscovery from "./discovery";
import { BOWLERS } from "@/lib/season";
import "./live.css";

type Tile = { id: string; name: string; track: LocalVideoTrack | RemoteVideoTrack; local: boolean };
class LiveLaneError extends Error {}

type Status = "idle" | "joining" | "connected" | "reconnecting";
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function CameraTile({ tile }: { tile: Tile }) {
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    tile.track.attach(element);
    void element.play().catch(() => { if (active) setBlocked(true); });
    return () => { active = false; tile.track.detach(element); };
  }, [tile.track]);
  return <figure className="live-tile">
    <video ref={video} autoPlay playsInline muted aria-label={`${tile.name} camera`}/>
    {blocked && <button className="live-play" onClick={() => { void video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); }}>Play video</button>}
    <figcaption><Camera size={15} aria-hidden="true"/>{tile.local ? "Your camera" : tile.name}</figcaption>
  </figure>;
}

export default function LiveLane({ scorebookId }: { scorebookId: string }) {
  const [moment, setMoment] = useState<ScoreMoment | null>(null);
  const previousScore = useRef<{context: LiveScoreContext; at: number} | null>(null);
  const [replaySource, setReplaySource] = useState("");
  const [context, setContext] = useState<LiveScoreContext | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<"watch" | "publish">("watch");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [error, setError] = useState("");
  const current = useRef<ReturnType<typeof liveConnection<LocalVideoTrack>> | null>(null);
  const roomRef = useRef<Room | null>(null);
  const health = useRef<{ timer: ReturnType<typeof setInterval>; abort: AbortController } | null>(null);
  const active = useRef(true);
  const valid = validId(scorebookId);
  const scorebookLink = `/night?night=${encodeURIComponent(scorebookId)}`;

  const release = () => {
    if (health.current) { clearInterval(health.current.timer); health.current.abort.abort(); health.current = null; }
    const connection = current.current;
    current.current = null;
    roomRef.current?.removeAllListeners();
    roomRef.current = null;
    connection?.dispose();
  };
  useEffect(() => {
    active.current = true;
    setStatus("idle"); setTiles([]); setError(""); setMode("watch"); setContext(null);
    const hide = () => { release(); setStatus("idle"); setTiles([]); };
    window.addEventListener("pagehide", hide);
    return () => { active.current = false; window.removeEventListener("pagehide", hide); release(); };
  }, [scorebookId]);

  const leave = () => { release(); setStatus("idle"); setTiles([]); setError(""); };
  const join = async (requestedMode: "watch" | "publish") => {
    if (!valid || current.current) return;
    setError(""); setTiles([]); setMode(requestedMode); setStatus("joining");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let ready = false;
    const syncTiles = () => {
      if (!active.current || roomRef.current !== room) return;
      const next: Tile[] = [];
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          const track = publication.videoTrack;
          if (track && publication.isSubscribed && !publication.isMuted) next.push({ id: publication.trackSid, name: participant.name || "Teammate", track, local: false });
        }
      }
      for (const publication of room.localParticipant.videoTrackPublications.values()) {
        if (publication.videoTrack && !publication.isMuted) next.push({ id: publication.trackSid, name: "Your camera", track: publication.videoTrack, local: true });
      }
      setTiles(next);
    };
    const stillCurrent = () => active.current && roomRef.current === room;
    room.on(RoomEvent.TrackSubscribed, syncTiles).on(RoomEvent.TrackUnsubscribed, syncTiles)
      .on(RoomEvent.TrackMuted, syncTiles).on(RoomEvent.TrackUnmuted, syncTiles)
      .on(RoomEvent.LocalTrackPublished, syncTiles).on(RoomEvent.LocalTrackUnpublished, syncTiles)
      .on(RoomEvent.TrackSubscriptionFailed, () => { if (stillCurrent()) setError("A teammate’s camera could not load. Leave and join again to retry."); })
      .on(RoomEvent.ParticipantDisconnected, syncTiles).on(RoomEvent.ParticipantNameChanged, syncTiles)
      .on(RoomEvent.Reconnecting, () => { if (stillCurrent()) setStatus("reconnecting"); })
      .on(RoomEvent.SignalReconnecting, () => { if (stillCurrent()) setStatus("reconnecting"); })
      .on(RoomEvent.Reconnected, () => { if (stillCurrent()) { setStatus("connected"); syncTiles(); } })
      .on(RoomEvent.Disconnected, () => {
        if (!stillCurrent() || !ready) return;
        release(); setStatus("idle"); setTiles([]); setError("The live connection ended. Join again when you’re ready.");
      });
    const connection = liveConnection({
      async connect(signal) {
        const response = await fetch("/api/live/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scorebookId, mode: requestedMode }), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) {
          if (response.status === 401) throw new LiveLaneError("Please sign in again, then return to this scorebook.");
          if (response.status === 403) throw new LiveLaneError(requestedMode === "publish" ? "Sharing a camera requires permission to edit this scorebook. You can still try watching." : "This scorebook is available to its teammates. Ask an owner to add you.");
          throw new LiveLaneError("Live Lane is unavailable right now. Try again shortly.");
        }
        const data = await response.json();
        if (signal.aborted) return;
        if (typeof data.serverUrl !== "string" || typeof data.participantToken !== "string") throw new LiveLaneError("Could not start the live connection. Try again.");
        await room.connect(data.serverUrl, data.participantToken);
      },
      disconnect: () => room.disconnect(true),
      createCamera: () => createLocalVideoTrack({ facingMode: "environment", resolution: { width: 1280, height: 720 } }),
      publish: async camera => { await room.localParticipant.publishTrack(camera, { source: Track.Source.Camera }); },
    });
    current.current = connection;
    try {
      await connection.start(requestedMode === "publish");
      if (stillCurrent() && !connection.cancelled) {
        ready = true; setStatus("connected"); syncTiles();
        const checkAbort = new AbortController();
        let checking = false;
        const timer = setInterval(() => {
          if (!stillCurrent() || checking) return;
          checking = true;
          void fetch("/api/live/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scorebookId, mode: requestedMode }), signal: AbortSignal.any([checkAbort.signal, AbortSignal.timeout(15000)]) })
            .then(response => { if (!response.ok) throw new Error("Access check failed"); })
            .catch(() => {
              if (!stillCurrent() || checkAbort.signal.aborted) return;
              release(); setStatus("idle"); setTiles([]);
              setError("We couldn’t confirm your scorebook access, so the live connection stopped. Join again to retry.");
            }).finally(() => { checking = false; });
        }, 60000);
        health.current = { timer, abort: checkAbort };
      }
    } catch (cause) {
      if (!stillCurrent()) return;
      release(); setStatus("idle"); setTiles([]);
      const denied = cause instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(cause.name);
      setError(denied ? "Camera access wasn’t allowed. Enable it in your browser settings, or join to watch." : cause instanceof LiveLaneError ? cause.message : "Could not connect. Check your connection and try again.");
    }
  };

  useEffect(() => {
    if (status !== "connected" || !context) { previousScore.current = null; setMoment(null); return; }
    const now = Date.now(), previous = previousScore.current;
    if (previous && now - previous.at <= 12000) {
      const candidate = scoreMoment(previous.context.night, context.night, now);
      if (candidate) setMoment(candidate);
    }
    previousScore.current = {context, at: now};
  }, [context, status, scorebookId]);
  const replayTile = status === "connected" ? (tiles.find(tile => tile.id === replaySource) ?? (tiles.length === 1 ? tiles[0] : null)) : null;
  const replayTrack = replayTile?.track.mediaStreamTrack ?? null;
  const replayStream = useMemo(() => replayTrack ? new MediaStream([replayTrack]) : null, [replayTrack]);
  const pre = context?.night.prebowl;
  const contextTitle = pre ? `${pre.bowlers.map(i => BOWLERS[i]).join(" & ")} · Pre-bowl week ${pre.week}` : context?.night.match ? `League week ${context.night.match.week}` : "Practice camera";
  return <main className={`live-page${status === "connected" || status === "reconnecting" ? " live-active" : ""}`}>
    <Topbar/>
    <Crumbs items={[{ label: "Scorebook", href: valid ? scorebookLink : "/night" }, { label: "Live Lane" }]}/>
    <section className="intro"><div><div className="eyebrow"><Radio size={14} aria-hidden="true"/> LIVE LANE</div><h1>The team, <em>at the lane.</em></h1><p>Watch a teammate’s camera or share the view from your lane.</p></div></section>
    {status === "idle" && <LiveDiscovery excludeId={scorebookId}/>}
    {!valid ? <section className="live-empty"><VideoOff size={32} aria-hidden="true"/><h2>Open a scorebook first</h2><p>Live Lane needs a shared scorebook so the right teammates can join.</p><Link className="primary" href="/night">Open scorebook</Link></section> : <>
      {context ? <section className="live-context" aria-label="Session context"><h2>{contextTitle}</h2><p>{pre ? "These scores belong to this pre-bowl’s league week. Watching does not change the scorebook." : context.night.match ? "Watch this league scorebook with the team." : "This scorebook has no league week attached. If you’re pre-bowling, set the week before sharing your camera."}</p>{!pre && !context.night.match && <Link href={scorebookLink}>Set up a pre-bowl in the scorebook ›</Link>}</section> : <p className="live-context-loading" role="status">Camera sharing is available once the scorebook and your edit access are verified.</p>}
      <section className="live-controls" aria-label="Live connection">
        <div role="status" aria-live="polite"><strong>{status === "joining" ? "Joining…" : status === "reconnecting" ? "Reconnecting…" : status === "connected" ? mode === "publish" ? "Your camera is shared" : "Watching live" : "Ready when you are"}</strong><p>{status === "reconnecting" ? "Keep this page open while the connection recovers." : "Video only. Your microphone stays off."}</p></div>
        <div className="live-actions">{status === "idle" ? <><button className="primary" onClick={() => void join("watch")}><Video size={18} aria-hidden="true"/> Join to watch</button><button className="secondary" disabled={!context?.canPublish} onClick={() => void join("publish")}><Camera size={18} aria-hidden="true"/> {pre ? "Start live pre-bowl" : context?.night.match ? "Share league camera" : "Share practice camera"}</button></> : <button className="secondary" onClick={leave}>{status === "joining" ? "Cancel" : "Leave Live Lane"}</button>}</div>
      </section>
      {error && <div className="live-error" role="alert"><p>{error}</p></div>}
      <div className="live-stage"><div className="live-views">{tiles.length > 0 ? <section className="live-grid" aria-label="Live cameras">{tiles.map(tile => <CameraTile key={tile.id} tile={tile}/>)}</section> : <section className="live-empty"><Video size={36} aria-hidden="true"/><h2>{status === "idle" ? "A shared view of tonight" : status === "joining" ? "Connecting to the team" : "Waiting for a camera"}</h2><p>{status === "idle" ? "Join to watch without turning on your camera. Start a camera to let your teammates watch from home." : "A teammate’s video appears here when they share their camera."}</p></section>}
      </div><LiveScores scorebookId={scorebookId} onContext={setContext}/></div>
      {context && <LiveStakesPanel night={context.night}/>}
      {status === "connected" && tiles.length > 1 && <label className="replay-source">Replay camera<select value={replaySource} onChange={event => setReplaySource(event.target.value)}><option value="">Choose a camera</option>{tiles.map((tile,index) => <option key={tile.id} value={tile.id}>{tile.name} · Camera {index+1}</option>)}</select></label>}
      <ReplayPanel stream={replayStream} sourceKey={replayTile?.id ?? ""} scorebookId={scorebookId} moment={moment}/>
      <p className="live-note">Keep the publishing device awake and this page open. Leaving stops your camera and disconnects you.</p>
      <Link className="text-button live-back" href={scorebookLink}>Back to this scorebook ›</Link>
    </>}
    <footer><span>BA4L</span><span>Live Lane</span></footer>
  </main>;
}

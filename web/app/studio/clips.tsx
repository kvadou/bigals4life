"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Film, Square, Circle, Trash2 } from "lucide-react";
import { libraryFits, makeClip, revokeClip, ShotBuffer, startRecording, type Clip, type RecorderHandle } from "./media";
import type { CameraSource } from "./camera";

export default function Clips({ source, video, stopSignal }: { source: CameraSource | null; video: HTMLVideoElement | null; stopSignal: number }) {
  const [clips, setClips] = useState<Clip[]>([]); const library = useRef<Clip[]>([]);
  const [recording, setRecording] = useState(false); const [rolling, setRolling] = useState(false); const [preparing, setPreparing] = useState(false);
  const [seconds, setSeconds] = useState(0); const [notice, setNotice] = useState("");
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [speed, setSpeed] = useState(0.5);
  const playbackA = useRef<HTMLVideoElement>(null); const playbackB = useRef<HTMLVideoElement>(null);
  const recorder = useRef<RecorderHandle | null>(null); const ring = useRef<ShotBuffer | null>(null); const mounted = useRef(true); const generation = useRef(0);
  const save = (result: {blob: Blob; seconds: number} | null, label: string) => {
    if (!mounted.current) return;
    if (!result) { setNotice("The browser could not finish this clip. Try a shorter recording."); return; }
    if (!libraryFits(library.current, result.blob.size)) { setNotice("Clip shelf is full (12 clips or 256 MB). Download and delete a clip, then record again."); return; }
    const clip = makeClip(result.blob, result.seconds, label); library.current = [...library.current, clip]; setClips(library.current); setA(clip.id); setNotice("Clip saved in this tab. Download it before leaving or closing the page.");
  };
  const finish = () => { const handle = recorder.current; recorder.current = null; setRecording(false); if (handle) void handle.stop(); };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; recorder.current?.discard(); ring.current?.stop(); library.current.forEach(revokeClip); };
  }, []);
  useEffect(() => {
    generation.current++; finish(); ring.current?.stop(); ring.current = null; setRolling(false); setPreparing(false); setSeconds(0);
  }, [source?.id, stopSignal]); // A different camera never silently inherits capture permission.
  useEffect(() => {
    const hide = () => { if (document.hidden) { generation.current++; finish(); ring.current?.stop(); setRolling(false); setPreparing(false); setNotice("Capture stopped while this page was hidden. Saved clips stay here until you close the tab."); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => { if (!rolling) return; const timer = setInterval(() => setSeconds(ring.current?.seconds ?? 0), 500); return () => clearInterval(timer); }, [rolling]);
  const record = () => {
    if (!source) return;
    try {
      const handle = startRecording(source.stream); recorder.current = handle; setRecording(true); setNotice("Recording silently. Stops at 10 minutes; individual clips are limited to 128 MB.");
      void handle.finished.then(result => { if (recorder.current === handle) { recorder.current = null; if (mounted.current) setRecording(false); } save(result, "recording"); });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Recording could not start."); }
  };
  const rollingToggle = () => {
    if (rolling) { generation.current++; ring.current?.stop(); setRolling(false); setSeconds(0); return; }
    if (!video) return;
    try { ring.current = new ShotBuffer(); ring.current.start(video); setRolling(true); setNotice("Last-shot capture is on for this camera only. It keeps up to 10 seconds on this device."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Last-shot capture could not start."); }
  };
  const shot = async () => {
    if (!ring.current || !video || preparing) return;
    const current = generation.current; const buffer = ring.current; setPreparing(true);
    try {
      const result = await buffer.save();
      if (current !== generation.current || !mounted.current) return;
      save(result, "last-shot"); buffer.start(video);
    } catch (error) { if (mounted.current && current === generation.current) { setNotice(error instanceof Error ? error.message : "Shot could not be prepared."); setRolling(false); buffer.stop(); } }
    finally { if (mounted.current && current === generation.current) setPreparing(false); }
  };
  const first = clips.find(clip => clip.id === a), second = clips.find(clip => clip.id === b);
  const play = () => { for (const player of [playbackA.current, playbackB.current]) { if (player) { player.currentTime = 0; player.playbackRate = speed; void player.play().catch(() => setNotice("Tap the video play control to begin playback.")); } } };
  return <section className="studio-clips" aria-labelledby="clips-title">
    <div className="studio-section-head"><div><h2 id="clips-title"><Film size={21} aria-hidden="true"/> Your clip shelf</h2><p>Silent recordings, stored only in this tab. Nothing uploads automatically.</p></div><span className="studio-tag">{clips.length} / 12 clips</span></div>
    <div className="studio-capture-controls">
      <div><strong>{source ? `Source: ${source.name}` : "Choose a camera to capture"}</strong><p>Recording and last-shot capture are independent of who can watch.</p></div>
      <div className="studio-actions"><button className={recording ? "studio-danger" : "studio-primary"} disabled={!source && !recording} onClick={recording ? finish : record}>{recording ? <Square size={16}/> : <Circle size={16}/>} {recording ? "Stop & save recording" : "Start recording"}</button>
        <button disabled={!video || preparing} aria-pressed={rolling} onClick={rollingToggle}>{rolling ? "Disable last-shot capture" : "Enable last-shot capture"}</button>
        {rolling && <button disabled={preparing || seconds < 1} onClick={() => void shot()}>{preparing ? "Preparing clip…" : `Save last ${Math.max(1, Math.floor(seconds))} seconds`}</button>}
      </div>
      <p className="studio-caption">Last-shot capture: up to 10 seconds at 15 fps / 640 px. Preparing a clip takes about its duration; capture pauses while it is prepared. It does not detect bowlers or shot timing.</p>
      <p role="status" className="studio-notice">{notice || "Recording off. Last-shot capture off."}</p>
    </div>
    {clips.length > 0 ? <>
      <div className="studio-compare-controls"><label>First clip<select value={a} onChange={event => setA(event.target.value)}><option value="">Choose a clip</option>{clips.map((clip,index) => <option key={clip.id} value={clip.id}>Clip {index+1} · {clip.seconds.toFixed(1)} seconds</option>)}</select></label>
        <label>Compare with<select value={b} onChange={event => setB(event.target.value)}><option value="">No second clip</option>{clips.filter(clip => clip.id !== a).map((clip,index) => <option key={clip.id} value={clip.id}>{new Date(clip.createdAt).toLocaleTimeString()} · {clip.seconds.toFixed(1)}s</option>)}</select></label>
        <label>Playback speed<select value={speed} onChange={event => { const next = Number(event.target.value); setSpeed(next); [playbackA.current,playbackB.current].forEach(player => { if (player) player.playbackRate = next; }); }}><option value={1}>Normal</option><option value={0.5}>Half speed</option><option value={0.25}>Quarter speed</option></select></label><button onClick={play} disabled={!first}>Play from start</button></div>
      <div className="studio-comparison" data-pair={!!second}>{[first,second].map((clip,index) => clip ? <figure key={`${index}-${clip.id}`}><video ref={index ? playbackB : playbackA} controls playsInline muted src={clip.url} preload="metadata" onLoadedMetadata={event => { event.currentTarget.playbackRate = speed; }} aria-label={index ? "Second comparison clip" : "First comparison clip"}/><figcaption>{index ? "Second clip" : "First clip"} · {clip.seconds.toFixed(1)} seconds</figcaption></figure> : null)}</div>
      <ul className="studio-library">{clips.map((clip,index) => <li key={clip.id}><div><strong>Clip {index+1}</strong><span>{new Date(clip.createdAt).toLocaleTimeString()} · {clip.seconds.toFixed(1)}s · {(clip.blob.size / 1048576).toFixed(1)} MB</span></div><a href={clip.url} download={clip.name}><Download size={17}/> Download</a><button aria-label={`Delete clip ${index+1}`} onClick={() => { revokeClip(clip); library.current = library.current.filter(item => item.id !== clip.id); setClips(library.current); if (a === clip.id) setA(""); if (b === clip.id) setB(""); }}><Trash2 size={17}/> Delete</button></li>)}</ul>
    </> : <p className="studio-empty-clips">Your saved clips will appear here, ready for slow motion or side-by-side review.</p>}
    <p className="studio-caption">Leaving or reloading this page clears every clip. Download keeps a copy on your device. On a phone, turn landscape for side-by-side playback. Both clips start together; this is not frame-accurate synchronization.</p>
  </section>;
}

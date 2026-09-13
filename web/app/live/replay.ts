export type ScoreMoment = { id: string; label: string; observedAt: number };
export type SavedReplay = { meta: ScoreMoment; blob: Blob; url: string; startedAt: number; endedAt: number; filename: string };
export type ReplayState = { phase: "idle" | "recording" | "unavailable" | "error"; bufferedSeconds: number; clips: number; moment: SavedReplay | null; notice: string };
type Clip = { blob: Blob; startedAt: number; endedAt: number };
type Options = { clipMs?: number; maxAgeMs?: number; minMomentMs?: number; maxBytes?: number };

/** Independent video-only recordings. Never concatenates different recorder files. */
export function createLocalReplay(options: Options = {}) {
  const clipMs = options.clipMs ?? 10000, maxAgeMs = options.maxAgeMs ?? 30000;
  const minMomentMs = options.minMomentMs ?? 5000, maxBytes = options.maxBytes ?? 24 * 1024 * 1024;
  const listeners = new Set<() => void>();
  let state: ReplayState = { phase: "idle", bufferedSeconds: 0, clips: 0, moment: null, notice: "" };
  let enabledAt = 0;
  let generation = 0, stream: MediaStream | null = null, recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, startedAt = 0;
  let sourceMonitor: ReturnType<typeof setInterval> | undefined;
  let finishCurrent: (() => void) | undefined;
  let clips: Clip[] = [], pending: ScoreMoment | null = null, lastMomentId = "";
  let removeEnded: (() => void) | undefined;
  const update = (patch: Partial<ReplayState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const clearMoment = () => { if (state.moment) URL.revokeObjectURL(state.moment.url); };
  const prune = (now: number) => {
    clips = clips.filter(clip => now - clip.endedAt <= maxAgeMs);
    while (clips.length > Math.max(1, Math.ceil(maxAgeMs / clipMs) - 1) || clips.reduce((sum, clip) => sum + clip.blob.size, 0) > maxBytes) clips.shift();
    update({ clips: clips.length, bufferedSeconds: Math.round(clips.reduce((sum, clip) => sum + clip.endedAt - clip.startedAt, 0) / 1000) });
  };
  const save = (clip: Clip, meta: ScoreMoment) => {
    if (Date.now() - clip.endedAt > maxAgeMs) { update({ notice: "No recent footage is available for that score event." }); return; }
    clearMoment();
    const extension = clip.blob.type.includes("mp4") ? "mp4" : "webm";
    const stamp = new Date(clip.endedAt).toISOString().replace(/[:.]/g, "-");
    update({ moment: { ...clip, meta, url: URL.createObjectURL(clip.blob), filename: `BA4L-moment-${stamp}.${extension}` }, notice: "A score event selected this recent camera clip. The bowler and timing are unconfirmed." });
  };
  const stop = () => {
    generation++; pending = null; finishCurrent = undefined;
    if (sourceMonitor) clearInterval(sourceMonitor); sourceMonitor = undefined;
    if (timer) clearTimeout(timer); timer = undefined;
    removeEnded?.(); removeEnded = undefined;
    const previous = recorder; recorder = null;
    if (previous && previous.state !== "inactive") { try { previous.stop(); } catch {} }
    stream?.getTracks().forEach(track => track.stop()); stream = null; clips = [];
    update({ phase: "idle", clips: 0, bufferedSeconds: 0, notice: state.moment ? "Capture stopped. This moment is temporary until you download or share it." : "Replay capture is off." });
  };
  const fail = (notice: string) => { stop(); update({ phase: "error", notice }); };
  const begin = (session: number, mimeType: string) => {
    if (session !== generation || !stream) return;
    const chunks: Blob[] = []; let bytes = 0, exceeded = false;
    let current: MediaRecorder;
    try { current = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 }); }
    catch { fail("This browser couldn’t start a local replay. Live viewing still works."); return; }
    recorder = current; startedAt = Date.now(); const beginning = startedAt;
    let endingAt: number | undefined;
    finishCurrent = () => { if (current.state === "recording") { endingAt = Date.now(); current.stop(); } };
    current.ondataavailable = event => {
      if (session !== generation || exceeded || !event.data.size) return;
      bytes += event.data.size;
      if (bytes > Math.min(maxBytes, 8 * 1024 * 1024)) { exceeded = true; chunks.length = 0; fail("Replay capture stopped because the clip grew too large. Try enabling it again."); return; }
      chunks.push(event.data);
    };
    current.onerror = () => { if (session === generation) fail("Replay capture stopped unexpectedly. Try enabling it again."); };
    current.onstop = () => {
      if (session !== generation || exceeded) return;
      if (timer) clearTimeout(timer); timer = undefined;
      const endedAt = endingAt ?? Date.now();
      const blob = new Blob(chunks, { type: current.mimeType || mimeType });
      if (blob.size && endedAt - beginning >= minMomentMs) {
        const clip = { blob, startedAt: beginning, endedAt };
        clips.push(clip); prune(endedAt);
        if (pending) { const meta = pending; pending = null; save(clip, meta); }
      } else if (pending) {
        const meta = pending; pending = null; const latest = clips.at(-1);
        if (latest) save(latest, meta); else update({ notice: "Not enough footage yet. Keep replay capture on for the next score event." });
      }
      begin(session, mimeType);
    };
    try {
      current.start(1000);
      timer = setTimeout(() => { if (session === generation) finishCurrent?.(); }, clipMs);
    } catch { fail("This browser couldn’t record the camera. Live viewing still works."); }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start(source: MediaStream) {
      stop(); clearMoment(); enabledAt = Date.now(); lastMomentId = ""; update({ moment: null, notice: "" });
      if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") { update({ phase: "unavailable", notice: "Local replays aren’t supported in this browser. Live viewing still works." }); return; }
      const mime = ["video/webm;codecs=vp8", "video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm"].find(value => MediaRecorder.isTypeSupported(value));
      if (!mime) { update({ phase: "unavailable", notice: "No supported replay format is available in this browser." }); return; }
      const track = source.getVideoTracks().find(item => item.readyState === "live");
      if (!track) { update({ phase: "error", notice: "Wait for a live camera before enabling replays." }); return; }
      try { stream = new MediaStream([track.clone()]); }
      catch { update({ phase: "error", notice: "This camera couldn’t be used for local replays." }); return; }
      const ended = () => fail("The camera ended. Replay capture has stopped.");
      sourceMonitor = setInterval(() => { if (track.readyState !== "live") ended(); }, 250);
      track.addEventListener("ended", ended); removeEnded = () => track.removeEventListener("ended", ended);
      update({ phase: "recording", notice: "Keeping up to 30 seconds of silent camera footage on this device." });
      begin(generation, mime);
    },
    markMoment(meta: ScoreMoment) {
      if (state.phase !== "recording" || !recorder || meta.id === lastMomentId || !Number.isFinite(meta.observedAt)) return;
      const observedAt = Date.now();
      if (meta.observedAt < enabledAt || observedAt - meta.observedAt > 12000 || meta.observedAt - observedAt > 1000) { update({ notice: "That score event is too old to match with recent camera footage." }); return; }
      lastMomentId = meta.id; prune(observedAt);
      const safeMeta = { ...meta, label: meta.label.slice(0, 200) };
      if (pending && recorder.state === "inactive") { pending = safeMeta; return; }
      if (recorder.state === "recording" && observedAt - startedAt >= minMomentMs) { pending = safeMeta; if (timer) clearTimeout(timer); finishCurrent?.(); }
      else { const latest = clips.at(-1); if (latest) save(latest, safeMeta); else update({ notice: "Not enough footage yet. Keep replay capture on for the next score event." }); }
    },
    stop,
    dispose() { stop(); clearMoment(); update({ moment: null, notice: "" }); },
  };
}

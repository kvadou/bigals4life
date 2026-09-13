/** All footage stays in memory. No upload, persistence, or audio capture. */
export const MAX_CLIP_BYTES = 128 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 256 * 1024 * 1024;
export const MAX_RECORDING_MS = 10 * 60 * 1000;
export type Clip = { id: string; url: string; blob: Blob; name: string; seconds: number; createdAt: number };
export function recordingType() {
  return ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp8", "video/mp4", "video/webm"].find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}
export function makeClip(blob: Blob, seconds: number, label: string): Clip {
  const now = Date.now();
  return { id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob, seconds, createdAt: now, name: `BA4L-${label}-${new Date(now).toISOString().replace(/[:.]/g,"-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}` };
}
export function libraryFits(clips: Pick<Clip,"blob">[], bytes: number) { return clips.length < 12 && clips.reduce((total, clip) => total + clip.blob.size, 0) + bytes <= MAX_LIBRARY_BYTES; }
export function revokeClip(clip: Clip) { URL.revokeObjectURL(clip.url); }
/** Stop resolves only after the final dataavailable event, so every clip has its container header. */
export function startRecording(stream: MediaStream, onLimit: () => void = () => {}) {
  const type = recordingType();
  if (!type) throw new Error("Recording is not supported in this browser. Try Safari or Chrome on a supported device.");
  const recorder = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType: type, videoBitsPerSecond: 1_500_000 });
  const chunks: Blob[] = []; let bytes = 0; let disposed = false; let limit = false;
  const started = performance.now();
  let resolve!: (value: {blob: Blob; seconds: number} | null) => void;
  const finished = new Promise<{blob: Blob; seconds: number} | null>(done => { resolve = done; });
  const stop = () => { if (recorder.state !== "inactive") recorder.stop(); return finished; };
  const timer = setTimeout(() => { limit = true; void stop(); }, MAX_RECORDING_MS);
  recorder.ondataavailable = event => {
    if (!event.data.size || disposed) return;
    if (bytes + event.data.size > MAX_CLIP_BYTES) { disposed = true; chunks.length = 0; limit = true; void stop(); return; }
    chunks.push(event.data); bytes += event.data.size;
  };
  recorder.onerror = () => { disposed = true; if (recorder.state === "inactive") { clearTimeout(timer); chunks.length = 0; resolve(null); } else void stop(); };
  recorder.onstop = () => { clearTimeout(timer); resolve(disposed || !bytes ? null : { blob: new Blob(chunks, { type: recorder.mimeType }), seconds: (performance.now() - started) / 1000 }); chunks.length = 0; if (limit) onLimit(); };
  try { recorder.start(500); } catch (error) { clearTimeout(timer); throw error; }
  return { stop, finished, discard() { disposed = true; chunks.length = 0; void stop(); } };
}
export type RecorderHandle = ReturnType<typeof startRecording>;
/** A real sliding window of at most 150 decoded 640px frames, never fragmented media chunks. */
export class ShotBuffer {
  private frames: { bitmap: ImageBitmap; at: number }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending = false;
  private generation = 0;
  private exportRecorder: RecorderHandle | null = null;
  private exportStream: MediaStream | null = null;
  private exportingFrames: ImageBitmap[] = [];
  private alive = true;
  start(video: HTMLVideoElement) {
    if (typeof createImageBitmap !== "function" || typeof HTMLCanvasElement.prototype.captureStream !== "function") throw new Error("Last-shot capture is not supported by this browser.");
    this.stop(); this.alive = true; const generation = this.generation;
    const canvas = document.createElement("canvas"); const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not prepare last-shot capture.");
    let previousFrame = -1;
    this.timer = setInterval(async () => {
      if (this.pending || video.readyState < 2 || !video.videoWidth || !this.alive) return;
      const frame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;
      if (frame === previousFrame) return; previousFrame = frame;
      this.pending = true;
      try {
        const width = Math.min(640, video.videoWidth); const height = Math.max(2, Math.round(video.videoHeight * width / video.videoWidth / 2) * 2);
        // Portrait sources are also bounded to 640px on their longer side.
        const scale = Math.min(1, 640 / height); canvas.width = Math.max(2, Math.round(width * scale / 2) * 2); canvas.height = Math.max(2, Math.round(height * scale / 2) * 2);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        if (generation !== this.generation || !this.alive) { bitmap.close(); return; }
        const at = performance.now(); this.frames.push({ bitmap, at });
        while (this.frames.length > 150 || this.frames[0]?.at < at - 10000) this.frames.shift()!.bitmap.close();
      } catch { /* A temporarily unavailable frame is skipped, never substituted. */ }
      finally { this.pending = false; }
    }, 1000 / 15);
  }
  get seconds() { return this.frames.length > 1 ? (this.frames.at(-1)!.at - this.frames[0].at) / 1000 : 0; }
  async save() {
    if (this.frames.length < 15) throw new Error("Allow at least one second of camera footage before saving a shot.");
    if (this.exportRecorder) throw new Error("A shot is already being prepared.");
    if (this.timer) clearInterval(this.timer); this.timer = null; this.generation++;
    const frames = this.frames; this.frames = []; this.exportingFrames = frames.map(frame => frame.bitmap);
    const canvas = document.createElement("canvas"); canvas.width = frames[0].bitmap.width; canvas.height = frames[0].bitmap.height;
    const context = canvas.getContext("2d", { alpha: false })!; context.drawImage(frames[0].bitmap, 0, 0);
    const stream = canvas.captureStream(15); this.exportStream = stream;
    let recorder: RecorderHandle;
    try { recorder = startRecording(stream); this.exportRecorder = recorder; }
    catch (error) { stream.getTracks().forEach(track => track.stop()); this.exportStream = null; this.exportingFrames.forEach(frame => frame.close()); this.exportingFrames = []; throw error; }
    const generation = this.generation;
    try {
      const start = performance.now();
      for (const frame of frames) {
        const delay = frame.at - frames[0].at - (performance.now() - start);
        if (delay > 0) await new Promise(done => setTimeout(done, delay));
        if (!this.alive || generation !== this.generation) { recorder.discard(); return null; }
        context.drawImage(frame.bitmap, 0, 0);
      }
      return await recorder.stop();
    } finally {
      stream.getTracks().forEach(track => track.stop()); this.exportStream = null; this.exportRecorder = null;
      this.exportingFrames.forEach(frame => frame.close()); this.exportingFrames = [];
    }
  }
  stop() {
    this.alive = false; this.generation++;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.frames.forEach(frame => frame.bitmap.close()); this.frames = [];
    this.exportRecorder?.discard(); this.exportStream?.getTracks().forEach(track => track.stop());
  }
}

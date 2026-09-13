/** Actual canvas -> MediaRecorder -> playable Blob regression. No camera, microphone, or network.
 * Run: PLAYWRIGHT_MODULE=<playwright module path> bun tests/replay-browser.ts
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const out = process.env.REPLAY_QA_OUTPUT ?? "/tmp/ba4l-replay-qa";
await mkdir(out, { recursive: true });
const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../app/live/replay.ts")], target: "browser", format: "esm" });
if (!built.success) throw Error("Replay browser bundle failed");
const javascript = await built.outputs[0].text();
const modulePath = process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
const { chromium } = await import(modulePath);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Local replay synthetic camera test</h1><video controls muted playsinline width="480"></video><a id="download">Download tested clip</a></body></html>');
  const results = await page.evaluate(async (code: string) => {
    const w = window as any;
    const moduleURL = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const { createLocalReplay } = await import(moduleURL); URL.revokeObjectURL(moduleURL);
    const results: { test: string; okay: boolean; details?: unknown }[] = [];
    const check = (test: string, okay: boolean, details?: unknown) => { results.push({ test, okay, details }); if (!okay) throw Error(test); };
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (fn: () => boolean, timeout = 4000) => { const end = Date.now() + timeout; while (!fn()) { if (Date.now() > end) throw Error("Timed out waiting for recorder"); await wait(25); } };
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const paint = canvas.getContext("2d")!; let frame = 0;
    const drawing = setInterval(() => { paint.fillStyle = frame++ % 2 ? "#234e39" : "#e5bf69"; paint.fillRect(0, 0, 320, 180); paint.fillStyle = "white"; paint.fillText(`Synthetic frame ${frame}`, 20, 40); }, 40);
    const original = canvas.captureStream(15);
    const audioContext = new AudioContext(); const destination = audioContext.createMediaStreamDestination();
    original.addTrack(destination.stream.getAudioTracks()[0]);
    const nativeRecorder = window.MediaRecorder; const recordedKinds: string[][] = [], recordedStreams: MediaStream[] = [];
    w.MediaRecorder = class extends nativeRecorder { constructor(stream: MediaStream, options?: MediaRecorderOptions) { recordedKinds.push(stream.getTracks().map(track => track.kind)); recordedStreams.push(stream); super(stream, options); } };
    const revoked: string[] = [], originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = value => { revoked.push(value); originalRevoke(value); };
    const engine = createLocalReplay({ clipMs: 700, minMomentMs: 200, maxAgeMs: 2100 });
    try {
      w.MediaRecorder = undefined; engine.start(original); check("unsupported-is-safe", engine.getSnapshot().phase === "unavailable"); w.MediaRecorder = class extends nativeRecorder { constructor(stream: MediaStream, options?: MediaRecorderOptions) { recordedKinds.push(stream.getTracks().map(track => track.kind)); recordedStreams.push(stream); super(stream, options); } };
      const oldEventAt = Date.now() - 100;
      engine.start(original); engine.markMoment({ id: "early", label: "Too early", observedAt: Date.now() });
      check("insufficient-footage-no-fake-replay", engine.getSnapshot().moment === null);
      engine.markMoment({ id: "before-enable", label: "Old event", observedAt: oldEventAt });
      check("pre-enable-event-rejected", engine.getSnapshot().moment === null);
      await until(() => engine.getSnapshot().clips >= 1);
      engine.markMoment({ id: "strike-one", label: "Doug · strike", observedAt: Date.now() });
      await until(() => !!engine.getSnapshot().moment);
      const first = engine.getSnapshot().moment;
      check("independent-clip-real-bytes", first.blob.size > 0 && first.endedAt > first.startedAt, { bytes: first.blob.size, mime: first.blob.type });
      const video = document.querySelector("video")!; video.src = first.url; await video.play(); await until(() => video.videoWidth > 0 && video.getVideoPlaybackQuality().totalVideoFrames > 0);
      check("independent-clip-decodes", video.videoWidth === 320 && video.videoHeight === 180);
      engine.markMoment({ id: "strike-one", label: "Duplicate", observedAt: Date.now() }); check("duplicate-does-not-replace", engine.getSnapshot().moment.url === first.url);
      engine.markMoment({ id: "stale", label: "Stale", observedAt: Date.now() - 13000 }); check("stale-event-rejected", engine.getSnapshot().moment.meta.id === "strike-one");
      await wait(2300); check("rolling-buffer-bounded", engine.getSnapshot().clips <= 2, engine.getSnapshot().clips);
      await wait(250); engine.markMoment({ id: "spare-two", label: "Pete · spare", observedAt: Date.now() }); await until(() => engine.getSnapshot().moment?.meta.id === "spare-two");
      const saved = engine.getSnapshot().moment; check("old-URL-revoked-on-replacement", revoked.includes(first.url));
      engine.stop(); check("stop-retains-selected-local-moment", engine.getSnapshot().moment.url === saved.url && engine.getSnapshot().clips === 0);
      check("original-video-and-audio-survive-stop", original.getTracks().every(track => track.readyState === "live"));
      check("recorders-only-receive-video", recordedKinds.every(kinds => kinds.length === 1 && kinds[0] === "video"));
      check("all-capture-clones-stop", recordedStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended")));
      video.src = saved.url; await video.play(); await until(() => video.getVideoPlaybackQuality().totalVideoFrames > 0);
      const link = document.querySelector<HTMLAnchorElement>("#download")!; link.href = saved.url; link.download = saved.filename;
      w.qaSaved = saved; w.qaEngine = engine;
      const other = canvas.captureStream(15); engine.start(other); check("source-change-clears-moment", engine.getSnapshot().moment === null && revoked.includes(saved.url));
      other.getVideoTracks()[0].stop(); await until(() => engine.getSnapshot().phase === "error"); check("source-stop-without-ended-event-stops-capture", recordedStreams.at(-1)!.getVideoTracks()[0].readyState === "ended");
      let updates = 0; const unsubscribe = engine.subscribe(() => updates++); engine.dispose(); const before = updates; engine.start(original); check("subscriber-survives-context-reset", updates > before); unsubscribe();
      await wait(100); engine.dispose(); await wait(1000); check("late-recorder-events-cannot-resurrect", engine.getSnapshot().phase === "idle" && engine.getSnapshot().moment === null && engine.getSnapshot().clips === 0);
      const limited = createLocalReplay({ clipMs: 2000, minMomentMs: 200, maxBytes: 100 }); limited.start(original); await until(() => limited.getSnapshot().phase === "error"); limited.dispose(); check("oversized-clip-stops-safely", original.getVideoTracks()[0].readyState === "live");
      // Download uses a new URL only because the source-change test intentionally revoked the earlier one.
      const downloadURL = URL.createObjectURL(saved.blob); link.href = downloadURL; w.qaDownloadURL = downloadURL;
      return results;
    } finally { engine.dispose(); clearInterval(drawing); original.getTracks().forEach(track => track.stop()); await audioContext.close(); w.MediaRecorder = nativeRecorder; }
  }, javascript);
  const downloadPromise = page.waitForEvent("download"); await page.locator("#download").click(); const download = await downloadPromise;
  const path = `${out}/${download.suggestedFilename()}`; await download.saveAs(path);
  if (!(await Bun.file(path).size)) throw Error("Downloaded clip was empty");
  results.push({ test: "explicit-download-produces-real-file", okay: true });
  await page.screenshot({ path: `${out}/playable-synthetic-replay.png` });
  await Bun.write(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ checks: results.length, passed: results.filter(result => result.okay).length, output: out }));
} finally { await browser.close(); }

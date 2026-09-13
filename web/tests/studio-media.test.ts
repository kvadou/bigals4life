import { afterEach, expect, test } from "bun:test";
import { libraryFits, MAX_CLIP_BYTES, MAX_LIBRARY_BYTES, MAX_RECORDING_MS, startRecording } from "../app/studio/media";
const originals = { MediaRecorder: globalThis.MediaRecorder, MediaStream: globalThis.MediaStream };
afterEach(() => { Object.assign(globalThis, originals); });
class Stream {
  constructor(public tracks: unknown[] = []) {}
  getVideoTracks() { return this.tracks.filter((track:any) => track.kind === "video"); }
}
class Recorder {
  static latest: Recorder;
  static isTypeSupported() { return true; }
  state = "inactive"; mimeType="video/webm";
  ondataavailable: ((event:{data:Blob})=>void) | null=null; onstop:(()=>void) | null=null; onerror:(()=>void) | null=null;
  constructor(public stream: Stream) { Recorder.latest=this; }
  start() { this.state="recording"; }
  stop() { this.state="inactive"; queueMicrotask(() => { this.ondataavailable?.({data:new Blob(["final"],{type:this.mimeType})}); this.onstop?.(); }); }
}
function setup() { Object.assign(globalThis,{MediaRecorder:Recorder,MediaStream:Stream}); return new Stream([{kind:"video"},{kind:"audio"}]) as unknown as MediaStream; }
test("recording excludes audio and waits for final container bytes",async()=>{
  const handle=startRecording(setup()); const rec=Recorder.latest;
  expect(rec.stream.tracks).toHaveLength(1);
  rec.ondataavailable?.({data:new Blob(["header-"])});
  const clip=await handle.stop(); expect(await clip?.blob.text()).toBe("header-final"); expect(clip!.seconds).toBeGreaterThanOrEqual(0);
});
test("discard during leave never returns footage",async()=>{
  const handle=startRecording(setup()); Recorder.latest.ondataavailable?.({data:new Blob(["private footage"])});
  handle.discard(); expect(await handle.finished).toBeNull();
});
test("memory limit drops oversized recording rather than returning corrupt truncated media",async()=>{
  const handle=startRecording(setup()); Recorder.latest.ondataavailable?.({data:{size:MAX_CLIP_BYTES+1} as Blob});
  expect(await handle.finished).toBeNull(); expect(Recorder.latest.state).toBe("inactive");
});
test("inactive recorder error resolves without leaving the consumer busy",async()=>{
  const handle=startRecording(setup()); Recorder.latest.state="inactive"; Recorder.latest.onerror?.();
  expect(await handle.finished).toBeNull();
});
test("clip shelf count and bytes are both bounded",()=>{
  const clip=(size:number)=>({blob:{size} as Blob});
  expect(libraryFits(Array.from({length:12},()=>clip(1)),1)).toBe(false);
  expect(libraryFits([clip(MAX_LIBRARY_BYTES-10)],10)).toBe(true);
  expect(libraryFits([clip(MAX_LIBRARY_BYTES-10)],11)).toBe(false);
  expect(MAX_RECORDING_MS).toBe(600000);
});

// HTTP status must survive parsing so health authorization failures stop media.
test("terminal studio health failures remain distinguishable from temporary provider errors", async () => {
  const { api, terminalSessionError } = await import("../app/studio/types");
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [401,403,404,410,429,500,503]) {
      globalThis.fetch = (async () => new Response(JSON.stringify({error:"Unavailable"}), {status})) as typeof fetch;
      let failure: unknown;
      try { await api("/fixture/health"); } catch(error) { failure=error; }
      expect(terminalSessionError(failure)).toBe([401,403,404,410].includes(status));
    }
    expect(terminalSessionError(new Error("Network unavailable"))).toBe(false);
  } finally { globalThis.fetch=originalFetch; }
});

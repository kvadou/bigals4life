import { expect, test } from "bun:test";
import { liveConnection, type Camera } from "../app/live/connection";
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  const calls: string[] = [];
  const camera: Camera = { stop() { calls.push("stop"); } };
  return { calls, camera, connection: { async connect(_signal: AbortSignal) { calls.push("connect"); }, async disconnect() { calls.push("disconnect"); }, async createCamera() { calls.push("camera"); return camera; }, async publish(_camera: Camera) { calls.push("publish"); } } };
}
test("watching never requests or publishes a camera", async () => {
  const f = fixture(); const session = liveConnection(f.connection);
  await session.start(false); expect(f.calls).toEqual(["connect"]);
  session.dispose(); expect(f.calls).toEqual(["connect", "disconnect"]);
});
test("leaving during a late connection prevents camera capture", async () => {
  const f = fixture(), pending = deferred();
  f.connection.connect = async () => { await pending.promise; };
  const session = liveConnection(f.connection), start = session.start(true);
  session.dispose(); pending.resolve(); await start;
  expect(f.calls).not.toContain("camera"); expect(f.calls).not.toContain("publish"); expect(session.cancelled).toBe(true);
});
test("permission granted after leaving stops the camera without publishing", async () => {
  const f = fixture(), pending = deferred(), requested = deferred();
  f.connection.createCamera = async () => { requested.resolve(); await pending.promise; return f.camera; };
  const session = liveConnection(f.connection), start = session.start(true);
  await requested.promise; session.dispose(); pending.resolve(); await start;
  expect(f.calls).toContain("stop"); expect(f.calls).not.toContain("publish");
});
test("failed publication releases the camera and room", async () => {
  const f = fixture(); f.connection.publish = async () => { throw new Error("publication failed"); };
  const session = liveConnection(f.connection);
  await expect(session.start(true)).rejects.toThrow("publication failed");
  expect(f.calls).toEqual(["connect", "camera", "stop", "disconnect"]);
});
test("leaving during publication stops both immediate and late camera activity", async () => {
  const f = fixture(), pending = deferred(), publishing = deferred();
  f.connection.publish = async () => { publishing.resolve(); await pending.promise; };
  const session = liveConnection(f.connection), start = session.start(true);
  await publishing.promise; session.dispose(); pending.resolve(); await start;
  expect(f.calls.filter(call => call === "stop").length).toBeGreaterThanOrEqual(1);
  expect(f.calls.at(-1)).toBe("disconnect");
});

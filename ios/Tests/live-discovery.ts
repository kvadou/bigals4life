import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "ba4l-live-discovery-"));
try {
  const view = await readFile("ios/Sources/LiveLaneView.swift", "utf8");
  const models = view.slice(view.indexOf("struct LiveLaneListing:"), view.indexOf("/// Owns one in-memory"));
  const source = `import Foundation
import Combine
typealias SeasonTransport = (URLRequest) async throws -> (Data, HTTPURLResponse)
${models}
@main struct Verify {
 @MainActor static func main() async {
  let model = LiveLaneDiscovery()
  let valid = #"{"configured":true,"sessions":[{"scorebookId":"00000000-0000-4000-8000-000000000222","kind":"prebowl","week":2,"bowlers":["Pete"],"cameraCount":1}]}"#
  func response(_ body: String, _ status: Int = 200) -> SeasonTransport {
   { request in (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!) }
  }
  await model.refresh(send: response(valid))
  precondition(model.sessions.count == 1 && model.sessions[0].title == "Live pre-bowl · Week 2")
  await model.refresh(send: response("{}", 503))
  precondition(model.sessions.isEmpty && model.message != nil)
  await model.refresh(send: response(valid))
  await model.refresh(send: response(#"{"configured":false,"sessions":[]}"#))
  precondition(model.sessions.isEmpty && model.message == "Team live video is being set up.")
  await model.refresh(send: response(valid.replacingOccurrences(of: "cameraCount\\\":1", with: "cameraCount\\\":0")))
  precondition(model.sessions.isEmpty)
  let pending = Task { await model.refresh(send: { request in
   try? await Task.sleep(for: .milliseconds(50))
   return (Data(valid.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
  }) }
  await Task.yield(); model.stop(); pending.cancel(); await pending.value
  precondition(model.sessions.isEmpty)
  let suite = "ba4l-live-view-test-" + UUID().uuidString
  let defaults = UserDefaults(suiteName: suite)!
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
  let id = "00000000-0000-4000-8000-000000000222"
  let book = SharedScorebook(id: id, state: Night(), revision: 1, role: .viewer)
  let data = try! JSONEncoder().encode(book)
  let store = ScorebookStore(client: ScorebookClient(send: { request in
   (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
  }), defaults: defaults, directory: directory, ephemeral: true)
  await store.start()
  await store.openTeam(ScorebookClient.origin + "/?night=" + id)
  precondition(store.teamID == id && store.role == .viewer)
  precondition(!FileManager.default.fileExists(atPath: directory.path))
  precondition(defaults.string(forKey: "strike-ceiling.shared-team.v2") == nil)
  await store.refresh(force: true)
  precondition(!FileManager.default.fileExists(atPath: directory.path))
  precondition(defaults.string(forKey: "strike-ceiling.shared-team.v2") == nil)
  print("Live discovery: states/cancellation passed; actual ephemeral store open/refresh creates no files or selected-book preference")
 }
}
`;
  const file = join(directory, "Verify.swift"), binary = join(directory, "verify");
  await writeFile(file, source);
  const compile = Bun.spawn(["xcrun", "swiftc", "-parse-as-library", "ios/Sources/BowlingGame.swift", file, "-o", binary], { stdout: "inherit", stderr: "inherit" });
  if (await compile.exited) throw new Error("Live discovery compilation failed");
  const run = Bun.spawn([binary], { stdout: "inherit", stderr: "inherit" });
  if (await run.exited) throw new Error("Live discovery verification failed");
} finally { await rm(directory, { recursive: true, force: true }); }

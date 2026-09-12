#if DEBUG
import Foundation

/// Local simulator verification only. No fallback to a real network transport.
@MainActor
func nativeFixtureSession() -> AccountSession? {
    guard let path = ProcessInfo.processInfo.environment["BA4L_FIXTURE_DIRECTORY"] else { return nil }
    let directory = URL(fileURLWithPath: path, isDirectory: true)
    let storage = AccountSession.TokenStorage(read: { try Data(contentsOf: directory.appendingPathComponent("session.json")) }, write: { _ in }, remove: {})
    return AccountSession(transport: { request in
        let path = request.url!.path
        var name: String
        if path == "/api/season" { name = "season" }
        else if path == "/api/me" { name = "me" }
        else if path == "/api/league/standings" { name = "standings" }
        else if path == "/api/league/records" { name = "records" }
        else if path.hasPrefix("/api/league/records/") { name = "bowler" }
        else if path == "/api/league/teams" { name = "teams" }
        else if path.hasSuffix("/members") { name = "members" }
        else if path.hasPrefix("/api/nights/") { name = "night" }
        else if path.hasPrefix("/api/review/") { name = "review" }
        else { name = "unavailable" }
        let file = directory.appendingPathComponent(name + ".json")
        let allowed = (request.httpMethod ?? "GET") == "GET" && FileManager.default.fileExists(atPath: file.path)
        let data = allowed ? try Data(contentsOf: file) : Data("{\"error\":\"Simulator fixture is read-only.\"}".utf8)
        return (data, HTTPURLResponse(url: request.url!, statusCode: allowed ? 200 : 405, httpVersion: nil, headerFields: nil)!)
    }, storage: storage)
}
#endif

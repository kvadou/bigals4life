import Foundation
import LiveKit

struct StudioSession: Decodable, Identifiable {
    let id: String
    let activity: String
    let audience: String
    let scorebookId: String?
    let teamScopeId: String?
    let title: String
    let expiresAt: String
    let canPublish: Bool
    let isOwner: Bool?
    var activityTitle: String { ["league": "League night", "prebowl": "Pre-bowl", "practice": "Practice", "social": "Hangout"][activity] ?? "Live session" }
}

@MainActor final class LiveStudioModel: ObservableObject {
    struct ListResponse: Decodable { let sessions: [StudioSession]; let configured: Bool }
    struct SessionResponse: Decodable { let session: StudioSession }
    struct Failure: Decodable { let error: String }
    @Published var sessions: [StudioSession] = []
    @Published var busy = false
    @Published var error: String?
    let send: SeasonTransport
    init(send: @escaping SeasonTransport) { self.send = send }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> T {
        var request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/live/v2/sessions" + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = method
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw NSError(domain: "BA4L.Studio", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Live sessions are unavailable. Try again."])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func refresh() async {
        do { let response: ListResponse = try await request(""); sessions = response.sessions; error = nil }
        catch { self.error = error.localizedDescription }
    }
    func create(activity: String, audience: String, title: String, bookID: String?) async -> StudioSession? {
        guard !busy else { return nil }; busy = true; error = nil; defer { busy = false }
        var body: [String: Any] = ["activity": activity, "audience": audience, "title": title, "durationMinutes": 120]
        if ["league", "prebowl"].contains(activity) { body["scorebookId"] = bookID }
        if audience == "team" { body["teamScopeId"] = bookID }
        do { let response: SessionResponse = try await request("", method: "POST", body: body); return response.session }
        catch { self.error = error.localizedDescription; return nil }
    }
}

/// Reports interval counters. It never reads images, audio, credentials or personal names.
@MainActor final class StudioDelivery: ObservableObject {
    struct Health: Decodable { let connectedCount: Int; let cameraCount: Int; let receivingCount: Int; let observedAt: String; let evidence: String }
    private struct Ack: Decodable { }
    @Published var health: Health?
    @Published var error: String?
    @Published var mustDisconnect = false
    @Published var sentBytes: UInt64 = 0
    @Published var sentFrames: UInt64 = 0
    var freshHealth: Health? {
        guard let health else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let observed = formatter.date(from: health.observedAt), Date().timeIntervalSince(observed) < 15 else { return nil }
        return health
    }
    private var previous: [String: (UInt64, UInt64)] = [:]
    private var connectionID: String?
    func reset() { health = nil; error = nil; sentBytes = 0; sentFrames = 0; mustDisconnect = false; previous = [:]; connectionID = nil }
    func refresh(sessionID: String, connectionID: String, room: Room, model: LiveStudioModel) async {
        if self.connectionID != connectionID { reset(); self.connectionID = connectionID }
        var incoming: [[String: Any]] = []
        var outgoingFrames: UInt64 = 0, outgoingBytes: UInt64 = 0
        var activeKeys = Set<String>()
        var hasLocalCamera = false
        for participant in room.remoteParticipants.values {
            for publication in participant.videoTracks {
                guard !publication.isMuted, let track = publication.track as? VideoTrack, let sid = track.sid?.stringValue else { continue }
                await track.set(reportStatistics: true)
                let stats = track.statistics?.inboundRtpStream ?? []
                let frames = stats.reduce(UInt64(0)) { $0 + UInt64($1.framesDecoded ?? 0) }
                let bytes = stats.reduce(UInt64(0)) { $0 + ($1.bytesReceived ?? 0) }
                let delta = measure(sid, frames: frames, bytes: bytes); activeKeys.insert(sid)
                incoming.append(["trackSid": sid, "frames": delta.0, "bytes": delta.1])
            }
        }
        for publication in room.localParticipant.videoTracks {
            guard !publication.isMuted, let track = publication.track as? VideoTrack, let sid = track.sid?.stringValue else { continue }
            await track.set(reportStatistics: true)
            hasLocalCamera = true
            let stats = track.statistics?.outboundRtpStream ?? []
            let frames = stats.reduce(UInt64(0)) { $0 + UInt64($1.framesSent ?? 0) }
            let bytes = stats.reduce(UInt64(0)) { $0 + ($1.bytesSent ?? 0) }
            let delta = measure(sid, frames: frames, bytes: bytes); activeKeys.insert(sid)
            outgoingFrames += delta.0; outgoingBytes += delta.1
        }
        previous = previous.filter { activeKeys.contains($0.key) }
        guard self.connectionID == connectionID, room.connectionState == .connected else { return }
        sentBytes = outgoingBytes; sentFrames = outgoingFrames
        do {
            var body: [String: Any] = ["connectionId": connectionID, "received": Array(incoming.prefix(16))]
            if hasLocalCamera { body["outgoing"] = ["frames": outgoingFrames, "bytes": outgoingBytes] }
            let _: Ack = try await model.request("/\(sessionID)/health", method: "POST", body: body)
            let response: Health = try await model.request("/\(sessionID)/health")
            guard self.connectionID == connectionID else { return }
            health = response; error = nil
        } catch { guard self.connectionID == connectionID else { return }; health = nil; mustDisconnect = [401,403,404,410].contains((error as NSError).code); self.error = "Delivery reports unavailable. Video may still be connected." }
    }
    private func measure(_ key: String, frames: UInt64, bytes: UInt64) -> (UInt64, UInt64) {
        let old = previous[key]; previous[key] = (frames, bytes)
        guard let old else { return (0, 0) }
        return (frames >= old.0 ? frames - old.0 : 0, bytes >= old.1 ? bytes - old.1 : 0)
    }
}

import Foundation
import Combine

struct SoundboardClip: Decodable, Identifiable { let id: String; let title: String; let canRemove: Bool? }
struct SoundboardEvent: Decodable, Identifiable { let id: String; let soundId: String; let author: String; let createdAt: String }

/// Drops history at every listening boundary. One poll can produce at most one fresh cue.
struct SoundboardCursor {
    private var seen: Set<String>?
    mutating func reset() { seen = nil }
    mutating func consume(_ events: [SoundboardEvent], now: Date = .now) -> SoundboardEvent? {
        let old = seen
        seen = Set(events.map(\.id))
        guard let old else { return nil }
        let formatter = ISO8601DateFormatter()
        return events.last { event in
            guard !old.contains(event.id) else { return false }
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let date = formatter.date(from: event.createdAt) ?? { formatter.formatOptions = [.withInternetDateTime]; return formatter.date(from: event.createdAt) }()
            guard let date else { return false }
            return (0...10).contains(now.timeIntervalSince(date))
        }
    }
}

@MainActor protocol SoundboardAudio: AnyObject {
    var recording: Bool { get }
    func play(data: Data) throws
    func playBundled(_ name: String) throws
    func stopPlayback()
    func suspend()
}

@MainActor final class NativeSoundboardModel: ObservableObject {
    enum Listening: String, CaseIterable { case off = "Off", personal = "Personal", speaker = "Lane speaker" }
    static let builtIns = [(id: "pickle", title: "Pickle", emoji: "🥒"), (id: "turkey", title: "Turkey", emoji: "🦃"), (id: "violin", title: "Tiny violin", emoji: "🎻"), (id: "heating", title: "Heating up", emoji: "🔥")]
    @Published private(set) var enabled = false
    @Published private(set) var loaded = false
    @Published private(set) var busy = false
    @Published private(set) var listening: Listening = .off
    @Published private(set) var speakerConnectionID: String?
    @Published private(set) var clips: [SoundboardClip] = []
    @Published private(set) var celebration: SoundboardEvent?
    @Published var error: String?
    @Published private(set) var message: String?
    private let client: LiveStudioModel
    private let audio: any SoundboardAudio
    private let path: String
    private(set) var connectionID: String?
    private var generation = 0
    private var cursor = SoundboardCursor()
    private var leaseOperation: Task<Bool, Error>?
    private var cueTask: Task<Void, Never>?
    private var cueEpoch = 0
    private var lastRenewal = Date.distantPast
    private var celebrationExpiry = Date.distantPast
    private var lastPlay = Date.distantPast
    private struct Feed: Decodable { let enabled: Bool; let speakerConnectionId: String?; let clips: [SoundboardClip]; let events: [SoundboardEvent] }
    private struct Audio: Decodable { let audioBase64: String }
    private struct Claim: Decodable { let claimed: Bool }
    private struct Accepted: Decodable { let accepted: Bool }
    private struct Saved: Decodable { let clip: SoundboardClip }
    private struct Removed: Decodable { let removed: Bool }
    private struct Updated: Decodable { let updated: Bool }
    init(sessionID: String, audio: any SoundboardAudio, send: @escaping SeasonTransport) {
        self.audio = audio; client = LiveStudioModel(send: send); path = "/\(sessionID)/soundboard"
    }
    private func stopAudio() { cueEpoch += 1; cueTask?.cancel(); cueTask = nil; audio.stopPlayback() }
    private func lease(_ id: String, claim: Bool) -> Task<Bool, Error> {
        let previous = leaseOperation
        let client = client; let path = path
        let next = Task { @MainActor in
            if let previous { _ = await previous.result }
            let result: Claim = try await client.request(path,method:"POST",body:["action":"speaker","connectionId":id,"claim":claim])
            return result.claimed
        }
        leaseOperation = next
        return next
    }
    func tick() {
        if Date() > celebrationExpiry { celebration = nil }
        if listening == .speaker && Date().timeIntervalSince(lastRenewal) >= 25 {
            mute(); error = "Lane speaker confirmation expired. Sound is off. Choose Lane speaker to try again."
        }
    }
    var canSend: Bool { connectionID != nil && loaded && enabled && !busy }
    func activate(_ id: String?) {
        guard connectionID != id else { return }
        suspend(); connectionID = id
    }
    func suspend() {
        let old = connectionID; let owned = listening == .speaker
        generation += 1; connectionID = nil; loaded = false; listening = .off; cursor.reset(); celebration = nil
        stopAudio(); audio.suspend()
        if owned, let old { _ = lease(old,claim:false) }
    }
    func prepareRecording() { generation += 1; cursor.reset(); stopAudio() }
    func mute() {
        let owned = listening == .speaker; let id = connectionID
        generation += 1; listening = .off; cursor.reset(); stopAudio()
        if owned, let id { _ = lease(id,claim:false) }
    }
    func choose(_ mode: Listening) async {
        guard let id = connectionID, !busy else { return }
        let previous = listening
        generation += 1; let attempt = generation
        stopAudio(); cursor.reset(); listening = .off; error = nil; message = nil
        busy = true; defer { busy = false }
        if previous == .speaker {
            _ = try? await lease(id,claim:false).value
        }
        guard attempt == generation, connectionID == id else { return }
        if mode == .speaker {
            do {
                let requestedAt = Date()
                let claimed = try await lease(id,claim:true).value
                guard attempt == generation, connectionID == id else {
                    if claimed { _ = lease(id,claim:false) }; return
                }
                guard claimed else { error = "Another device is the lane speaker. Use Personal with headphones, or try again later."; return }
                guard Date().timeIntervalSince(requestedAt) < 25 else { _ = lease(id,claim:false); error = "Lane speaker confirmation arrived too late. Try again."; return }
                listening = .speaker; speakerConnectionID = id; lastRenewal = requestedAt
            } catch { self.error = error.localizedDescription }
        } else { listening = mode }
    }
    func refresh() async {
        guard let id = connectionID else { return }
        let attempt = generation
        do {
            if listening == .speaker && Date().timeIntervalSince(lastRenewal) >= 15 {
                let requestedAt = Date()
                let claimed = try await lease(id,claim:true).value
                guard attempt == generation, connectionID == id, !Task.isCancelled else { return }
                guard claimed else { listening = .off; stopAudio(); cursor.reset(); error = "Lane speaker access ended. Sound is off."; return }
                lastRenewal = requestedAt
                guard Date().timeIntervalSince(requestedAt) < 25 else { mute(); error = "Lane speaker confirmation expired. Sound is off."; return }
            }
            let feed: Feed = try await client.request(path)
            guard attempt == generation, connectionID == id, !Task.isCancelled else { return }
            loaded = true; enabled = feed.enabled; clips = feed.clips; speakerConnectionID = feed.speakerConnectionId
            if !enabled { stopAudio() }
            if listening == .speaker && speakerConnectionID != id { listening = .off; stopAudio(); cursor.reset(); error = "This device is no longer the lane speaker. Sound is off." }
            if Date() > celebrationExpiry { celebration = nil }
            guard let newest = cursor.consume(feed.events), enabled else { return }
            stopAudio()
            celebration = newest; celebrationExpiry = Date().addingTimeInterval(4)
            guard listening != .off, !audio.recording else { return }
            if Self.builtIns.contains(where: { $0.id == newest.soundId }) { try audio.playBundled(newest.soundId) }
            else {
                guard UUID(uuidString: newest.soundId) != nil else { return }
                let epoch = cueEpoch
                cueTask = Task { [weak self] in
                    guard let self else { return }
                    do {
                        let result: Audio = try await client.request(path + "?clip=" + newest.soundId)
                        guard epoch == cueEpoch, attempt == generation, connectionID == id, !Task.isCancelled, enabled, listening != .off, !audio.recording else { return }
                        guard let data = Data(base64Encoded:result.audioBase64), data.count <= 256 * 1024 else { throw SoundboardFailure.invalidAudio }
                        var gate = SoundboardCursor(); _ = gate.consume([])
                        if gate.consume([newest]) != nil { try audio.play(data:data) }
                    } catch {
                        guard epoch == cueEpoch, attempt == generation, !Task.isCancelled else { return }
                        self.error = error.localizedDescription
                    }
                }
            }
        } catch {
            guard attempt == generation, !Task.isCancelled else { return }
            self.error = error.localizedDescription; stopAudio(); cursor.reset()
            if listening == .speaker { listening = .off }
            loaded = false
        }
    }
    func play(_ soundID: String) async {
        guard canSend, let id = connectionID else { return }
        guard Date().timeIntervalSince(lastPlay) >= 5 else { error = "Give the lane a few seconds between sounds."; return }
        busy = true; error = nil; message = nil; defer { busy = false }
        do {
            let result: Accepted = try await client.request(path,method:"POST",body:["action":"play","soundId":soundID,"connectionId":id])
            guard result.accepted else { throw SoundboardFailure.notSaved }
            lastPlay = .now; message = "Cue sent. Devices that opted in can hear it."
        } catch { self.error = error.localizedDescription }
    }
    func save(title: String, data: Data) async -> Bool {
        guard connectionID != nil, !busy, data.count <= 256 * 1024 else { return false }
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.utf16.count <= 40 else { error = "Give the clip a title of up to 40 characters."; return false }
        busy = true; error = nil; message = nil; generation += 1; defer { busy = false }
        do {
            let result: Saved = try await client.request(path,method:"POST",body:["action":"save","title":title,"audioBase64":data.base64EncodedString()])
            generation += 1
            if !clips.contains(where: {$0.id == result.clip.id}) { clips.append(result.clip) }
            message = "Clip shared with this session."; return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func remove(_ clip: SoundboardClip) async {
        guard !busy else { return }; busy = true; generation += 1; defer { busy = false }
        do { let result: Removed = try await client.request(path,method:"POST",body:["action":"remove","clipId":clip.id]); guard result.removed else { throw SoundboardFailure.notSaved }; generation += 1; clips.removeAll {$0.id == clip.id} }
        catch { self.error = error.localizedDescription }
    }
    func setEnabled(_ value: Bool) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        generation += 1; cursor.reset()
        if !value { stopAudio() }
        do { let result: Updated = try await client.request(path,method:"POST",body:["action":"enabled","enabled":value]); guard result.updated else { throw SoundboardFailure.notSaved }; generation += 1; enabled = value; cursor.reset() }
        catch { self.error = error.localizedDescription }
    }
}

enum SoundboardFailure: LocalizedError {
    case invalidAudio, notSaved
    var errorDescription: String? { switch self { case .invalidAudio: return "This audio clip could not be played. Try a different clip."; case .notSaved: return "That change was not saved. Try again." } }
}

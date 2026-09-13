import AVKit
import LiveKit
import SwiftUI

struct ReplayScoreMoment {
    static func label(previous: Night, current: Night) -> String? {
        guard (1...3).contains(current.game), previous.game == current.game, previous.history == current.history, previous.finals == current.finals,
              previous.prebowl == current.prebowl, previous.match == current.match, previous.rolls.count == 4, current.rolls.count == 4 else { return nil }
        let changed = (0..<4).filter { previous.rolls[$0] != current.rolls[$0] }
        guard changed.count == 1, let index = changed.first, current.finals?[index] == nil,
              current.rolls[index].count == previous.rolls[index].count + 1,
              Array(current.rolls[index].dropLast()) == previous.rolls[index],
              current.prebowl == nil || current.prebowl!.bowlers.contains(index) else { return nil }
        var before = BowlingGame()
        for pins in previous.rolls[index] { guard before.add(pins) else { return nil } }
        var after = before
        guard let pins = current.rolls[index].last, after.add(pins) else { return nil }
        let kind: String
        if after.isComplete && !before.isComplete { kind = "finished a game" }
        else if pins == 10 && (before.ballNumber == 1 || (before.frameNumber == 10 && before.frames.last?.first == 10)) { kind = "strike recorded" }
        else if before.ballNumber == 2, let first = before.frames.last?.first, first < 10, first + pins == 10 { kind = "spare recorded" }
        else { return nil }
        return "\(Night.names[index]) · \(kind)"
    }
}

private final class ReplayFrameSink: NSObject, VideoRenderer, @unchecked Sendable {
    let writer: LaneReplayWriter
    var onFrame: (@Sendable () -> Void)?
    private let lock = NSLock()
    private var lastAccepted: Int64 = .min
    private var lastNotice = Date.distantPast
    init(writer: LaneReplayWriter) { self.writer = writer }
    @MainActor var isAdaptiveStreamEnabled: Bool { false }
    @MainActor var adaptiveStreamSize: CGSize { .zero }
    nonisolated func render(frame: VideoFrame) {
        lock.lock()
        let timestamp = frame.timeStampNs
        let allowed = lastAccepted == .min || timestamp > lastAccepted && timestamp - lastAccepted >= 66_666_666
        if allowed { lastAccepted = timestamp }
        let notify = Date().timeIntervalSince(lastNotice) >= 0.5
        if notify { lastNotice = Date() }
        lock.unlock()
        guard allowed, let buffer = frame.toCVPixelBuffer() else { return }
        writer.append(buffer, timestampNs: frame.timeStampNs, rotation: frame.rotation.rawValue)
        if notify { onFrame?() }
    }
}

@MainActor final class LaneReplaySession: ObservableObject {
    @Published private(set) var enabled = false
    @Published private(set) var sourceName = ""
    @Published private(set) var recent: LaneReplayWriter.Clip?
    @Published private(set) var moment: LaneReplayWriter.Clip?
    @Published private(set) var momentLabel: String?
    @Published private(set) var status = "Local replays are off."
    private var track: VideoTrack?
    private var sink: ReplayFrameSink?
    private var generation = 0
    private var latestFrame = Date.distantPast
    private var startedAt = Date.distantPast
    private var lastScoreCheck: Date?
    private var pendingMoment: (label: String, at: Date)?
    private let directory = FileManager.default.temporaryDirectory.appendingPathComponent("BA4L-replay-" + UUID().uuidString)
    private var momentURL: URL { directory.appendingPathComponent("moment.mp4") }
    func enable(track: VideoTrack, name: String) {
        stop(clearMoment: true)
        generation += 1
        let attempt = generation
        let writer = LaneReplayWriter(directory: directory.appendingPathComponent("ring-" + UUID().uuidString), source: name)
        let renderer = ReplayFrameSink(writer: writer)
        renderer.onFrame = { [weak self] in Task { @MainActor in guard let self, self.generation == attempt else { return }; self.latestFrame = Date() } }
        writer.onClip = { [weak self] clip in Task { @MainActor in
            guard let self, self.generation == attempt, self.enabled else { return }
            self.recent = clip; self.status = "Local replay ready · \(Int(clip.seconds.rounded())) seconds"
            if let pending = self.pendingMoment {
                self.pendingMoment = nil
                let end = clip.capturedAt.addingTimeInterval(clip.seconds)
                if clip.seconds >= 2, abs(end.timeIntervalSince(pending.at)) < 5 { self.keep(clip, label: pending.label) }
            }
        } }
        writer.onError = { [weak self] message in Task { @MainActor in guard let self, self.generation == attempt else { return }; self.stop(clearMoment: false); self.status = message } }
        self.track = track; sink = renderer; sourceName = name; enabled = true
        lastScoreCheck = nil; latestFrame = .distantPast; startedAt = Date()
        status = "Buffering local replay · \(name)"
        track.add(videoRenderer: renderer)
    }
    func sourceIsAvailable(_ tracks: [VideoTrack], connected: Bool) {
        guard enabled else { return }
        guard connected, let track, tracks.contains(where: { $0 === track }) else { stop(clearMoment: false); status = "Replay stopped because its camera disconnected. Enable again to resume."; return }
        if Date().timeIntervalSince(latestFrame) > 3 {
            lastScoreCheck = nil
            if Date().timeIntervalSince(startedAt) > 5 { stop(clearMoment: false); status = "Replay stopped because camera frames paused. Enable again when video returns." }
        }
    }
    func scoreRefreshed(previous: Night, current: Night, verified: Bool) {
        let now = Date()
        defer { lastScoreCheck = verified && enabled ? now : nil }
        guard enabled, verified, now.timeIntervalSince(latestFrame) < 2,
              let prior = lastScoreCheck, now.timeIntervalSince(prior) < 10,
              let label = ReplayScoreMoment.label(previous: previous, current: current) else { return }
        pendingMoment = (label, now)
        sink?.writer.finishSegment()
    }
    func playbackCopy(of clip: LaneReplayWriter.Clip) -> LaneReplayWriter.Clip? {
        let destination = directory.appendingPathComponent("playback-" + UUID().uuidString + ".mp4")
        do {
            try FileManager.default.copyItem(at: clip.url, to: destination)
            return .init(id: UUID(), url: destination, capturedAt: clip.capturedAt, seconds: clip.seconds, source: clip.source)
        } catch { status = "That replay has expired. Try the newest clip."; return nil }
    }
    func keepRecent() { if let recent { keep(recent, label: "Selected lane footage") } }
    private func keep(_ clip: LaneReplayWriter.Clip, label: String) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let next = directory.appendingPathComponent("next-moment.mp4")
            try? FileManager.default.removeItem(at: next)
            try FileManager.default.copyItem(at: clip.url, to: next)
            try? FileManager.default.removeItem(at: momentURL)
            try FileManager.default.moveItem(at: next, to: momentURL)
            moment = .init(id: UUID(), url: momentURL, capturedAt: clip.capturedAt, seconds: clip.seconds, source: clip.source)
            momentLabel = label
        } catch { status = "This moment could not be kept. Check device storage." }
    }
    func stop(clearMoment: Bool = false) {
        generation += 1
        if let track, let sink { track.remove(videoRenderer: sink); sink.writer.stop() }
        track = nil; sink = nil; enabled = false; recent = nil; pendingMoment = nil; lastScoreCheck = nil
        status = "Local replays are off."
        if clearMoment { moment = nil; momentLabel = nil; try? FileManager.default.removeItem(at: directory) }
    }
}

struct LaneReplayPanel: View {
    @ObservedObject var replay: LaneReplaySession
    let sources: [(name: String, track: VideoTrack)]
    @State private var playback: LaneReplayWriter.Clip?
    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Label("Replay & moment of the night", systemImage: "gobackward").font(.headline)
                Text(replay.status).font(.subheadline).accessibilityIdentifier("laneReplayStatus")
                if replay.enabled {
                    Text("Recording silently on this device · \(replay.sourceName)").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Button("Stop local replays", role: .destructive) { replay.stop() }.buttonStyle(.bordered).frame(minHeight: 44)
                } else if sources.count == 1, let source = sources.first {
                    Button("Enable local replays", systemImage: "record.circle") { replay.enable(track: source.track, name: source.name) }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).controlSize(.large)
                } else if sources.count > 1 {
                    Menu("Enable replays from a camera") {
                        ForEach(sources.indices, id: \.self) { index in Button(sources[index].name) { replay.enable(track: sources[index].track, name: sources[index].name) } }
                    }.frame(minHeight: 44)
                } else { Text("A connected lane camera is needed to enable replays.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
                if let clip = replay.recent {
                    HStack {
                        Button("Replay recent footage") { playback = replay.playbackCopy(of: clip) }.frame(minHeight: 44)
                        Button("Keep moment") { replay.keepRecent() }.frame(minHeight: 44)
                    }.buttonStyle(.bordered)
                }
                if let moment = replay.moment {
                    Text("Moment of the night · candidate").font(.headline)
                    Text(replay.momentLabel ?? "Recent lane footage").font(.subheadline)
                    Text("\(moment.source) · Received \(moment.capturedAt.formatted(date: .omitted, time: .standard)) · \(Int(moment.seconds.rounded())) seconds").font(.caption)
                    Text("Scorebook event and video are not synchronized. Confirm the footage before attributing a delivery.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Button("Watch kept moment") { playback = replay.playbackCopy(of: moment) }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).frame(minHeight: 44)
                    ShareLink("Save or share moment", item: moment.url).frame(minHeight: 44)
                }
                Text("Keeps up to 30 seconds of recent video plus one moment locally. Automatic candidates require a fresh, single-roll score update. Nothing is uploaded. Save a kept moment before leaving this session.").font(.caption).foregroundStyle(BA4LTheme.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.sheet(item: $playback) { clip in LaneReplayPlayer(clip: clip) }
    }
}

private struct LaneReplayPlayer: View {
    let clip: LaneReplayWriter.Clip
    @State private var player = AVPlayer()
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VideoPlayer(player: player).navigationTitle("Recent lane footage").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.frame(minHeight: 44) } }
        }.onAppear { player.replaceCurrentItem(with: AVPlayerItem(url: clip.url)); player.play() }
            .onDisappear { player.pause(); player.replaceCurrentItem(with: nil); try? FileManager.default.removeItem(at: clip.url) }
    }
}

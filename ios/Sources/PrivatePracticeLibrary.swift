import AVKit
import SwiftUI

struct PrivatePracticeLibrary: View {
    @ObservedObject var recorder: PrivatePracticeRecorder
    @State private var selected: Set<URL> = []
    @State private var deleting: PrivatePracticeClip?
    var body: some View {
        List {
            Section {
                Text("Choose two recordings to compare. Clips stay private until you explicitly share them.").foregroundStyle(BA4LTheme.secondary)
                if selected.count == 2 {
                    NavigationLink("Compare selected clips") { PrivatePracticePlayback(clips: recorder.clips.filter { selected.contains($0.url) }) }
                        .frame(minHeight: 44)
                }
            }
            if let message = recorder.message { Text(message).font(.callout) }
            if recorder.clips.isEmpty { ContentUnavailableView("No saved clips", systemImage: "video", description: Text("Record your first practice session to start a replay library.")) }
            ForEach(recorder.clips) { clip in
                VStack(alignment: .leading, spacing: 12) {
                    Text(clip.created.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                    NavigationLink("Watch recording") { PrivatePracticePlayback(clips: [clip]) }.frame(minHeight: 44)
                    HStack {
                        Button {
                            if selected.contains(clip.url) { selected.remove(clip.url) }
                            else if selected.count < 2 { selected.insert(clip.url) }
                        } label: { Label(selected.contains(clip.url) ? "Selected" : "Compare", systemImage: selected.contains(clip.url) ? "checkmark.circle.fill" : "circle") }
                            .disabled(selected.count == 2 && !selected.contains(clip.url)).frame(minHeight: 44)
                        Spacer()
                        ShareLink(item: clip.url) { Label("Share", systemImage: "square.and.arrow.up") }.frame(minHeight: 44)
                    }.buttonStyle(.borderless)
                    Button("Delete clip", role: .destructive) { deleting = clip }.buttonStyle(.borderless).frame(minHeight: 44)
                }.padding(.vertical, 8)
            }
        }.navigationTitle("Saved practice").navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("Delete this recording from this device?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button("Delete recording", role: .destructive) { if let clip = deleting { selected.remove(clip.url); recorder.delete(clip) }; deleting = nil }
                Button("Cancel", role: .cancel) { deleting = nil }
            }.onChange(of: recorder.clips) { _, clips in selected.formIntersection(Set(clips.map(\.url))) }
    }
}

@MainActor
private final class PracticePlaybackModel: ObservableObject {
    let players: [AVPlayer]
    @Published var playing = false
    @Published var preparing = false
    @Published var speed: Float = 1
    @Published var message: String?
    private var observers: [NSObjectProtocol] = []
    private var generation = 0
    init(clips: [PrivatePracticeClip]) {
        players = clips.prefix(2).map { let player = AVPlayer(url: $0.url); player.isMuted = true; player.automaticallyWaitsToMinimizeStalling = false; return player }
        for player in players {
            observers.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main) { [weak self] _ in Task { @MainActor in self?.pause() } })
            observers.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: player.currentItem, queue: .main) { [weak self] _ in Task { @MainActor in self?.pause(); self?.message = "This recording could not play. Try another clip." } })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
    func pause() { generation += 1; players.forEach { $0.cancelPendingPrerolls(); $0.pause() }; playing = false; preparing = false }
    func play() async {
        generation += 1; let attempt = generation
        preparing = true
        defer { if generation == attempt { preparing = false } }
        message = nil
        for player in players {
            guard let item = player.currentItem else { return }
            do {
                let duration = try await item.asset.load(.duration)
                guard attempt == generation else { return }
                if duration.seconds.isFinite && player.currentTime().seconds >= duration.seconds - 0.05 {
                    await player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
                }
                for _ in 0..<50 {
                    guard attempt == generation else { return }
                    if item.status != .unknown { break }
                    try await Task.sleep(for: .milliseconds(100))
                }
                guard item.status == .readyToPlay else { message = "Could not load this recording. Try another clip."; return }
            }
            catch { message = "Could not open this recording."; return }
            let ready = await withCheckedContinuation { continuation in player.preroll(atRate: speed) { continuation.resume(returning: $0) } }
            guard attempt == generation else { return }
            guard ready else { message = "Playback is unavailable. Reset or choose another clip."; return }
        }
        let start = CMTimeAdd(CMClockGetTime(CMClockGetHostTimeClock()), CMTime(seconds: 0.15, preferredTimescale: 600))
        for player in players { player.setRate(speed, time: player.currentTime(), atHostTime: start) }
        playing = true
    }
    func reset() async {
        pause(); let attempt = generation
        for player in players { await player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero); guard attempt == generation else { return } }
    }
    func changeSpeed() { if playing { pause(); Task { await play() } } }
}

struct PrivatePracticePlayback: View {
    let clips: [PrivatePracticeClip]
    @StateObject private var playback: PracticePlaybackModel
    @Environment(\.scenePhase) private var scenePhase
    init(clips: [PrivatePracticeClip]) { self.clips = Array(clips.prefix(2)); _playback = StateObject(wrappedValue: PracticePlaybackModel(clips: clips)) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(Array(playback.players.enumerated()), id: \.offset) { index, player in
                        VStack(alignment: .leading) {
                            Text(clips.count == 2 ? (index == 0 ? "Clip A" : "Clip B") : "Recording").font(.headline)
                            PracticePlayerSurface(player: player).aspectRatio(3 / 4, contentMode: .fit)
                            Text(clips[index].created.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(BA4LTheme.secondary)
                        }.frame(maxWidth: .infinity)
                    }
                }
                Picker("Playback speed", selection: $playback.speed) {
                    Text("¼ speed").tag(Float(0.25)); Text("½ speed").tag(Float(0.5)); Text("Normal").tag(Float(1))
                }.pickerStyle(.segmented).onChange(of: playback.speed) { _, _ in playback.changeSpeed() }
                HStack {
                    Button(playback.playing ? "Pause" : "Play", systemImage: playback.playing ? "pause.fill" : "play.fill") {
                        if playback.playing { playback.pause() } else { Task { await playback.play() } }
                    }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).disabled(playback.preparing).frame(minHeight: 44)
                    Button("Reset", systemImage: "backward.end.fill") { Task { await playback.reset() } }.frame(minHeight: 44)
                }
                if let message = playback.message { Text(message).foregroundStyle(BA4LTheme.secondary) }
                if clips.count == 2 { Text("Both clips start together from their current positions. Reset aligns their beginnings. Recording start times may differ from the start of each shot.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
                ForEach(clips) { clip in ShareLink(item: clip.url) { Label(clips.count == 2 ? "Share \(clip == clips.first ? "clip A" : "clip B")" : "Share recording", systemImage: "square.and.arrow.up") }.frame(minHeight: 44) }
            }.padding()
        }.navigationTitle(clips.count == 2 ? "Compare shots" : "Practice replay").navigationBarTitleDisplayMode(.inline)
            .onDisappear { playback.pause() }.onChange(of: scenePhase) { _, phase in if phase != .active { playback.pause() } }
    }
}
private struct PracticePlayerSurface: UIViewRepresentable {
    let player: AVPlayer
    class Surface: UIView { override class var layerClass: AnyClass { AVPlayerLayer.self } }
    func makeUIView(context: Context) -> Surface { let view = Surface(); (view.layer as? AVPlayerLayer)?.player = player; return view }
    func updateUIView(_ view: Surface, context: Context) { (view.layer as? AVPlayerLayer)?.videoGravity = .resizeAspect }
}

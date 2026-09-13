import SwiftUI
import LiveKit

/// A room per attempt prevents an old connection from taking over a newer session.
@MainActor final class SharedLaneSession: ObservableObject {
    @Published private(set) var room: Room?
    @Published private(set) var busy = false
    @Published private(set) var publishing = false
    @Published private(set) var error: String?
    private var generation = 0
    private var accessCheck: Task<Void, Never>?
    private var idleTimerWasDisabled: Bool?
    private struct Credentials: Decodable { let serverUrl: String; let participantToken: String }
    private struct Failure: Decodable { let error: String }

    func join(bookID: String, publish: Bool, send: @escaping SeasonTransport) async {
        guard !busy, !Task.isCancelled else { return }
        accessCheck?.cancel(); accessCheck = nil
        generation += 1
        let attempt = generation
        busy = true; error = nil; publishing = false
        let previous = room
        room = nil
        await previous?.disconnect()
        guard attempt == generation else { return }
        let next = Room()
        room = next
        do {
            var request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/live/token")!, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["scorebookId": bookID, "mode": publish ? "publish" : "watch"])
            let (data, response) = try await send(request)
            guard attempt == generation, !Task.isCancelled else { await next.disconnect(); return }
            guard (200..<300).contains(response.statusCode) else {
                let message = (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Live Lane could not connect. Please try again."
                throw NSError(domain: "BA4L.Live", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
            }
            let credentials = try JSONDecoder().decode(Credentials.self, from: data)
            try await next.connect(url: credentials.serverUrl, token: credentials.participantToken)
            guard attempt == generation, !Task.isCancelled else { await next.disconnect(); return }
            if publish {
                // Camera only. Never request or enable microphone capture.
                try await next.localParticipant.setCamera(enabled: true, captureOptions: CameraCaptureOptions(position: .back))
                guard attempt == generation, !Task.isCancelled else { await next.disconnect(); return }
                publishing = true
            }
            if idleTimerWasDisabled == nil { idleTimerWasDisabled = UIApplication.shared.isIdleTimerDisabled }
            UIApplication.shared.isIdleTimerDisabled = true
            // Token expiry does not revoke an existing connection. Recheck membership
            // while connected, and stop media if access cannot be verified.
            accessCheck = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                    guard let self, self.generation == attempt else { return }
                    var check = request
                    check.timeoutInterval = 20
                    do {
                        let (_, response) = try await send(check)
                        guard !Task.isCancelled, self.generation == attempt else { return }
                        guard (200..<300).contains(response.statusCode) else {
                            self.leave()
                            self.error = "Team access could not be verified. Live video has stopped. Join again to retry."
                            return
                        }
                    } catch {
                        guard !Task.isCancelled, self.generation == attempt else { return }
                        self.leave()
                        self.error = "The access check lost connection. Live video has stopped. Join again to retry."
                        return
                    }
                }
            }
        } catch {
            await next.disconnect()
            guard attempt == generation else { return }
            room = nil
            self.error = (error as NSError).domain == "BA4L.Live"
                ? error.localizedDescription
                : "Live video could not connect. Check your connection and camera access, then try again."
            restoreIdleTimer()
        }
        if attempt == generation { busy = false }
    }

    func leave() {
        accessCheck?.cancel(); accessCheck = nil
        generation += 1
        let previous = room
        room = nil; busy = false; publishing = false
        restoreIdleTimer()
        Task { await previous?.disconnect() }
    }
    private func restoreIdleTimer() {
        if let previous = idleTimerWasDisabled { UIApplication.shared.isIdleTimerDisabled = previous }
        idleTimerWasDisabled = nil
    }
}

struct SharedLiveLaneView: View {
    @ObservedObject var store: ScorebookStore
    let bookID: String
    let intent: LiveLaneContext.Intent
    let send: SeasonTransport
    @StateObject private var session = SharedLaneSession()
    @StateObject private var replay = LaneReplaySession()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var joinTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Label(headline, systemImage: session.publishing ? "video.fill" : "person.2")
                            .font(.title2.bold()).accessibilityIdentifier("sharedLaneStatus")
                    }
                    Text("Only members of this scorebook can join. Shared video uses no microphone.")
                        .foregroundStyle(.secondary)
                    TimelineView(.periodic(from: .now, by: 1)) { timeline in
                        let context = LiveLaneContext.resolve(at: timeline.date, intent: sessionIntent)
                        Text(context.title + ((store.night.prebowl?.week ?? store.night.match?.week).map { " · Week \($0)" } ?? "")).font(.headline)
                        Text(store.night.prebowl != nil ? "Bowling ahead of league night. Scores stay attached to this pre-bowl’s week." : "Watch with the team. Scores update from this shared scorebook.").font(.caption).foregroundStyle(.secondary)
                        if let room = session.room {
                            Text(connectionLabel(room.connectionState)).font(.subheadline).foregroundStyle(.secondary)
                            let cameras = tracks(in: room)
                            if cameras.isEmpty {
                                ContentUnavailableView("Waiting for a lane camera", systemImage: "video", description: Text("A teammate can publish a mounted camera from this scorebook."))
                            } else {
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                                    ForEach(cameras.indices, id: \.self) { index in
                                        VStack(alignment: .leading) {
                                            LaneVideoView(track: cameras[index].track)
                                                .aspectRatio(4 / 3, contentMode: .fit)
                                                .background(Color("BrandForest"))
                                                .clipShape(RoundedRectangle(cornerRadius: 16))
                                                .accessibilityLabel(cameras[index].name + " live camera")
                                            Text(cameras[index].name).font(.headline)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if session.busy { ProgressView("Connecting to Live Lane…") }
                    if let error = session.error { Text(error).foregroundStyle(.red).accessibilityIdentifier("sharedLaneError") }
                    if !session.busy {
                        if session.room == nil || session.room?.connectionState == .disconnected {
                            Button("Join live video", systemImage: "arrow.clockwise") { join(publish: false) }
                                .buttonStyle(.borderedProminent).controlSize(.large)
                        }
                        if store.canEdit && store.error == nil && (store.role == .owner || store.role == .editor) && !session.publishing {
                            Button(publishTitle, systemImage: "video.badge.plus") { join(publish: true) }
                                .buttonStyle(.bordered).controlSize(.large).accessibilityIdentifier("publishLaneCamera")
                        }
                        if session.publishing {
                            Button("Stop broadcasting", systemImage: "stop.fill") { join(publish: false) }
                                .buttonStyle(.bordered).controlSize(.large)
                        }
                    }
                    GroupBox("Shared scorebook · Game \(store.night.game)") {
                        VStack(spacing: 10) {
                            ForEach(Night.names.indices, id: \.self) { index in
                                HStack { Text(Night.names[index]); Spacer(); Text(scoreLabel(index)).monospacedDigit() }
                            }
                            Text("Scores come from your shared scorebook, not video detection.").font(.caption).foregroundStyle(.secondary)
                        }.padding(.top, 8)
                    }
                    stakesPanel
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        let cameras = session.room.map { tracks(in: $0) } ?? []
                        LaneReplayPanel(replay: replay, sources: cameras.map { (name: $0.name, track: $0.track) })
                    }
                    Text("Automatic bowler recognition, ball tracking and coaching are not connected yet. Keep this screen open while broadcasting.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.padding().frame(maxWidth: 1200)
            }.background(Color("BrandIvory"))
                .navigationTitle("Team Live Lane").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Leave") { leave(); dismiss() }.frame(minHeight: 44) } }
        }.tint(BA4LTheme.tint)
            .task { join(publish: false) }
            .task {
                while !Task.isCancelled {
                    let previous = store.night
                    await store.refresh()
                    replay.scoreRefreshed(previous: previous, current: store.night, verified: store.error == nil && session.room?.connectionState == .connected)
                    try? await Task.sleep(for: .seconds(5))
                }
            }
            .task {
                while !Task.isCancelled {
                    let cameras = session.room.map { tracks(in: $0) } ?? []
                    replay.sourceIsAvailable(cameras.map(\.track), connected: session.room?.connectionState == .connected)
                    do { try await Task.sleep(for: .seconds(1)) } catch { break }
                }
            }
            .onChange(of: scenePhase) { _, phase in if phase == .background { replay.stop(); joinTask?.cancel(); joinTask = nil; session.leave() } }
            .onChange(of: store.teamID) { _, id in if id != bookID { leave(); dismiss() } }
            .onDisappear { leave() }
    }
    @ViewBuilder private var stakesPanel: some View {
        let cards = LiveStakes.cards(for: store.night)
        if !cards.isEmpty {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Label("What’s on the line", systemImage: "trophy").font(.headline)
                    Text("Game \(store.night.game) · Individual points").font(.subheadline)
                    let active = cards.filter { $0.status != .waiting }
                    if active.isEmpty { Text("Individual stakes appear when both lineups and scores are ready.").foregroundStyle(.secondary) }
                    ForEach(active.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(active[index].title).font(.subheadline.bold())
                            Text(active[index].detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Text("Each game matchup is worth 1 point; a tie splits it.").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
    // The room is bound to this loaded scorebook. Its competition metadata
    // takes precedence over a stale local context picker or today's weekday.
    private var sessionIntent: LiveLaneContext.Intent {
        store.night.prebowl != nil ? .prebowl : store.night.match != nil ? .league : .practice
    }
    private var publishTitle: String {
        sessionIntent == .prebowl ? "Start live pre-bowl" : sessionIntent == .league ? "Start live league night" : "Start live practice"
    }
    private func scoreLabel(_ index: Int) -> String {
        if let prebowl = store.night.prebowl, !prebowl.bowlers.contains(index) { return "Sitting out" }
        return "\(store.night.finals?[index] ?? store.night.current.bowling(index).settledScore)"
    }
    private func join(publish: Bool) {
        joinTask?.cancel()
        joinTask = Task { await session.join(bookID: bookID, publish: publish, send: send) }
    }
    private func leave() { replay.stop(clearMoment: true); joinTask?.cancel(); joinTask = nil; session.leave() }
    private var headline: String {
        guard let room = session.room else { return session.busy ? "Joining the team…" : "Live video stopped" }
        switch room.connectionState {
        case .connected:
            if session.publishing {
                let active = room.localParticipant.videoTracks.contains { publication in
                    guard let track = publication.track as? LocalVideoTrack else { return false }
                    return !publication.isMuted && track.capturer.captureState == .started
                }
                return active ? "Your camera is broadcasting" : "Camera paused"
            }
            return "Watching with the team"
        case .connecting: return "Joining the team…"
        case .reconnecting: return "Reconnecting to the team…"
        default: return session.busy ? "Joining the team…" : "Live video stopped"
        }
    }
    private func connectionLabel(_ state: ConnectionState) -> String {
        switch state {
        case .connected: return "Connected · live video"
        case .connecting: return "Connecting…"
        case .reconnecting: return "Reconnecting · video may pause"
        default: return "Disconnected · join again to watch"
        }
    }
    private struct Camera { let name: String; let track: VideoTrack }
    private func tracks(in room: Room) -> [Camera] {
        var result: [Camera] = []
        for participant in room.remoteParticipants.values.sorted(by: { ($0.identity?.stringValue ?? "") < ($1.identity?.stringValue ?? "") }) {
            for publication in participant.videoTracks {
                if let track = publication.track as? VideoTrack, !publication.isMuted {
                    result.append(Camera(name: participant.name ?? "Lane camera", track: track))
                }
            }
        }
        for publication in room.localParticipant.videoTracks {
            if let track = publication.track as? VideoTrack, !publication.isMuted { result.append(Camera(name: "Your camera", track: track)) }
        }
        return result
    }
}

private struct LaneVideoView: UIViewRepresentable {
    let track: VideoTrack
    func makeUIView(context: Context) -> LiveKit.VideoView { LiveKit.VideoView() }
    func updateUIView(_ view: LiveKit.VideoView, context: Context) { view.track = track }
    static func dismantleUIView(_ view: LiveKit.VideoView, coordinator: ()) { view.track = nil }
}

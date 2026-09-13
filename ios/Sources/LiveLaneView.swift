import SwiftUI

struct LiveLaneView: View {
    @ObservedObject var store: ScorebookStore
    let send: SeasonTransport
    @State private var showShared = false
    @State private var handoffTask: Task<Void, Never>?
    @StateObject private var camera = LiveLaneCamera()
    @State private var intent: LiveLaneContext.Intent = .automatic
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        context(at: timeline.date)
                        sharedEntry
                        if sizeClass == .regular && !typeSize.isAccessibilitySize {
                            HStack(alignment: .top, spacing: 24) {
                                cameraPanel(at: timeline.date).frame(maxWidth: .infinity)
                                details.frame(maxWidth: 360)
                            }
                        } else { cameraPanel(at: timeline.date); details }
                    }.padding()
                }.background(Color("BrandIvory"))
            }
            .navigationTitle("Live Lane").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { handoffTask?.cancel(); camera.stop(); dismiss() }.frame(minHeight: 44)
                }
            }
            .onChange(of: scenePhase) { _, phase in if phase == .background || (phase == .inactive && camera.state == .watching) { camera.pause() } }
            .onDisappear { handoffTask?.cancel(); camera.stop() }
            .fullScreenCover(isPresented: $showShared) {
                if let id = store.teamID { SharedLiveLaneView(store: store, bookID: id, intent: intent, send: send) }
            }
        }.tint(BA4LTheme.tint)
    }
    private func context(at date: Date) -> some View {
        let context = LiveLaneContext.resolve(at: date, intent: intent)
        return VStack(alignment: .leading, spacing: 8) {
            Label(context.title, systemImage: "dot.radiowaves.left.and.right")
                .font(.system(.title, design: .serif, weight: .bold))
            Text(context.explanation).font(.subheadline).foregroundStyle(BA4LTheme.secondary)
            Menu {
                Picker("Session context", selection: $intent) {
                    ForEach(LiveLaneContext.Intent.allCases) { value in Text(value.title).tag(value) }
                }
            } label: { Label("Context: \(intent.title)", systemImage: "slider.horizontal.3").frame(minHeight: 44) }
            Text("Thursday · warm-up 7:00 PM · league about 7:10 PM Central")
                .font(.caption).foregroundStyle(BA4LTheme.secondary)
        }
    }
    private func cameraPanel(at date: Date) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack {
                Color("BrandForest")
                if camera.state == .watching { LiveLanePreview(capture: camera.capture) }
                else {
                    VStack(spacing: 12) {
                        Image(systemName: "video").font(.largeTitle)
                        Text("A clear view of the lane").font(.headline)
                        Text("Mount your device outside the approach, with the release area and lane in view.")
                            .font(.subheadline).multilineTextAlignment(.center)
                    }.padding().foregroundStyle(Color("OnForest"))
                }
            }.aspectRatio(4 / 3, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 20))
                .accessibilityLabel("Live camera preview")
            Label(cameraStatus(at: date), systemImage: camera.state == .watching ? "video.fill" : "video.slash")
                .font(.headline).accessibilityIdentifier("liveLaneStatus")
            if let error = camera.observationError { Text(error).foregroundStyle(BA4LTheme.secondary) }
            HStack {
                if camera.state == .watching {
                    Button("Pause", systemImage: "pause.fill") { camera.pause() }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).frame(minHeight: 44)
                    Button("Stop", systemImage: "stop.fill") { camera.stop() }.buttonStyle(.bordered).frame(minHeight: 44)
                } else {
                    Button(camera.state == .paused ? "Resume framing preview" : "Check camera framing", systemImage: "video.fill") {
                        Task { await camera.start() }
                    }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).controlSize(.large)
                        .disabled(camera.state == .starting).accessibilityIdentifier("liveLaneStart")
                }
            }
            if case .unavailable(let message) = camera.state {
                Text(message).foregroundStyle(BA4LTheme.secondary)
                if let settings = URL(string: UIApplication.openSettingsURLString) { Link("Open Settings", destination: settings).frame(minHeight: 44) }
            }
            Text("Local preview and people detection. No audio, recording or broadcast. Keep Live Lane open while watching.")
                .font(.caption).foregroundStyle(BA4LTheme.secondary)
        }
    }
    private func cameraStatus(at date: Date) -> String {
        switch camera.state {
        case .ready: return "Camera off"
        case .starting: return "Starting camera…"
        case .paused: return "Paused · tap Resume when ready"
        case .unavailable: return "Camera unavailable"
        case .watching:
            guard let last = camera.lastObservation else { return "Camera live · waiting for observations" }
            guard date.timeIntervalSince(last) < 3 else { return "Camera live · observations delayed" }
            if camera.observationError != nil { return "Camera live · analysis unavailable" }
            return "Camera live · \(camera.peopleVisible) people visible"
        }
    }
    private var sharedEntry: some View {
            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Together at the lanes", systemImage: "person.2").font(.headline)
                    Text("Watch live lane cameras together on your team’s phones.")
                    if store.teamID != nil {
                        Button("Join team live video", systemImage: "video") {
                            camera.stop()
                            handoffTask?.cancel()
                            handoffTask = Task {
                                await camera.capture.waitUntilStopped()
                                guard !Task.isCancelled else { return }
                                showShared = true
                            }
                        }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).controlSize(.large).accessibilityIdentifier("joinTeamLive")
                    } else { Text("Open a night from Season to join its shared live video.") }
                    Text("Enable local replays inside the shared session. Coaching is not connected yet, and video does not automatically update scores.")
                        .font(.caption).foregroundStyle(BA4LTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
    }
    private var details: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Observation readiness", systemImage: "viewfinder").font(.headline)
                    Text("People in view are not yet identified as bowlers.")
                    Label("Ball path · tracking not connected", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    Label("Oil pattern · no pattern supplied", systemImage: "drop")
                    Text("A hidden release needs another angle. Missing path segments must remain unknown.")
                        .font(.caption).foregroundStyle(BA4LTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Scorebook · Game \(store.night.game)", systemImage: "list.bullet.rectangle").font(.headline)
                    Text("Existing scorebook, not camera-detected scores.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    ForEach(Night.names.indices, id: \.self) { index in
                        HStack {
                            Text(Night.names[index]); Spacer()
                            Text("\(store.night.finals?[index] ?? store.night.current.bowling(index).settledScore)")
                                .monospacedDigit().fontWeight(.semibold)
                        }
                    }
                    Text(store.status).font(.caption).foregroundStyle(BA4LTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }

        }
    }
}

struct LiveLaneListing: Decodable, Identifiable {
    let scorebookId: String
    let kind: String
    let week: Int?
    let bowlers: [String]
    let cameraCount: Int
    var id: String { scorebookId }
    var title: String {
        let label = kind == "prebowl" ? "Live pre-bowl" : kind == "league" ? "Live league night" : "Live practice"
        return week.map { "\(label) · Week \($0)" } ?? label
    }
}

@MainActor final class LiveLaneDiscovery: ObservableObject {
    struct Response: Decodable { let sessions: [LiveLaneListing]; let configured: Bool }
    @Published private(set) var sessions: [LiveLaneListing] = []
    @Published private(set) var message: String?
    @Published private(set) var checking = false
    private var generation = 0
    func stop() { generation += 1; checking = false; sessions = []; message = nil }
    func refresh(send: SeasonTransport) async {
        generation += 1
        let attempt = generation
        checking = true
        do {
            let request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/live/sessions")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
            let (data, response) = try await send(request)
            guard attempt == generation, !Task.isCancelled else { return }
            guard (200..<300).contains(response.statusCode) else { throw ScorebookError.invalidData }
            let result = try JSONDecoder().decode(Response.self, from: data)
            // Never retain old LIVE badges after a failed or disabled discovery check.
            sessions = result.configured ? result.sessions.filter { UUID(uuidString: $0.scorebookId) != nil && $0.cameraCount > 0 } : []
            message = result.configured ? (sessions.isEmpty ? "No team cameras are live right now." : nil) : "Team live video is being set up."
        } catch {
            guard attempt == generation, !Task.isCancelled else { return }
            sessions = []
            message = "Couldn’t check live cameras. Pull to refresh or try again shortly."
        }
        if attempt == generation { checking = false }
    }
}

/// Owns one in-memory scorebook for the lifetime of this viewer. Neither scores
/// nor selected-night preferences are persisted, including late async results.
@MainActor final class DiscoveredLaneModel: ObservableObject {
    let store: ScorebookStore
    @Published private(set) var ready = false
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    private var closed = false
    private let bookID: String
    init(bookID: String, send: @escaping SeasonTransport) {
        self.bookID = bookID
        let name = "com.dougkvamme.BA4L.live-view.\(UUID().uuidString)"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(name, isDirectory: true)
        store = ScorebookStore(client: ScorebookClient(send: { request in
            guard (request.httpMethod ?? "GET") == "GET" else { throw ScorebookError.server("This is a viewing scorebook.") }
            return try await send(request)
        }), defaults: UserDefaults(suiteName: name)!, directory: directory, ephemeral: true)
    }
    func close() { closed = true }
    func load() async {
        guard !loading, !closed else { return }
        loading = true; error = nil
        await store.start()
        await store.openTeam(ScorebookClient.origin + "/?night=" + bookID)
        guard !Task.isCancelled, !closed else { loading = false; return }
        ready = store.teamID == bookID && store.error == nil
        if !ready { error = "This live scorebook could not be opened. Check your connection and team access, then try again." }
        loading = false
    }
}

/// Watching never switches the scoring tab or overwrites its in-progress edits.
struct DiscoveredLiveLaneView: View {
    let listing: LiveLaneListing
    let send: SeasonTransport
    @StateObject private var model: DiscoveredLaneModel
    @Environment(\.dismiss) private var dismiss
    init(listing: LiveLaneListing, send: @escaping SeasonTransport) {
        self.listing = listing; self.send = send
        _model = StateObject(wrappedValue: DiscoveredLaneModel(bookID: listing.scorebookId, send: send))
    }
    var body: some View {
        Group {
            if model.ready && model.store.teamID == listing.scorebookId {
                SharedLiveLaneView(store: model.store, bookID: listing.scorebookId, intent: .automatic, send: send)
            } else {
                NavigationStack {
                    VStack(spacing: 20) {
                        Text(listing.title).font(.title2.bold())
                        if model.loading { ProgressView("Opening this scorebook…") }
                        if let error = model.error {
                            Text(error).multilineTextAlignment(.center).foregroundStyle(BA4LTheme.secondary)
                            Button("Try again") { Task { await model.load() } }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).controlSize(.large)
                        }
                    }.padding().frame(maxWidth: .infinity, maxHeight: .infinity).background(Color("BrandIvory"))
                        .navigationTitle("Watch the team").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { model.close(); dismiss() }.frame(minHeight: 44) } }
                }
            }
        }.task { await model.load() }.onDisappear { model.close() }
    }
}

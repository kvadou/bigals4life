import SwiftUI

struct LiveLaneView: View {
    @ObservedObject var store: ScorebookStore
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
                    Button("Close") { camera.stop(); dismiss() }.frame(minHeight: 44)
                }
            }
            .onChange(of: scenePhase) { _, phase in if phase == .background || (phase == .inactive && camera.state == .watching) { camera.pause() } }
            .onDisappear { camera.stop() }
        }.tint(BA4LTheme.tint)
    }
    private func context(at date: Date) -> some View {
        let context = LiveLaneContext.resolve(at: date, intent: intent)
        return VStack(alignment: .leading, spacing: 8) {
            Label(context.title, systemImage: "dot.radiowaves.left.and.right")
                .font(.system(.title, design: .serif, weight: .bold))
            Text(context.explanation).font(.subheadline).foregroundStyle(.secondary)
            Menu {
                Picker("Session context", selection: $intent) {
                    ForEach(LiveLaneContext.Intent.allCases) { value in Text(value.title).tag(value) }
                }
            } label: { Label("Context: \(intent.title)", systemImage: "slider.horizontal.3").frame(minHeight: 44) }
            Text("Thursday · warm-up 7:00 PM · league about 7:10 PM Central")
                .font(.caption).foregroundStyle(.secondary)
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
            if let error = camera.observationError { Text(error).foregroundStyle(.secondary) }
            HStack {
                if camera.state == .watching {
                    Button("Pause", systemImage: "pause.fill") { camera.pause() }.buttonStyle(.borderedProminent).frame(minHeight: 44)
                    Button("Stop", systemImage: "stop.fill") { camera.stop() }.buttonStyle(.bordered).frame(minHeight: 44)
                } else {
                    Button(camera.state == .paused ? "Resume camera" : "Start camera", systemImage: "video.fill") {
                        Task { await camera.start() }
                    }.buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(camera.state == .starting).accessibilityIdentifier("liveLaneStart")
                }
            }
            if case .unavailable(let message) = camera.state {
                Text(message).foregroundStyle(.secondary)
                if let settings = URL(string: UIApplication.openSettingsURLString) { Link("Open Settings", destination: settings).frame(minHeight: 44) }
            }
            Text("Local preview and people detection. No audio, recording or broadcast. Keep Live Lane open while watching.")
                .font(.caption).foregroundStyle(.secondary)
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
    private var details: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Observation readiness", systemImage: "viewfinder").font(.headline)
                    Text("People in view are not yet identified as bowlers.")
                    Label("Ball path · tracking not connected", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    Label("Oil pattern · no pattern supplied", systemImage: "drop")
                    Text("A hidden release needs another angle. Missing path segments must remain unknown.")
                        .font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Scorebook · Game \(store.night.game)", systemImage: "list.bullet.rectangle").font(.headline)
                    Text("Existing scorebook, not camera-detected scores.").font(.caption).foregroundStyle(.secondary)
                    ForEach(Night.names.indices, id: \.self) { index in
                        HStack {
                            Text(Night.names[index]); Spacer()
                            Text("\(store.night.finals?[index] ?? store.night.current.bowling(index).settledScore)")
                                .monospacedDigit().fontWeight(.semibold)
                        }
                    }
                    Text(store.status).font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Together at the lanes", systemImage: "person.2").font(.headline)
                    Text("Team video, replays and coaching are not connected yet.")
                    Text("This preview does not start a shared session or automatically update scores.")
                        .font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

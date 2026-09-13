import SwiftUI
import LiveKit

struct LiveStudioView: View {
    let accountID: String
    let send: SeasonTransport
    @StateObject private var model: LiveStudioModel
    @StateObject private var season: SeasonModel
    @Environment(\.dismiss) private var dismiss
    @State private var activity = "practice"
    @State private var audience = "only-me"
    @State private var title = ""
    @State private var bookID = ""
    @State private var privatePractice = false
    @State private var selected: StudioSession?
    init(accountID: String, send: @escaping SeasonTransport) {
        self.accountID = accountID; self.send = send
        _model = StateObject(wrappedValue: LiveStudioModel(send: send))
        _season = StateObject(wrappedValue: SeasonModel(send: send))
    }
    private var competitive: Bool { ["league", "prebowl"].contains(activity) }
    private var activityTitle: String { ["league":"League night", "prebowl":"Pre-bowl", "practice":"Practice", "social":"Hangout"][activity] ?? "Practice" }
    private var needsBook: Bool { competitive || audience == "team" }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Your lane. Your session.").font(.title2.bold())
                    Text("Choose what you’re doing, who can watch, and when to record.").foregroundStyle(BA4LTheme.secondary)
                }
                Section("Activity") {
                    Picker("Activity", selection: $activity) {
                        Text("League night").tag("league"); Text("Pre-bowl").tag("prebowl")
                        Text("Practice").tag("practice"); Text("Hangout").tag("social")
                    }
                    Text(competitive ? "Attach the right night. Video never writes scores automatically." : "Separate from league scores. No old scorebook carries into this session.").font(.callout).foregroundStyle(BA4LTheme.secondary)
                }
                Section("Who can watch") {
                    Picker("Audience", selection: $audience) {
                        if !competitive { Text("Only me").tag("only-me") }
                        Text("My team").tag("team")
                        Text("Invited people").tag("invited")
                    }
                    if needsBook {
                        Picker(competitive ? "Scorebook" : "Team membership", selection: $bookID) {
                            Text("Choose a night").tag("")
                            ForEach(season.season?.weeks ?? []) { week in
                                Text("\(week.title) · \(week.dateLabel)\(week.prebowl == nil ? "" : " · Pre-bowl")").tag(week.id)
                            }
                        }
                    }
                    if let error = season.error, needsBook { Text(error).foregroundStyle(.red) }
                    if audience == "invited" { Text("You’ll invite people by email after creating the session. Only confirmed invited accounts can watch.").font(.callout).foregroundStyle(BA4LTheme.secondary) }
                }
                Section("Recording") {
                    Text(audience == "only-me" ? "Camera and recording start only when you choose. Saved clips stay on this device in your private library." : "Recording starts off. Enable local replays inside the session and explicitly save the moments you want.").font(.callout)
                    if audience != "only-me" { TextField("Session title (optional)", text: $title).submitLabel(.done) }
                    Button(audience == "only-me" ? "Open private camera & library" : "Create \(activityTitle.lowercased()) session") {
                        if audience == "only-me" { privatePractice = true }
                        else { Task { selected = await model.create(activity: activity, audience: audience, title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? activityTitle : title, bookID: bookID.isEmpty ? nil : bookID) } }
                    }.frame(minHeight: 44).disabled(model.busy || (audience != "only-me" && needsBook && bookID.isEmpty))
                    if model.busy { ProgressView("Creating session…") }
                    if let error = model.error { Text(error).foregroundStyle(.red) }
                }
                Section("Your live sessions") {
                    if model.sessions.isEmpty { Text("No sessions available.").foregroundStyle(BA4LTheme.secondary) }
                    ForEach(model.sessions) { session in
                        Button { selected = session } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(session.title).font(.headline)
                                Text(session.activityTitle + " · " + (session.audience == "team" ? "Team" : "Invited people")).font(.caption).foregroundStyle(BA4LTheme.secondary)
                            }.frame(minHeight: 44)
                        }
                    }
                }
            }.navigationTitle("Live & practice")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
                .refreshable { await model.refresh(); await season.refresh() }
                .task { await model.refresh(); await season.refresh() }
                .onChange(of: activity) { _, _ in if competitive && audience == "only-me" { audience = "team" } }
                .fullScreenCover(isPresented: $privatePractice) { PrivatePracticeView(accountID: accountID) }
                .fullScreenCover(item: $selected, onDismiss: { Task { await model.refresh() } }) { item in
                    StudioBroadcastView(session: item, accountID: accountID, send: send)
                }
        }.tint(BA4LTheme.tint)
    }
}

struct StudioBroadcastView: View {
    let session: StudioSession
    let accountID: String
    let send: SeasonTransport
    @StateObject private var connection = SharedLaneSession()
    @StateObject private var delivery = StudioDelivery()
    @StateObject private var replay = LaneReplaySession()
    @StateObject private var library: PrivatePracticeRecorder
    @StateObject private var model: LiveStudioModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var connectionTask: Task<Void, Never>?
    @State private var inviteEmail = ""
    @State private var invitationMessage: String?
    @State private var inviting = false
    @State private var ending = false
    @State private var confirmEnd = false
    @State private var expired = false
    init(session: StudioSession, accountID: String, send: @escaping SeasonTransport) {
        self.session = session; self.accountID = accountID; self.send = send
        _model = StateObject(wrappedValue: LiveStudioModel(send: send))
        _library = StateObject(wrappedValue: PrivatePracticeRecorder(accountID: accountID))
    }
    private struct Ack: Decodable { }
    private struct Camera: Identifiable { let track: VideoTrack; let local: Bool; var id: ObjectIdentifier { ObjectIdentifier(track) } }
    private var cameras: [Camera] {
        guard let room = connection.room else { return [] }
        var result: [Camera] = []
        for publication in room.localParticipant.videoTracks { if !publication.isMuted, let track = publication.track as? VideoTrack { result.append(.init(track: track, local: true)) } }
        for participant in room.remoteParticipants.values.sorted(by: { ($0.identity?.stringValue ?? "") < ($1.identity?.stringValue ?? "") }) {
            for publication in participant.videoTracks { if !publication.isMuted, let track = publication.track as? VideoTrack { result.append(.init(track: track, local: false)) } }
        }
        return result
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(session.activityTitle + " · " + (session.audience == "team" ? "Team" : "Invited people")).font(.headline)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        deliveryPanel
                        if cameras.isEmpty {
                            ContentUnavailableView("Ready for video", systemImage: "video", description: Text(connection.busy ? "Connecting…" : "Join to watch, or start your camera when you’re ready."))
                        }
                        ForEach(cameras) { camera in
                            SharedLaneVideoTile(track: camera.track, name: camera.local ? "Your camera" : "Team camera", isLocal: camera.local, retry: { join(publish: connection.publishing) })
                        }
                        LaneReplayPanel(replay: replay, sources: cameras.map { (name: $0.local ? "Your camera" : "Team camera", track: $0.track) })
                    }
                    if let moment = replay.moment {
                        Button("Save kept replay to private library", systemImage: "square.and.arrow.down") {
                            Task { await library.importClip(from: moment.url) }
                        }.frame(minHeight: 44).disabled(library.saving)
                    }
                    if let message = library.message { Text(message).font(.callout) }
                    NavigationLink("Saved clips & comparisons") { PrivatePracticeLibrary(recorder: library) }.frame(minHeight: 44)
                    if let error = connection.error { Text(error).foregroundStyle(.red) }
                    HStack {
                        if connection.publishing { Button("Stop camera", role: .destructive) { join(publish: false) } }
                        else if session.canPublish { Button("Start camera", systemImage: "video") { join(publish: true) } }
                        Button("Reconnect") { join(publish: connection.publishing) }
                    }.buttonStyle(.bordered).controlSize(.large).disabled(connection.busy || expired)
                    Text("Keep this screen open while sharing. Backgrounding stops the stream. Microphone is off.").font(.callout).foregroundStyle(BA4LTheme.secondary)
                    if let id = session.scorebookId, let url = URL(string: ScorebookClient.origin + "/season/" + id) {
                        Link("Open attached scorebook", destination: url).frame(minHeight: 44)
                    }
                    if session.isOwner == true && session.audience == "invited" {
                        GroupBox("Invite someone") {
                            VStack(alignment: .leading, spacing: 12) {
                                TextField("Their email address", text: $inviteEmail).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                                Button("Add invitation") { Task { await invite() } }.disabled(inviting || inviteEmail.trimmingCharacters(in: .whitespaces).isEmpty || expired)
                                if let message = invitationMessage { Text(message).font(.callout) }
                                if let url = URL(string: ScorebookClient.origin + "/studio?session=" + session.id) {
                                    ShareLink("Share session link", item: url)
                                }
                                Text("Adding an invitation does not send email. Share the link with that person; they sign in using the invited address.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                            }.padding(.top, 8)
                        }
                    }
                    if session.isOwner == true { Button("End session for everyone", role: .destructive) { confirmEnd = true }.frame(minHeight: 44).disabled(ending) }
                    if let error = model.error { Text(error).foregroundStyle(.red) }
                }.padding().frame(maxWidth: 1100)
            }.background(Color("BrandIvory"))
                .navigationTitle(session.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Leave") { stop(); dismiss() } } }
                .confirmationDialog("End this live session for everyone?", isPresented: $confirmEnd, titleVisibility: .visible) { Button("End session", role: .destructive) { Task { await end() } } }
        }.tint(BA4LTheme.tint)
                .task { join(publish: false) }
                .task {
                    while !Task.isCancelled {
                        if let room = connection.room, room.connectionState == .connected, let id = connection.connectionID {
                            await delivery.refresh(sessionID: session.id, connectionID: id, room: room, model: model)
                            if delivery.mustDisconnect { expired = true; stop(); model.error = "Session access ended. Reopen an available session." }
                        } else { delivery.reset() }
                        replay.sourceIsAvailable(cameras.map(\.track), connected: connection.room?.connectionState == .connected)
                        do { try await Task.sleep(for: .seconds(5)) } catch { break }
                    }
                }
                .onChange(of: scenePhase) { _, phase in if phase == .background { stop() } }
                .onDisappear { stop() }
    }
    private var deliveryPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(connection.publishing ? (connection.cameraFramesArriving ? "Camera frames arriving" : "Waiting for camera") : "Watching session", systemImage: "video")
            if connection.publishing {
                Label(delivery.sentFrames > 0 && delivery.sentBytes > 0 ? "Sending video" : "Waiting for outgoing video", systemImage: "arrow.up")
            }
            if let health = delivery.freshHealth {
                Text("\(max(0, health.connectedCount - 1)) other connected device\(health.connectedCount == 2 ? "" : "s")").font(.subheadline)
                Label("\(health.cameraCount) published camera\(health.cameraCount == 1 ? "" : "s")", systemImage: "antenna.radiowaves.left.and.right")
                Text(health.receivingCount > 0 ? "\(health.receivingCount) device\(health.receivingCount == 1 ? " reports" : "s report") receiving video" : "No device has reported receiving video yet")
                    .font(.headline)
                Text("Receiver reports update about every 5 seconds. They confirm decoded frames, not who is watching the screen.").font(.caption).foregroundStyle(BA4LTheme.secondary)
            }
            if let error = delivery.error { Text(error).font(.callout).foregroundStyle(BA4LTheme.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.background, in: RoundedRectangle(cornerRadius: 12))
    }
    private func join(publish: Bool) {
        replay.stop(); delivery.reset(); connectionTask?.cancel()
        connectionTask = Task { await connection.join(bookID: "", publish: publish, liveSessionID: session.id, send: send) }
    }
    private func stop() { connectionTask?.cancel(); connectionTask = nil; replay.stop(clearMoment: true); connection.leave(); delivery.reset() }
    private func invite() async {
        inviting = true; defer { inviting = false }
        do { let _: Ack = try await model.request("/\(session.id)/invites", method: "POST", body: ["email": inviteEmail.trimmingCharacters(in: .whitespacesAndNewlines)]); invitationMessage = "Invitation added. Share the session link."; inviteEmail = "" }
        catch { invitationMessage = error.localizedDescription }
    }
    private func end() async {
        ending = true; defer { ending = false }
        do { let _: Ack = try await model.request("/\(session.id)", method: "PATCH", body: ["ended": true]); expired = true; stop(); dismiss() }
        catch { model.error = error.localizedDescription }
    }
}

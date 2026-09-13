import SwiftUI

struct GalleryEvent: Decodable, Identifiable {
    let id: String
    let kind: String
    let text: String
    let author: String
    let createdAt: String
    let isMine: Bool
}

@MainActor
final class NativeGalleryModel: ObservableObject {
    static let reactions = ["🎳", "🔥", "👏", "😂", "💪", "🦃"]
    static let chirps = ["That pin owes you money.", "Save some strikes for Thursday.", "The gutter called. You declined."]
    @Published private(set) var events: [GalleryEvent] = []
    @Published private(set) var paused = false
    @Published private(set) var loaded = false
    @Published private(set) var busy = false
    @Published private(set) var unavailable = false
    @Published var error: String?
    private let client: LiveStudioModel
    private let path: String
    private var revision = 0
    init(sessionID: String, send: @escaping SeasonTransport) {
        client = LiveStudioModel(send: send)
        path = "/\(sessionID)/gallery"
    }
    private struct Feed: Decodable { let events: [GalleryEvent]; let paused: Bool }
    private struct Posted: Decodable { let event: GalleryEvent }
    private struct Updated: Decodable { let updated: Bool }
    var canPost: Bool { loaded && !paused && !unavailable && !busy }
    static func boundedText(_ text: String) -> String {
        var result = ""
        for character in text { if result.utf16.count + String(character).utf16.count > 280 { break }; result.append(character) }
        return result
    }
    func refresh(clearError: Bool = false) async {
        if clearError { error = nil }
        let attempt = revision
        do {
            let feed: Feed = try await client.request(path)
            guard !Task.isCancelled, attempt == revision else { return }
            events = Array(feed.events.suffix(50)); paused = feed.paused; loaded = true; unavailable = false
        } catch {
            guard !Task.isCancelled, attempt == revision else { return }
            failed(error)
        }
    }
    @discardableResult func post(kind: String, text: String) async -> Bool {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canPost, ["reaction", "comment", "coach"].contains(kind), !text.isEmpty, text.utf16.count <= 280,
              kind != "reaction" || Self.reactions.contains(text) else { return false }
        busy = true; error = nil; defer { busy = false }
        do {
            let posted: Posted = try await client.request(path, method: "POST", body: ["kind":kind,"text":text])
            revision += 1
            // Only the server-confirmed event is rendered. Attribution never comes from the composer.
            if !events.contains(where: { $0.id == posted.event.id }) { events.append(posted.event); events = Array(events.suffix(50)) }
            return true
        } catch { failed(error); return false }
    }
    func moderate(paused next: Bool? = nil, removeID: String? = nil) async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false }
        do {
            let body: [String: Any] = next.map { ["paused":$0] } ?? ["removeId":removeID ?? ""]
            let result: Updated = try await client.request(path, method: "PATCH", body: body)
            guard result.updated else { self.error = "That change was not saved. Try again."; return }
            revision += 1
            if let next { paused = next }
            if let removeID { events.removeAll { $0.id == removeID } }
        } catch { failed(error) }
    }
    private func failed(_ error: Error) {
        self.error = error.localizedDescription
        if [401,403,404,410].contains((error as NSError).code) { unavailable = true; events = []; loaded = false }
    }
}

struct NativeGalleryView: View {
    let isHost: Bool
    let connected: Bool
    @StateObject private var gallery: NativeGalleryModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var hidden = false
    @State private var visible = false
    @State private var draft = ""
    @State private var kind = "comment"
    @State private var confirmingPause = false
    @State private var removing: GalleryEvent?
    init(sessionID: String, isHost: Bool, connected: Bool, send: @escaping SeasonTransport) {
        self.isHost = isHost
        self.connected = connected
        _gallery = StateObject(wrappedValue: NativeGalleryModel(sessionID: sessionID, send: send))
    }
    private var polling: Bool { connected && !hidden && visible && scenePhase == .active }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Peanut Gallery", systemImage: "bubble.left.and.bubble.right").font(.headline)
                Spacer()
                Button(hidden ? "Show" : "Hide") { hidden.toggle() }.frame(minHeight: 44)
                    .accessibilityLabel(hidden ? "Show Peanut Gallery" : "Hide Peanut Gallery")
            }
            if !hidden {
                Text("Cheer, chirp, or offer a tip. Everyone in this session can read it.").font(.callout).foregroundStyle(BA4LTheme.secondary)
                if !connected { Text("Connect to join the gallery.").foregroundStyle(BA4LTheme.secondary) }
                if connected && !gallery.loaded && gallery.error == nil { ProgressView("Loading the gallery…") }
                if gallery.paused { Label("The host paused posting.", systemImage: "pause.circle").font(.callout) }
                if gallery.loaded && gallery.events.isEmpty { Text("First cheer is yours.").foregroundStyle(BA4LTheme.secondary) }
                ScrollViewReader { scroll in
                  VStack(alignment: .trailing, spacing: 4) {
                    ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(gallery.events) { event in
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(event.author + (event.isMine ? " · You" : "") + (event.kind == "coach" ? " · Coaching" : ""))
                                        .font(.caption.weight(.semibold)).foregroundStyle(BA4LTheme.secondary)
                                    Text(event.text).font(event.kind == "reaction" ? .title2 : .body).textSelection(.enabled)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                if isHost {
                                    Button { removing = event } label: { Image(systemName:"trash").frame(minWidth:44,minHeight:44) }
                                        .accessibilityLabel("Remove post by \(event.author)").disabled(gallery.busy)
                                }
                            }
                        }
                    }.padding(.vertical, 4)
                    Color.clear.frame(height: 1).id("gallery-bottom")
                    }.frame(height: gallery.events.isEmpty ? 0 : 200)
                        .accessibilityLabel("Recent gallery posts")
                        .onChange(of: gallery.loaded) { _, loaded in
                            if loaded { scroll.scrollTo("gallery-bottom", anchor: .bottom) }
                        }
                    if !gallery.events.isEmpty {
                        Button("Latest posts", systemImage: "arrow.down") { scroll.scrollTo("gallery-bottom", anchor: .bottom) }.frame(minHeight: 44)
                    }
                  }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], spacing: 8) {
                    ForEach(NativeGalleryModel.reactions, id: \.self) { reaction in
                        Button { Task { await gallery.post(kind:"reaction",text:reaction) } } label: {
                            Text(reaction).font(.title2).frame(maxWidth:.infinity,minHeight:44)
                        }.buttonStyle(.bordered).accessibilityLabel("React \(reaction)").disabled(!gallery.canPost || !polling)
                    }
                }
                DisclosureGroup("Friendly chirps") {
                    VStack(alignment:.leading,spacing:8) {
                        ForEach(NativeGalleryModel.chirps,id:\.self) { chirp in
                            Button(chirp) { kind = "comment"; draft = chirp }
                                .frame(minHeight:44).disabled(!gallery.canPost || !polling)
                        }
                    }
                }
                Picker("Post type", selection:$kind) { Text("Comment").tag("comment"); Text("Coaching tip").tag("coach") }.pickerStyle(.segmented)
                TextField(kind == "coach" ? "Offer a bowling tip" : "Say something to the lane", text:$draft,axis:.vertical)
                    .lineLimit(2...4).textFieldStyle(.roundedBorder).disabled(!gallery.canPost || !polling)
                    .onChange(of:draft) { _, value in draft = NativeGalleryModel.boundedText(value) }
                HStack {
                    Text("\(draft.utf16.count)/280").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Spacer()
                    Button(gallery.busy ? "Sending…" : "Send",systemImage:"paperplane") {
                        let submitted = draft
                        let submittedKind = kind
                        Task { if await gallery.post(kind:submittedKind,text:submitted), draft == submitted { draft = "" } }
                    }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).frame(minHeight:44)
                        .disabled(!gallery.canPost || !polling || draft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                }
                if let error = gallery.error {
                    Text(error).font(.callout).foregroundStyle(BA4LTheme.secondary)
                    Button("Refresh gallery") { Task { await gallery.refresh(clearError: true) } }.frame(minHeight:44).disabled(gallery.busy || !polling)
                }
                if isHost {
                    Button(gallery.paused ? "Resume posting" : "Pause posting",systemImage:gallery.paused ? "play.circle" : "pause.circle") { confirmingPause = true }
                        .frame(minHeight:44).disabled(gallery.busy || !gallery.loaded || gallery.unavailable)
                }
            }
        }.padding().background(.background,in:RoundedRectangle(cornerRadius:16))
            .onAppear { visible = true }.onDisappear { visible = false }
            .task(id:polling) {
                guard polling else { return }
                while !Task.isCancelled {
                    await gallery.refresh()
                    do { try await Task.sleep(for:.seconds(3)) } catch { break }
                }
            }
            .confirmationDialog(gallery.paused ? "Resume posting for everyone?" : "Pause posting for everyone?",isPresented:$confirmingPause,titleVisibility:.visible) {
                Button(gallery.paused ? "Resume posting" : "Pause posting") { Task { await gallery.moderate(paused:!gallery.paused) } }
                Button("Cancel",role:.cancel) {}
            }
            .confirmationDialog("Remove this post from the gallery?",isPresented:Binding(get:{removing != nil},set:{if !$0 {removing = nil}}),titleVisibility:.visible) {
                Button("Remove post",role:.destructive) { if let id = removing?.id { Task { await gallery.moderate(removeID:id) } }; removing = nil }
                Button("Cancel",role:.cancel) { removing = nil }
            }
    }
}

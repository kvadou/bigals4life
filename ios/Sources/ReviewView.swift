import SwiftUI

struct BroReview: Codable, Equatable {
    var context: BroContext
    var games: [BroGameReview]
    var debrief: [BroTurn]
    var closed: Bool
}
struct BroContext: Codable, Equatable {
    var lanes: String
    var onPair: Int?
    var lefties: Bool?
    var highRev: Bool?
    var oil: String
}
struct BroGameReview: Codable, Equatable {
    var ball: String?
    var tags: [String]
    var note: String
    static var empty: Self { .init(ball: nil, tags: [], note: "") }
}
struct BroTurn: Codable, Equatable {
    var role: String
    var text: String
    var question: String?
    var ideas: [BroIdea]?
    var at: String
}
struct BroIdea: Codable, Equatable {
    var key: String
    var text: String
    var source: String
    var url: String
    var agree: Int
}
struct BroProfile: Codable, Equatable {
    var arsenal: [String]
    var hand: String
    var language: String
}
struct BroGameFacts: Codable, Identifiable {
    let game: Int
    let complete: Bool
    let stats: BroGameStats
    var id: Int { game }
}
struct BroGameStats: Codable {
    let score: Int
    let strikes: Int
    let spares: Int
    let opens: Int
    let framesPlayed: Int
    let cleanFrames: Int
    let firstBallAvg: Double
    let tenth: String
}
struct BroPayload: Codable {
    struct Prebowl: Codable { let week: Int; let bowlers: [Int] }
    struct NightInfo: Codable {
        let week: Int?
        let bowledOn: String
        let prebowl: Prebowl?
        let opponent: String?
        let games: [BroGameFacts]
    }
    let night: NightInfo
    struct Paired: Codable { let name: String; let handicap: Int }
    struct League: Codable { let average: Int; let handicap: Int?; let toRaise: Int? }
    struct Opening: Codable { let text: String; let question: String? }
    let bowler: Int
    let names: [String]
    var review: BroReview
    var profile: BroProfile
    var paired: Paired?
    var league: League?
    var opening: Opening?
}

@MainActor
final class BroReviewModel: ObservableObject {
    @Published private(set) var payload: BroPayload?
    @Published private(set) var busy = false
    @Published private(set) var dirty = false
    @Published private(set) var error: String?
    @Published private(set) var status = ""
    @Published private(set) var answer = ""
    @Published private(set) var conflict = false
    @Published private(set) var localWriteFailed = false
    private let nightID: String
    private let send: SeasonTransport
    private let drafts: BroDraftStorage
    private var draft: BroDraft?
    private var remoteConflict: BroPayload?
    private var autosave: Task<Void, Never>?
    private struct Failure: Decodable { let error: String }
    private struct SaveBody: Encodable { let bowler: Int; let review: BroReview; let profile: BroProfile; let expectedReview: BroReview; let expectedProfile: BroProfile }
    private struct DebriefBody: Encodable { let bowler: Int; let review: BroReview; let answer: String?; let expectedReview: BroReview; let expectedProfile: BroProfile }
    private struct DebriefResponse: Decodable { let review: BroReview }
    private struct Saved: Decodable { let ok: Bool }

    init(nightID: String, accountID: String, draftRoot: URL? = nil, send: @escaping SeasonTransport) {
        self.nightID = nightID; self.send = send
        drafts = BroDraftStorage(accountID: accountID, nightID: nightID, root: draftRoot)
    }
    var name: String { guard let p = payload, p.names.indices.contains(p.bowler) else { return "Your" }; return p.names[p.bowler] }
    var awaitingAnswer: Bool { payload?.review.closed == false && payload?.review.debrief.last?.role == "coach" && !(payload?.review.debrief.last?.question?.isEmpty ?? true) }
    var canTalk: Bool { !conflict && !localWriteFailed && payload?.night.games.contains(where: \.complete) == true && payload?.review.closed == false && (payload?.review.debrief.count ?? 8) < 8 }

    @discardableResult
    func load(bowler: Int? = nil) async -> Bool {
        guard !busy, !conflict, !localWriteFailed else { return false }
        autosave?.cancel()
        if dirty { guard await save() else { return false } }
        busy = true; error = nil; status = "Loading review…"
        defer { busy = false }
        var saved: BroDraft?
        do {
            saved = try bowler.map { try drafts.read(bowler: $0) } ?? drafts.latest()
            let selected = bowler ?? saved?.payload.bowler
            let fresh: BroPayload = try await request(reviewPath(selected))
            if saved?.payload.bowler != fresh.bowler { saved = try drafts.read(bowler: fresh.bowler) }
            if let saved {
                draft = saved; payload = saved.payload; answer = saved.answer
                dirty = saved.payload.review != saved.baseReview || saved.payload.profile != saved.baseProfile
                if fresh.review == saved.payload.review && fresh.profile == saved.payload.profile { dirty = false }
                if remoteChanged(fresh, from: saved) && (dirty || !answer.isEmpty) {
                    remoteConflict = fresh; conflict = true; status = "This review changed on another device. Choose which version to keep."; return true
                }
                if dirty { payload = withMetadata(fresh, review: saved.payload.review, profile: saved.payload.profile); status = "Restored your draft. Ready to save." }
                else { payload = fresh; status = "Saved" }
                draft?.baseReview = fresh.review; draft?.baseProfile = fresh.profile
            } else {
                payload = fresh; answer = ""; dirty = false
                draft = newDraft(fresh); status = "Saved"
            }
            guard persist() else { return false }
            return true
        } catch {
            self.error = error.localizedDescription
            if let saved {
                draft = saved; payload = saved.payload; answer = saved.answer
                dirty = saved.payload.review != saved.baseReview || saved.payload.profile != saved.baseProfile
                status = "Offline draft restored. Changes stay on this device until you reconnect."
                return true
            }
            status = "Could not load review"; return false
        }
    }

    func change(_ update: (inout BroPayload) -> Void) {
        guard !busy, !conflict, var next = payload else { return }
        update(&next); payload = next; dirty = true
        autosave?.cancel()
        guard persist() else { return }
        status = "Saved on this device"
        autosave = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(1.2)) } catch { return }
            guard !Task.isCancelled else { return }
            _ = await self?.save()
        }
    }
    func changeAnswer(_ value: String) {
        guard !busy, !conflict else { return }
        answer = String(value.prefix(1000))
        if persist() { status = "Answer saved on this device" }
    }
    func changeGame(_ index: Int, _ update: (inout BroGameReview) -> Void) {
        change { p in
            guard index >= 0, index < 6 else { return }
            while p.review.games.count <= index { p.review.games.append(.empty) }
            update(&p.review.games[index])
        }
    }

    @discardableResult
    func save() async -> Bool {
        guard !busy, !conflict else { return false }
        guard persist() else { return false }
        guard dirty, let p = payload, let base = draft else {
            error = nil; status = answer.isEmpty ? "Saved on this device" : "Answer saved on this device"
            return true
        }
        busy = true; error = nil; status = "Saving…"
        defer { busy = false }
        do {
            // Prevent known remote changes from being overwritten by an offline draft.
            let remote: BroPayload = try await request(reviewPath(p.bowler))
            if remoteChanged(remote, from: base) {
                if remote.review == p.review && remote.profile == p.profile {
                    draft?.baseReview = remote.review; draft?.baseProfile = remote.profile; dirty = false
                    guard persist() else { return false }; status = "Saved"; return true
                }
                remoteConflict = remote; conflict = true
                status = "This review changed on another device. Choose which version to keep."; return false
            }
            let response: Saved = try await request("/api/review/\(nightID)", method: "PUT", body: JSONEncoder().encode(SaveBody(bowler: p.bowler, review: p.review, profile: p.profile, expectedReview: base.baseReview, expectedProfile: base.baseProfile)))
            guard response.ok else { throw failure("Your review was not saved. Please retry.") }
            draft?.baseReview = p.review; draft?.baseProfile = p.profile
            dirty = false
            guard persist() else { return false }
            status = "Saved"; return true
        } catch { self.error = error.localizedDescription; status = "Saved on this device. Retry when connected."; if (error as NSError).code == 409 { await captureConflict(p.bowler) }; return false }
    }

    func talk(answer suppliedAnswer: String?) async -> Bool {
        guard !busy, canTalk else { return false }
        autosave?.cancel()
        if let suppliedAnswer { changeAnswer(suppliedAnswer) }
        guard persist() else { return false }
        if dirty { guard await save() else { return false } }
        guard let p = payload, let base = draft else { return false }
        busy = true; error = nil; status = "The coach is thinking…"
        defer { busy = false }
        do {
            let remote: BroPayload = try await request(reviewPath(p.bowler))
            if remoteChanged(remote, from: base) {
                remoteConflict = remote; conflict = true; status = "The conversation changed on another device. Review the saved version before answering."; return false
            }
            let result: DebriefResponse = try await request("/api/review/\(nightID)/debrief", method: "POST", body: JSONEncoder().encode(DebriefBody(bowler: p.bowler, review: p.review, answer: suppliedAnswer, expectedReview: base.baseReview, expectedProfile: base.baseProfile)))
            payload?.review = result.review; draft?.baseReview = result.review; draft?.baseProfile = p.profile
            dirty = false; answer = ""
            guard persist() else { return false }
            status = "Saved"; return true
        } catch { self.error = error.localizedDescription; status = "The coach could not answer. Your notes and answer are saved on this device."; if (error as NSError).code == 409 { await captureConflict(p.bowler) }; return false }
    }

    private func captureConflict(_ bowler: Int) async {
        // A server 409 may mean only part of a two-row save succeeded. Keep the entire draft.
        if let remote: BroPayload = try? await request(reviewPath(bowler)) {
            remoteConflict = remote; conflict = true
            status = "The server changed while saving. Your draft is safe. Choose a version before continuing."
        }
    }

    func resolveConflict(useDraft: Bool) {
        guard !busy, let remote = remoteConflict, let current = payload else { return }
        payload = useDraft ? withMetadata(remote, review: current.review, profile: current.profile) : remote
        if !useDraft { answer = "" }
        draft?.baseReview = remote.review; draft?.baseProfile = remote.profile
        dirty = useDraft && (current.review != remote.review || current.profile != remote.profile)
        if persist() { conflict = false; remoteConflict = nil; error = nil; status = useDraft ? "Draft kept. Tap Save to update the server." : "Loaded the server version." }
    }

    func reloadSavedDraft() {
        guard !busy, let bowler = payload?.bowler else { return }
        do {
            guard let stored = try drafts.read(bowler: bowler) else { throw failure("No saved draft was found. Keep this screen open and retry saving.") }
            draft = stored; payload = stored.payload; answer = stored.answer
            dirty = stored.payload.review != stored.baseReview || stored.payload.profile != stored.baseProfile
            localWriteFailed = false; error = nil; status = "Reloaded the saved draft. Unsaved changes from this window were replaced."
        } catch { self.error = error.localizedDescription }
    }

    @discardableResult
    private func persist() -> Bool {
        guard let p = payload, var value = draft else { return payload == nil }
        value.payload = p; value.answer = answer
        do {
            let expected = value.revision.isEmpty ? nil : value.revision
            draft = try drafts.write(value, expectedRevision: expected)
            localWriteFailed = false; return true
        } catch {
            localWriteFailed = true; self.error = error.localizedDescription
            status = "Could not save on this device. Keep this screen open and retry."; return false
        }
    }
    private func newDraft(_ p: BroPayload) -> BroDraft {
        BroDraft(revision: "", accountID: drafts.accountID, nightID: drafts.nightID, baseReview: p.review, baseProfile: p.profile, payload: p, answer: "", savedAt: Date())
    }
    private func remoteChanged(_ p: BroPayload, from d: BroDraft) -> Bool { p.review != d.baseReview || p.profile != d.baseProfile }
    private func withMetadata(_ p: BroPayload, review: BroReview, profile: BroProfile) -> BroPayload { var result = p; result.review = review; result.profile = profile; return result }
    private func reviewPath(_ bowler: Int?) -> String { "/api/review/\(nightID)" + (bowler.map { "?bowler=\($0)" } ?? "") }
    private func failure(_ text: String) -> NSError { NSError(domain: "BA4L.Review", code: 0, userInfo: [NSLocalizedDescriptionKey: text]) }
    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard UUID(uuidString: nightID) != nil else { throw failure("This night link is invalid.") }
        var r = URLRequest(url: URL(string: ScorebookClient.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        r.httpMethod = method; r.httpBody = body
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await send(r)
        guard (200..<300).contains(response.statusCode) else { throw NSError(domain: "BA4L.Review", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: (try? JSONDecoder().decode(Failure.self, from: data).error) ?? "Your review is unavailable. Try again."]) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// Parent supplies the NavigationStack. Every review is scoped to this account and night.
/// Opens as a conversation: the coach speaks first from the data already in hand. Setup sits behind one link.
struct ReviewView: View {
    @StateObject private var model: BroReviewModel
    @State private var selectedGame = 0
    @State private var pickedGame = false
    @State private var composer = ""
    @State private var showSetup = false
    @State private var newBall = ""
    @FocusState private var composing: Bool
    init(nightID: String, accountID: String, send: @escaping SeasonTransport) {
        _model = StateObject(wrappedValue: BroReviewModel(nightID: nightID, accountID: accountID, send: send))
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    recovery
                    if let p = model.payload {
                        gameChips(p)
                        conversation(p).disabled(model.conflict)
                        observations(p).disabled(model.conflict)
                        Color.clear.frame(height: 1).id("bottom")
                    } else if model.busy {
                        ProgressView("Opening your night…").frame(maxWidth: .infinity).padding(.top, 40)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { if model.payload != nil { composerBar } }
            .onChange(of: model.payload?.review.debrief.count ?? 0) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Bowling Bro’")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let p = model.payload {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(eyebrow(p)).font(.caption2.weight(.semibold)).textCase(.uppercase).tracking(0.6).foregroundStyle(BA4LTheme.secondary)
                        Text("Bowling Bro’").font(.headline)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 4) {
                        if p.night.prebowl?.bowlers.count != 1 {
                            Menu {
                                Picker("Bowler", selection: Binding(get: { p.bowler }, set: { value in Task { await model.load(bowler: value) } })) {
                                    ForEach(Array(p.names.enumerated()), id: \.offset) { index, name in Text(name).tag(index) }
                                }
                            } label: { Label(model.name, systemImage: "person.crop.circle").labelStyle(.titleAndIcon) }
                            .accessibilityIdentifier("reviewBowler")
                        }
                        Button("Setup") { showSetup = true }.accessibilityIdentifier("reviewSetup")
                    }
                }
            }
        }
        .sheet(isPresented: $showSetup) { setupSheet }
        .task { await model.load(); pickDefaultGame() }
        .onChange(of: model.payload?.night.games.filter(\.complete).count ?? 0) { _, _ in if !pickedGame { pickDefaultGame() } }
        .onDisappear { Task { await model.save() } }
    }

    private func eyebrow(_ p: BroPayload) -> String {
        [p.night.week.map { "Week \($0)" }, p.night.prebowl != nil ? "Pre-bowl" : p.night.opponent.map { "vs \($0.capitalized)" }].compactMap { $0 }.joined(separator: " · ")
    }
    private func pickDefaultGame() {
        guard let games = model.payload?.night.games, !games.isEmpty else { return }
        selectedGame = games.lastIndex(where: \.complete) ?? games.count - 1
    }

    // MARK: Recovery

    @ViewBuilder private var recovery: some View {
        if let error = model.error {
            VStack(alignment: .leading, spacing: 8) {
                Label(error, systemImage: "exclamationmark.circle").foregroundStyle(BA4LTheme.secondary)
                Button(model.localWriteFailed ? "Retry saving on this device" : model.payload == nil ? "Retry loading" : model.dirty ? "Retry saving" : "Reload review") {
                    Task { if model.dirty || model.localWriteFailed { await model.save() } else { await model.load() } }
                }.frame(minHeight: 44)
            }.card()
        }
        if model.conflict {
            VStack(alignment: .leading, spacing: 8) {
                Text("A newer version is on the server").font(.headline)
                Text("Your draft is safe on this device. Keeping it replaces the server review only after it next saves.")
                HStack {
                    Button("Keep my draft") { model.resolveConflict(useDraft: true) }.buttonStyle(.borderedProminent).tint(BA4LTheme.tint).foregroundStyle(BA4LTheme.onTint)
                    Button("Use server version", role: .destructive) { model.resolveConflict(useDraft: false) }.buttonStyle(.bordered)
                }.frame(minHeight: 44)
            }.card()
        }
        if model.localWriteFailed {
            VStack(alignment: .leading, spacing: 8) {
                Text("Draft recovery").font(.headline)
                Button("Reload saved draft", role: .destructive) { model.reloadSavedDraft() }.frame(minHeight: 44)
                Text("Reloading replaces this window’s unsaved changes with the last draft saved on this device.").font(.footnote).foregroundStyle(BA4LTheme.secondary)
            }.card()
        }
    }

    // MARK: Game chips

    @ViewBuilder private func gameChips(_ p: BroPayload) -> some View {
        if p.night.games.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "figure.bowling").font(.title2).foregroundStyle(BA4LTheme.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text("No games yet").font(.subheadline.weight(.semibold))
                    Text("Scores land here as they are bowled.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                }
            }.card()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(p.night.games.enumerated()), id: \.element.game) { index, game in
                        let on = index == selectedGame
                        Button {
                            selectedGame = index; pickedGame = true
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Game \(game.game) · \(game.stats.score)").font(.subheadline.weight(.semibold)).monospacedDigit()
                                Text(game.stats.framesPlayed > 0 ? "\(game.stats.strikes)X · \(game.stats.spares)/ · \(game.stats.opens) open" : game.complete ? "From the sheet" : "In progress")
                                    .font(.caption).foregroundStyle(on ? Color("OnGoldSurface").opacity(0.85) : BA4LTheme.secondary)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(on ? Color("BrandGoldSurface") : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? Color("BrandGold") : .clear, lineWidth: 1.5))
                            .foregroundStyle(on ? Color("OnGoldSurface") : .primary)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: 44)
                        .accessibilityLabel("Game \(game.game), \(game.stats.score)\(game.complete ? "" : ", in progress")")
                        .accessibilityAddTraits(on ? .isSelected : [])
                        .accessibilityIdentifier("reviewGame-\(game.game)")
                    }
                }
            }
        }
    }

    // MARK: Conversation

    private func conversation(_ p: BroPayload) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if p.review.debrief.isEmpty, let opening = p.opening {
                bubble(coach: true, text: opening.text, question: opening.question, ideas: [])
            }
            ForEach(Array(p.review.debrief.enumerated()), id: \.offset) { _, turn in
                bubble(coach: turn.role == "coach", text: turn.text, question: turn.question, ideas: turn.ideas ?? [])
            }
            if p.review.closed {
                Label("Review complete. Bring that target to your next night.", systemImage: "checkmark.circle")
                    .font(.footnote).foregroundStyle(BA4LTheme.secondary).padding(.top, 4)
            } else if p.review.debrief.count >= 8 {
                Text("That is plenty for one night. Pick it up next week.").font(.footnote).foregroundStyle(BA4LTheme.secondary)
            }
        }
    }

    private func bubble(coach: Bool, text: String, question: String?, ideas: [BroIdea]) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            if coach {
                Text("BB").font(.caption2.weight(.bold)).frame(width: 28, height: 28)
                    .background(BA4LTheme.tint, in: Circle()).foregroundStyle(BA4LTheme.onTint)
                    .accessibilityHidden(true)
            } else { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 8) {
                Text(text).textSelection(.enabled)
                if let question, !question.isEmpty { Text(question).fontWeight(.semibold) }
                ForEach(ideas, id: \.key) { idea in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(idea.text).font(.subheadline)
                        if let url = URL(string: idea.url), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                            Link(destination: url) { Label(idea.source, systemImage: "arrow.up.right") }.font(.footnote)
                        } else { Text(idea.source).font(.footnote).foregroundStyle(BA4LTheme.secondary) }
                    }
                    .padding(10)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(coach ? Color(.secondarySystemGroupedBackground) : Color("BrandGoldSurface"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .foregroundStyle(coach ? Color.primary : Color("OnGoldSurface"))
            if coach { Spacer(minLength: 40) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(coach ? "Coach" : model.name): \(text)\(question.map { " " + $0 } ?? "")")
    }

    // MARK: Observations

    @ViewBuilder private func observations(_ p: BroPayload) -> some View {
        if p.night.games.indices.contains(selectedGame) {
            let game = p.night.games[selectedGame]
            VStack(alignment: .leading, spacing: 8) {
                Text("Add what the sheet can't see · Game \(game.game)").font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.5).foregroundStyle(BA4LTheme.secondary)
                FlowChips {
                    ForEach(broTags, id: \.self) { tag in
                        let on = gameValue(selectedGame).tags.contains(tag)
                        let full = !on && gameValue(selectedGame).tags.count >= 6
                        Button(tag.capitalized) {
                            model.changeGame(selectedGame) { review in
                                if on { review.tags.removeAll { $0 == tag } } else if review.tags.count < 6 { review.tags.append(tag) }
                            }
                        }
                        .chip(on: on)
                        .disabled(full)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                    Menu {
                        Picker("Ball", selection: Binding(get: { gameValue(selectedGame).ball }, set: { value in model.changeGame(selectedGame) { $0.ball = value } })) {
                            Text("Not specified").tag(String?.none)
                            ForEach(p.profile.arsenal, id: \.self) { Text($0).tag(Optional($0)) }
                            if let existing = gameValue(selectedGame).ball, !p.profile.arsenal.contains(existing) { Text(existing).tag(Optional(existing)) }
                        }
                        Button("Add a ball in Setup") { showSetup = true }
                    } label: {
                        Label(gameValue(selectedGame).ball ?? "Ball", systemImage: "circle.fill")
                    }
                    .chip(on: gameValue(selectedGame).ball != nil)
                }
                if !gameValue(selectedGame).note.isEmpty {
                    Text("You said: \(gameValue(selectedGame).note)").font(.footnote).foregroundStyle(BA4LTheme.secondary)
                }
            }
        }
    }

    // MARK: Composer

    private var composerBar: some View {
        VStack(spacing: 6) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField(composerPrompt, text: $composer, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($composing)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .disabled(!canCompose)
                    .accessibilityIdentifier("reviewComposer")
                Button { Task { await sendComposer() } } label: {
                    Image(systemName: "arrow.up").font(.headline).frame(width: 40, height: 40)
                        .background(Color("BrandGold"), in: Circle()).foregroundStyle(Color("OnGoldSurface"))
                }
                .disabled(!canSend)
                .accessibilityLabel(sendLabel)
                .accessibilityIdentifier("reviewSend")
            }
            Text(statusLine).font(.caption2).foregroundStyle(BA4LTheme.secondary).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Review status: \(statusLine)")
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 6)
        .background(.bar)
    }

    private var canCompose: Bool { !model.conflict && !model.localWriteFailed && model.payload?.review.closed == false }
    private var composerPrompt: String {
        guard let p = model.payload else { return "" }
        if p.review.closed { return "Review complete" }
        if !p.night.games.contains(where: \.complete) { return "Finish a game and the coach can answer" }
        if model.awaitingAnswer { return "Reply to the coach…" }
        if p.review.debrief.isEmpty { return "Anything to add before the coach weighs in?" }
        return "Reply to the coach…"
    }
    private var canSend: Bool {
        guard model.canTalk else { return false }
        let text = composer.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.awaitingAnswer ? !text.isEmpty : model.payload?.review.debrief.isEmpty == true
    }
    private var sendLabel: String { model.awaitingAnswer ? "Send answer" : "Ask the coach" }
    private var statusLine: String {
        let turns = model.payload?.review.debrief.count ?? 0
        let saved = model.status.isEmpty ? "Saved" : model.status
        return "\(saved) · \(turns) of 8 turns"
    }
    @MainActor private func sendComposer() async {
        let text = composer.trimmingCharacters(in: .whitespacesAndNewlines)
        if model.awaitingAnswer {
            guard !text.isEmpty else { return }
            composer = ""
            if !(await model.talk(answer: text)) { composer = text }
        } else {
            // First turn: what the bowler typed is a note on the selected game, and the coach opens on it.
            if !text.isEmpty { model.changeGame(selectedGame) { $0.note = String(($0.note.isEmpty ? text : $0.note + " " + text).prefix(600)) } }
            composer = ""
            if !(await model.talk(answer: nil)) { composer = text }
        }
        composing = false
    }

    // MARK: Setup

    private var setupSheet: some View {
        NavigationStack {
            Form {
                if let p = model.payload {
                    Section("The lanes") {
                        TextField("Lanes, e.g. 7 & 8", text: contextString(\.lanes, limit: 12))
                        Picker("Bowlers on the pair", selection: Binding(get: { model.payload?.review.context.onPair ?? 0 }, set: { value in model.change { $0.review.context.onPair = value == 0 ? nil : value } })) {
                            Text("Not specified").tag(0)
                            ForEach(2...10, id: \.self) { Text(String($0)).tag($0) }
                        }
                        optionalBool("Lefties on the pair", key: \.lefties)
                        optionalBool("High-rev bowlers on the pair", key: \.highRev)
                        TextField("Oil pattern, if known", text: contextString(\.oil, limit: 40))
                    }
                    Section {
                        Picker("Bowling hand", selection: Binding(get: { model.payload?.profile.hand ?? "right" }, set: { value in model.change { $0.profile.hand = value } })) {
                            Text("Right").tag("right"); Text("Left").tag("left")
                        }
                        Picker("Coaching language", selection: Binding(get: { model.payload?.profile.language ?? "plain" }, set: { value in model.change { $0.profile.language = value } })) {
                            Text("Plain language").tag("plain"); Text("Technical").tag("technical")
                        }
                        ForEach(p.profile.arsenal, id: \.self) { Text($0) }
                        TextField("Add a ball", text: $newBall).onChange(of: newBall) { _, value in if value.count > 40 { newBall = String(value.prefix(40)) } }
                        Button("Add to arsenal") {
                            let value = newBall.trimmingCharacters(in: .whitespacesAndNewlines)
                            model.change { p in if !p.profile.arsenal.contains(value) && p.profile.arsenal.count < 12 { p.profile.arsenal.append(value) } }
                            newBall = ""
                        }.disabled(newBall.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || p.profile.arsenal.count >= 12)
                    } header: { Text("Your bowling profile") } footer: { Text("Set once a season. Your arsenal and preferences follow your account across devices.") }
                }
            }
            .navigationTitle("Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showSetup = false } } }
            .disabled(model.conflict)
        }
        .presentationDetents([.large])
    }

    private func gameValue(_ index: Int) -> BroGameReview {
        guard let games = model.payload?.review.games, games.indices.contains(index) else { return .empty }
        return games[index]
    }
    private func contextString(_ key: WritableKeyPath<BroContext, String>, limit: Int) -> Binding<String> {
        Binding(get: { model.payload?.review.context[keyPath: key] ?? "" }, set: { value in model.change { $0.review.context[keyPath: key] = String(value.prefix(limit)) } })
    }
    private func optionalBool(_ title: String, key: WritableKeyPath<BroContext, Bool?>) -> some View {
        Picker(title, selection: Binding(get: { model.payload?.review.context[keyPath: key].map { $0 ? 1 : 2 } ?? 0 }, set: { value in model.change { $0.review.context[keyPath: key] = value == 0 ? nil : value == 1 } })) {
            Text("Not specified").tag(0); Text("Yes").tag(1); Text("No").tag(2)
        }
    }
}

private let broTags = ["light", "high", "split", "bad break", "flush", "missed target", "washout", "pulled it", "fast feet"]

/// Wrapping row of chips. Lays children out left to right and wraps when the row is full.
private struct FlowChips<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        FlowLayout(spacing: 8) { content }
    }
}
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
    }
}

private extension View {
    func card() -> some View {
        self.padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
    func chip(on: Bool) -> some View {
        self.font(.subheadline.weight(.medium))
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(on ? Color("BrandGoldSurface") : Color(.secondarySystemGroupedBackground), in: Capsule())
            .overlay(Capsule().stroke(on ? Color("BrandGold") : Color.primary.opacity(0.12), lineWidth: 1))
            .foregroundStyle(on ? Color("OnGoldSurface") : Color.primary)
            .buttonStyle(.plain)
    }
}

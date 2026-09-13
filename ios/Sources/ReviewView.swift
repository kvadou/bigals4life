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
    let bowler: Int
    let names: [String]
    var review: BroReview
    var profile: BroProfile
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
struct ReviewView: View {
    @StateObject private var model: BroReviewModel
    @State private var newBall = ""
    init(nightID: String, accountID: String, send: @escaping SeasonTransport) {
        _model = StateObject(wrappedValue: BroReviewModel(nightID: nightID, accountID: accountID, send: send))
    }
    var body: some View {
        Form {
            if let error = model.error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle").foregroundStyle(BA4LTheme.secondary)
                    Button(model.localWriteFailed ? "Retry saving on this device" : model.payload == nil ? "Retry loading" : model.dirty ? "Retry saving" : "Reload review") {
                        Task { if model.dirty || model.localWriteFailed { await model.save() } else { await model.load() } }
                    }
                }
            }
            if model.conflict {
                Section("A newer version is on the server") {
                    Text("Your draft is safe on this device. Keeping it replaces the server review only after you tap Save.")
                    Button("Keep my draft") { model.resolveConflict(useDraft: true) }
                    Button("Use server version", role: .destructive) { model.resolveConflict(useDraft: false) }
                }
            }
            if model.localWriteFailed {
                Section("Draft recovery") {
                    Button("Reload saved draft", role: .destructive) { model.reloadSavedDraft() }
                    Text("Reloading replaces this window’s unsaved changes with the last draft saved on this device.").font(.footnote)
                }
            }
            if let p = model.payload {
                header(p).disabled(model.conflict)
                ForEach(Array(p.night.games.enumerated()), id: \.element.game) { index, game in
                    gameSection(index, game).disabled(model.conflict)
                }
                contextSection(p).disabled(model.conflict)
                profileSection(p).disabled(model.conflict)
                conversation(p).disabled(model.conflict)
            } else if model.busy {
                ProgressView("Opening your night…")
            }
            if !model.status.isEmpty { Section { Text(model.status).font(.footnote).foregroundStyle(BA4LTheme.secondary).accessibilityLabel("Review status: \(model.status)") } }
        }
        .navigationTitle("Bowling Bro’")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { Task { await model.save() } }.disabled(!model.dirty || model.busy)
            }
        }
        .disabled(model.busy)
        .overlay { if model.busy { ProgressView().padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)) } }
        .task { await model.load() }
        .onDisappear { Task { await model.save() } }
    }

    private func header(_ p: BroPayload) -> some View {
        Section {
            Text("How’d it go, \(model.name)?").font(.title2.weight(.semibold))
            Text([p.night.week.map { "Week \($0)" }, p.night.bowledOn, p.night.prebowl != nil ? "Pre-bowl" : p.night.opponent.map { "vs \($0)" }].compactMap { $0 }.joined(separator: " · "))
                .foregroundStyle(BA4LTheme.secondary)
            if p.night.prebowl?.bowlers.count != 1 {
                Picker("Bowler", selection: Binding(get: { p.bowler }, set: { value in
                    Task { await model.load(bowler: value) }
                })) { ForEach(Array(p.names.enumerated()), id: \.offset) { index, name in Text(name).tag(index) } }
            }
            let done = p.night.games.filter(\.complete)
            if !done.isEmpty {
                LabeledContent("Series", value: String(done.reduce(0) { $0 + $1.stats.score }))
                LabeledContent("Games finished", value: String(done.count))
            } else { Text("No finished games yet. You can add notes now and talk with the coach after a game.").foregroundStyle(BA4LTheme.secondary) }
        } footer: { Text("Scores are already in. Everything else is optional.") }
    }

    private func gameSection(_ index: Int, _ game: BroGameFacts) -> some View {
        Section("Game \(game.game) · \(game.stats.score)\(game.complete ? "" : " · unfinished")") {
            if game.stats.framesPlayed > 0 {
                Text("\(game.stats.strikes) strikes · \(game.stats.spares) spares · \(game.stats.opens) open").font(.subheadline)
                DisclosureGroup("Frame statistics") {
                    LabeledContent("Frames played", value: String(game.stats.framesPlayed))
                    LabeledContent("Clean frames", value: String(game.stats.cleanFrames))
                    LabeledContent("First ball average", value: game.stats.firstBallAvg.formatted(.number.precision(.fractionLength(0...1))))
                    if !game.stats.tenth.isEmpty { LabeledContent("Tenth frame", value: game.stats.tenth) }
                }
            } else { Text("Final score from the sheet. No frame detail.").font(.subheadline).foregroundStyle(BA4LTheme.secondary) }
            Picker("Ball", selection: gameBinding(index, \.ball, fallback: nil)) {
                Text("Not specified").tag(String?.none)
                let existing = gameValue(index).ball
                let arsenal = model.payload?.profile.arsenal ?? []
                ForEach(arsenal, id: \.self) { Text($0).tag(Optional($0)) }
                if let existing, !arsenal.contains(existing) { Text(existing).tag(Optional(existing)) }
            }
            DisclosureGroup("What you noticed") {
                ForEach(broTags, id: \.self) { tag in
                    Toggle(tag.capitalized, isOn: Binding(get: { gameValue(index).tags.contains(tag) }, set: { enabled in
                        model.changeGame(index) { review in
                            if enabled && !review.tags.contains(tag) && review.tags.count < 6 { review.tags.append(tag) }
                            else if !enabled { review.tags.removeAll { $0 == tag } }
                        }
                    }))
                    .disabled(!gameValue(index).tags.contains(tag) && gameValue(index).tags.count >= 6)
                }
                Text("Choose up to six observations.").font(.footnote).foregroundStyle(BA4LTheme.secondary)
            }
            TextField("Anything worth remembering", text: Binding(get: { gameValue(index).note }, set: { value in model.changeGame(index) { $0.note = String(value.prefix(600)) } }), axis: .vertical)
                .lineLimit(3...8).accessibilityLabel("Game \(game.game) notes")
        }
    }

    private func contextSection(_ p: BroPayload) -> some View {
        Section {
            DisclosureGroup("The lanes · optional") {
                TextField("Lanes, e.g. 7 & 8", text: contextString(\.lanes, limit: 12))
                Picker("Bowlers on the pair", selection: Binding(get: { model.payload?.review.context.onPair ?? 0 }, set: { value in model.change { $0.review.context.onPair = value == 0 ? nil : value } })) {
                    Text("Not specified").tag(0)
                    ForEach(2...10, id: \.self) { Text(String($0)).tag($0) }
                }
                optionalBool("Lefties on the pair", key: \.lefties)
                optionalBool("High-rev bowlers on the pair", key: \.highRev)
                TextField("Oil pattern, if known", text: contextString(\.oil, limit: 40))
            }
        }
    }

    private func profileSection(_ p: BroPayload) -> some View {
        Section {
            DisclosureGroup("Your bowling profile") {
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
            }
        } footer: { Text("Your arsenal and preferences follow your account across devices.") }
    }

    private func conversation(_ p: BroPayload) -> some View {
        Section("Talk it through") {
            ForEach(Array(p.review.debrief.enumerated()), id: \.offset) { _, turn in
                VStack(alignment: .leading, spacing: 12) {
                    Label(turn.role == "coach" ? "Coach" : model.name, systemImage: turn.role == "coach" ? "bubble.left.and.text.bubble.right" : "person.crop.circle").font(.headline)
                    Text(turn.text).textSelection(.enabled)
                    if let question = turn.question, !question.isEmpty { Text(question).fontWeight(.semibold) }
                    ForEach(turn.ideas ?? [], id: \.key) { idea in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(idea.text)
                            if let url = URL(string: idea.url), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                                Link(destination: url) { Label(idea.source, systemImage: "arrow.up.right") }.font(.footnote)
                            } else { Text(idea.source).font(.footnote).foregroundStyle(BA4LTheme.secondary) }
                        }
                    }
                }.padding(.vertical, 6)
            }
            if p.review.closed {
                Label("Review complete. Bring that target to your next night.", systemImage: "checkmark.circle")
            } else if model.awaitingAnswer {
                TextField("Your answer", text: Binding(get: { model.answer }, set: { model.changeAnswer($0) }), axis: .vertical).lineLimit(3...8)
                Button("Send answer") { Task { await model.talk(answer: model.answer.trimmingCharacters(in: .whitespacesAndNewlines)) } }
                    .disabled(model.answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.canTalk)
            } else if p.review.debrief.isEmpty {
                Text("Talk through the night now, or come back tomorrow. Your notes will still be here.").foregroundStyle(BA4LTheme.secondary)
                Button("Talk with the coach") { Task { await model.talk(answer: nil) } }.disabled(!model.canTalk)
            }
            if p.review.debrief.count >= 8 && !p.review.closed { Text("That is plenty for one night. Pick it up next week.").foregroundStyle(BA4LTheme.secondary) }
        }
    }

    private func gameValue(_ index: Int) -> BroGameReview {
        guard let games = model.payload?.review.games, games.indices.contains(index) else { return .empty }
        return games[index]
    }
    private func gameBinding<T>(_ index: Int, _ key: WritableKeyPath<BroGameReview, T>, fallback: T) -> Binding<T> {
        Binding(get: { gameValue(index)[keyPath: key] }, set: { value in model.changeGame(index) { $0[keyPath: key] = value } })
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

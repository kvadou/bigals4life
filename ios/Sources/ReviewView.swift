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
struct BroGameFacts: Decodable, Identifiable {
    let game: Int
    let complete: Bool
    let stats: BroGameStats
    var id: Int { game }
}
struct BroGameStats: Decodable {
    let score: Int
    let strikes: Int
    let spares: Int
    let opens: Int
    let framesPlayed: Int
    let cleanFrames: Int
    let firstBallAvg: Double
    let tenth: String
}
struct BroPayload: Decodable {
    struct NightInfo: Decodable {
        let week: Int?
        let bowledOn: String
        let prebowl: SeasonPrebowl?
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
    private let nightID: String
    private let send: SeasonTransport
    private var autosave: Task<Void, Never>?
    private struct Failure: Decodable { let error: String }
    private struct SaveBody: Encodable { let bowler: Int; let review: BroReview; let profile: BroProfile }
    private struct DebriefBody: Encodable { let bowler: Int; let review: BroReview; let answer: String? }
    private struct DebriefResponse: Decodable { let review: BroReview }
    private struct Saved: Decodable { let ok: Bool }

    init(nightID: String, send: @escaping SeasonTransport) { self.nightID = nightID; self.send = send }
    var name: String { guard let p = payload, p.names.indices.contains(p.bowler) else { return "Your" }; return p.names[p.bowler] }
    var awaitingAnswer: Bool { payload?.review.closed == false && payload?.review.debrief.last?.role == "coach" && !(payload?.review.debrief.last?.question?.isEmpty ?? true) }
    var canTalk: Bool { payload?.night.games.contains(where: \.complete) == true && payload?.review.closed == false && (payload?.review.debrief.count ?? 8) < 8 }

    @discardableResult
    func load(bowler: Int? = nil) async -> Bool {
        guard !busy else { return false }
        autosave?.cancel()
        if dirty { guard await save() else { return false } }
        busy = true; error = nil; status = "Loading review…"
        defer { busy = false }
        do {
            let path = "/api/review/\(nightID)" + (bowler.map { "?bowler=\($0)" } ?? "")
            let fresh: BroPayload = try await request(path)
            payload = fresh; dirty = false; status = "Saved"; return true
        } catch { self.error = error.localizedDescription; status = "Could not load review"; return false }
    }

    func change(_ update: (inout BroPayload) -> Void) {
        guard !busy, var next = payload else { return }
        update(&next); payload = next; dirty = true; status = "Unsaved changes"
        autosave?.cancel()
        autosave = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(1.2)) } catch { return }
            guard !Task.isCancelled else { return }
            _ = await self?.save()
        }
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
        guard !busy else { return false }
        guard dirty, let p = payload else { return true }
        busy = true; error = nil; status = "Saving…"
        defer { busy = false }
        do {
            let response: Saved = try await request("/api/review/\(nightID)", method: "PUT", body: JSONEncoder().encode(SaveBody(bowler: p.bowler, review: p.review, profile: p.profile)))
            guard response.ok else { throw NSError(domain: "BA4L.Review", code: 0, userInfo: [NSLocalizedDescriptionKey: "Your review was not saved. Please retry."]) }
            dirty = false; status = "Saved"; return true
        } catch { self.error = error.localizedDescription; status = "Not saved. Your notes remain on this screen."; return false }
    }

    func talk(answer: String?) async -> Bool {
        guard !busy, canTalk else { return false }
        autosave?.cancel()
        // Save the profile too: the coaching endpoint reads it independently.
        if dirty { guard await save() else { return false } }
        guard let p = payload else { return false }
        busy = true; error = nil; status = "The coach is thinking…"
        defer { busy = false }
        do {
            let result: DebriefResponse = try await request("/api/review/\(nightID)/debrief", method: "POST", body: JSONEncoder().encode(DebriefBody(bowler: p.bowler, review: p.review, answer: answer)))
            payload?.review = result.review; dirty = false; status = "Saved"; return true
        } catch { self.error = error.localizedDescription; status = "The coach could not answer. Your saved notes are safe."; return false }
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard UUID(uuidString: nightID) != nil else { throw NSError(domain: "BA4L.Review", code: 400, userInfo: [NSLocalizedDescriptionKey: "This night link is invalid."]) }
        var r = URLRequest(url: URL(string: ScorebookClient.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        r.httpMethod = method; r.httpBody = body
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await send(r)
        guard (200..<300).contains(response.statusCode) else {
            throw NSError(domain: "BA4L.Review", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: (try? JSONDecoder().decode(Failure.self, from: data).error) ?? "Your review is unavailable. Try again."])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// Parent supplies the NavigationStack. Every review is scoped to this account and night.
struct ReviewView: View {
    @StateObject private var model: BroReviewModel
    @State private var answer = ""
    @State private var newBall = ""
    init(nightID: String, send: @escaping SeasonTransport) {
        _model = StateObject(wrappedValue: BroReviewModel(nightID: nightID, send: send))
    }
    var body: some View {
        Form {
            if let error = model.error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    Button(model.payload == nil ? "Retry loading" : model.dirty ? "Retry saving" : "Reload review") {
                        Task { if model.dirty { await model.save() } else { await model.load() } }
                    }
                }
            }
            if let p = model.payload {
                header(p)
                ForEach(Array(p.night.games.enumerated()), id: \.element.game) { index, game in
                    gameSection(index, game)
                }
                contextSection(p)
                profileSection(p)
                conversation(p)
            } else if model.busy {
                ProgressView("Opening your night…")
            }
            if !model.status.isEmpty { Section { Text(model.status).font(.footnote).foregroundStyle(.secondary).accessibilityLabel("Review status: \(model.status)") } }
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
                .foregroundStyle(.secondary)
            if p.night.prebowl?.bowlers.count != 1 {
                Picker("Bowler", selection: Binding(get: { p.bowler }, set: { value in
                    Task { if await model.load(bowler: value) { answer = "" } }
                })) { ForEach(Array(p.names.enumerated()), id: \.offset) { index, name in Text(name).tag(index) } }
            }
            let done = p.night.games.filter(\.complete)
            if !done.isEmpty {
                LabeledContent("Series", value: String(done.reduce(0) { $0 + $1.stats.score }))
                LabeledContent("Games finished", value: String(done.count))
            } else { Text("No finished games yet. You can add notes now and talk with the coach after a game.").foregroundStyle(.secondary) }
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
            } else { Text("Final score from the sheet. No frame detail.").font(.subheadline).foregroundStyle(.secondary) }
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
                Text("Choose up to six observations.").font(.footnote).foregroundStyle(.secondary)
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
                            } else { Text(idea.source).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                }.padding(.vertical, 6)
            }
            if p.review.closed {
                Label("Review complete. Bring that target to your next night.", systemImage: "checkmark.circle")
            } else if model.awaitingAnswer {
                TextField("Your answer", text: $answer, axis: .vertical).lineLimit(3...8)
                    .onChange(of: answer) { _, value in if value.count > 1000 { answer = String(value.prefix(1000)) } }
                Button("Send answer") { Task { if await model.talk(answer: answer.trimmingCharacters(in: .whitespacesAndNewlines)) { answer = "" } } }
                    .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.canTalk)
            } else if p.review.debrief.isEmpty {
                Text("Talk through the night now, or come back tomorrow. Your notes will still be here.").foregroundStyle(.secondary)
                Button("Talk with the coach") { Task { await model.talk(answer: nil) } }.disabled(!model.canTalk)
            }
            if p.review.debrief.count >= 8 && !p.review.closed { Text("That is plenty for one night. Pick it up next week.").foregroundStyle(.secondary) }
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

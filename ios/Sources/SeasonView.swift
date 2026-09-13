import SwiftUI

/// Inject the account's authenticated transport. Tokens never belong to a screen model.
typealias SeasonTransport = (URLRequest) async throws -> (Data, HTTPURLResponse)

struct SeasonResponse: Decodable {
    let season: String
    let weeks: [SeasonWeek]
}

struct SeasonWeek: Decodable, Identifiable {
    let id: String
    let bowledOn: String
    let week: Int?
    let opponent: String?
    let opponentGames: [[Int?]]
    let ourHandicaps: [Int]?
    let prebowl: SeasonPrebowl?
    let games: [SeasonGame]
    let series: [Int?]
    let gamesBowled: [Int]
    let teamSeries: Int?
    let finishedGames: Int
    let recordedGames: Int
    let points: SeasonPoints?

    var title: String { week.map { "Week \($0)" } ?? "League night" }
    var dateLabel: String {
        let parts = bowledOn.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return bowledOn }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }
    var participants: [Int] { prebowl?.bowlers ?? Array(0..<4) }
    var progressLabel: String {
        if prebowl != nil {
            let count = participants.compactMap { gamesBowled.at($0) }.min() ?? 0
            return "\(count) of \(games.count) games finished · pre-bowl"
        }
        return "\(finishedGames) of \(games.count) team games finished"
    }
}

struct SeasonPrebowl: Decodable {
    let week: Int
    let bowlers: [Int]
}

struct SeasonGame: Decodable, Identifiable {
    let game: Int
    let scores: [Int?]
    let complete: [Bool]
    let team: Int?
    let hasRolls: Bool
    var id: Int { game }
}

struct SeasonPoints: Decodable {
    let ours: Double
    let theirs: Double
    let remaining: Double
    let team: [Double]
    let individual: [Double]
    let games: [SeasonGamePoints]
    let series: SeasonSeriesPoints
    let bowlers: [SeasonBowlerPoints]
}

struct SeasonGamePoints: Decodable, Identifiable {
    let game: Int
    let split: [Double]
    let ours: Int?
    let theirs: Int?
    var id: Int { game }
}

struct SeasonSeriesPoints: Decodable {
    let split: [Double]
    let ours: Int?
    let theirs: Int?
}

struct SeasonBowlerPoints: Decodable {
    let name: String
    let opponent: String
    let games: [[Double]]
    let series: [Double]
    let total: [Double]
}

struct SeasonAccount: Decodable {
    struct Book: Decodable, Identifiable {
        let id: String
        let role: String
        let updatedAt: String?
    }
    struct Legacy: Decodable, Identifiable {
        let id: String
        let updatedAt: String?
        let games: Int
    }
    let admin: Bool
    let scorebooks: [Book]
    let legacy: [Legacy]
}

@MainActor
final class SeasonModel: ObservableObject {
    @Published private(set) var season: SeasonResponse?
    @Published private(set) var account: SeasonAccount?
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var accountError: String?
    private let send: SeasonTransport
    init(send: @escaping SeasonTransport) { self.send = send }

    func refresh() async {
        guard !loading else { return }
        loading = true
        error = nil
        accountError = nil
        defer { loading = false }
        async let seasonResult: Result<SeasonResponse, Error> = load("/api/season")
        async let accountResult: Result<SeasonAccount, Error> = load("/api/me")
        switch await seasonResult {
        case .success(let response): season = response
        case .failure(let failure): error = failure.localizedDescription
        }
        switch await accountResult {
        case .success(let response): account = response
        case .failure(let failure): accountError = failure.localizedDescription
        }
    }

    private struct Failure: Decodable { let error: String }

    private func load<T: Decodable>(_ path: String) async -> Result<T, Error> {
        do {
            var request = URLRequest(url: URL(string: ScorebookClient.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await send(request)
            guard (200..<300).contains(response.statusCode) else {
                let fallback = response.statusCode == 401 ? "Sign in again to load your team’s season." : "The season could not be loaded. Try again."
                throw NSError(domain: "BA4L.Season", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: (try? JSONDecoder().decode(Failure.self, from: data).error) ?? fallback])
            }
            return .success(try JSONDecoder().decode(T.self, from: data))
        } catch { return .failure(error) }
    }
}

/// Collapses into a push-navigation list on iPhone; keeps weeks beside detail on iPad.
struct SeasonView: View {
    @StateObject private var model: SeasonModel
    @Binding private var selectedID: String?
    let onOpenNight: (String) -> Void
    private let send: SeasonTransport
    init(send: @escaping SeasonTransport, selection: Binding<String?>, onOpenNight: @escaping (String) -> Void) {
        _model = StateObject(wrappedValue: SeasonModel(send: send))
        _selectedID = selection
        self.onOpenNight = onOpenNight
        self.send = send
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedID) {
                if let error = model.error {
                    Section {
                        Label(error, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                            .foregroundStyle(BA4LTheme.secondary)
                        Button("Retry season") { Task { await model.refresh() } }
                    }
                }
                if let season = model.season {
                    Section {
                        ForEach(season.weeks) { week in
                            NavigationLink(value: week.id) { SeasonWeekRow(week: week) }
                        }
                    } header: { Text("Our season \(season.season)") }
                    if season.weeks.isEmpty {
                        ContentUnavailableView("No finished nights yet", systemImage: "calendar", description: Text("Your team’s recorded nights appear here. Open a scorebook below to continue bowling."))
                    }
                } else if model.loading {
                    ProgressView("Loading your season…")
                }
                if let account = model.account {
                    let finished = Set(model.season?.weeks.map(\.id) ?? [])
                    let otherBooks = account.scorebooks.filter { !finished.contains($0.id) }
                    if !otherBooks.isEmpty {
                        Section {
                            ForEach(otherBooks) { book in
                                Button { onOpenNight(book.id) } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Label("Open scorebook", systemImage: "sportscourt")
                                        Text("\(book.role.capitalized) · \(shortDate(book.updatedAt))")
                                            .font(.caption).foregroundStyle(BA4LTheme.secondary)
                                    }
                                }
                            }
                        } header: { Text("Other scorebooks") } footer: { Text("Nights without finished team games remain here until scores are recorded.") }
                    }
                    let unlisted = account.legacy.filter { !finished.contains($0.id) && !account.scorebooks.map(\.id).contains($0.id) }
                    if account.admin && !unlisted.isEmpty {
                        Section {
                            ForEach(unlisted) { book in
                                Button { onOpenNight(book.id) } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Label("Unclaimed scorebook", systemImage: "tray")
                                        Text("\(book.games) recorded games · \(shortDate(book.updatedAt))")
                                            .font(.caption).foregroundStyle(BA4LTheme.secondary)
                                    }
                                }
                            }
                        } header: { Text("Earlier scorebooks") } footer: { Text("These are visible to the league admin. Open the correct book before claiming it.") }
                    }
                }
                if let error = model.accountError {
                    Section("Scorebook discovery") {
                        Text(error).foregroundStyle(BA4LTheme.secondary)
                        Button("Retry scorebooks") { Task { await model.refresh() } }
                    }
                }
            }
            .navigationTitle("Season")
            .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 420)
            .refreshable { await model.refresh() }
            .toolbar { ToolbarItem(placement: .topBarTrailing) {
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refresh() } }.disabled(model.loading)
            } }
        } detail: {
            if let week = model.season?.weeks.first(where: { $0.id == selectedID }) {
                SeasonWeekDetail(week: week, send: send, onOpenNight: onOpenNight)
            } else {
                ContentUnavailableView("Every Thursday", systemImage: "calendar", description: Text("Choose a week to see the whole team’s scores and match points."))
            }
        }
        .task { await model.refresh() }
    }

    private func shortDate(_ value: String?) -> String {
        guard let value else { return "date unavailable" }
        return String(value.prefix(10))
    }
}

private struct SeasonWeekRow: View {
    let week: SeasonWeek
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(week.title).font(.headline)
                if week.prebowl != nil { Text("Pre-bowl").font(.caption).foregroundStyle(BA4LTheme.secondary) }
            }
            Text(week.dateLabel).font(.subheadline).foregroundStyle(BA4LTheme.secondary)
            if let opponent = week.opponent { Text("vs \(opponent)").font(.subheadline) }
            if let points = week.points { Text("\(number(points.ours))–\(number(points.theirs)) points").font(.headline).monospacedDigit() }
            else if let total = week.teamSeries { Text("Team series \(total)").font(.subheadline).monospacedDigit() }
            if let prebowl = week.prebowl {
                Text(prebowl.bowlers.map { bowlerName($0) }.joined(separator: ", ")).font(.subheadline)
            }
            Text(week.progressLabel).font(.caption).foregroundStyle(BA4LTheme.secondary)
        }
        .padding(.vertical, 6)
    }
}

struct SeasonWeekDetail: View {
    let week: SeasonWeek
    let send: SeasonTransport
    let onOpenNight: (String) -> Void
    var body: some View {
        List {
            Section {
                Text(week.dateLabel).font(.headline)
                if let opponent = week.opponent { Text("vs \(opponent)") }
                if week.prebowl != nil {
                    Label("Pre-bowl for \(week.participants.map { bowlerName($0) }.joined(separator: ", "))", systemImage: "calendar.badge.clock")
                    Text("Only participating bowlers count. Team totals wait for the whole team.").foregroundStyle(BA4LTheme.secondary)
                }
                Text(week.progressLabel).foregroundStyle(BA4LTheme.secondary)
                Button { onOpenNight(week.id) } label: { Label("Open live scorebook", systemImage: "sportscourt") }.accessibilityIdentifier("openSeasonScorebook")
            }
            Section("Frame-by-frame") {
                ForEach(week.games) { game in
                    NavigationLink {
                        WeekGameView(nightID: week.id, game: game.game, weekTitle: week.title, send: send)
                    } label: {
                        Label("Game \(game.game) scorecards", systemImage: "list.bullet.rectangle")
                    }
                }
            }
            Section("Team scorecards") {
                ForEach(0..<4, id: \.self) { index in
                    DisclosureGroup {
                        ForEach(week.games) { game in
                            scoreLine("Game \(game.game)", score: game.scores.at(index) ?? nil, complete: game.complete.at(index) ?? false)
                        }
                        LabeledContent("Games finished", value: String(week.gamesBowled.at(index) ?? 0))
                        if let value = week.series.at(index) ?? nil, let count = week.gamesBowled.at(index), count > 0 {
                            LabeledContent("Average", value: String(Int((Double(value) / Double(count)).rounded())))
                        }
                        if let handicap = week.ourHandicaps?.at(index) { LabeledContent("Handicap", value: "+\(handicap)") }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(bowlerName(index)).font(.headline)
                            Text(week.participants.contains(index) ? "Series \(scoreText(week.series.at(index) ?? nil))" : "Not part of this pre-bowl")
                                .font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                        }
                    }
                }
                ForEach(week.games) { game in
                    scoreLine("Team game \(game.game)", score: game.team, complete: game.team != nil)
                }
                LabeledContent("Team series", value: scoreText(week.teamSeries)).fontWeight(.semibold)
            }
            if let points = week.points {
                Section("Match points") {
                    LabeledContent("Us / them", value: "\(number(points.ours)) / \(number(points.theirs))").font(.headline)
                    LabeledContent("Still available", value: number(points.remaining))
                    LabeledContent("Team points", value: splitText(points.team))
                    LabeledContent("Individual points", value: splitText(points.individual))
                    ForEach(points.games) { game in
                        DisclosureGroup("Game \(game.game): \(splitText(game.split)) points") {
                            LabeledContent("Our total with handicap", value: scoreText(game.ours))
                            LabeledContent("Their total with handicap", value: scoreText(game.theirs))
                        }
                    }
                    DisclosureGroup("Series: \(splitText(points.series.split)) points") {
                        LabeledContent("Our series with handicap", value: scoreText(points.series.ours))
                        LabeledContent("Their series with handicap", value: scoreText(points.series.theirs))
                    }
                }
                Section("Head-to-head · us / them") {
                    ForEach(Array(points.bowlers.enumerated()), id: \.offset) { _, bowler in
                        DisclosureGroup {
                            ForEach(Array(bowler.games.enumerated()), id: \.offset) { index, split in
                                LabeledContent("Game \(index + 1)", value: splitText(split))
                            }
                            LabeledContent("Series", value: splitText(bowler.series))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(bowler.name) vs \(bowler.opponent)").font(.headline)
                                Text("\(splitText(bowler.total)) points").foregroundStyle(BA4LTheme.secondary)
                            }
                        }
                    }
                }
            } else {
                Section("Match points") { Text("No match has been set up for this night.").foregroundStyle(BA4LTheme.secondary) }
            }
            if !week.opponentGames.isEmpty {
                Section("Opponent scratch scores · lane order") {
                    ForEach(Array(week.opponentGames.enumerated()), id: \.offset) { index, scores in
                        DisclosureGroup("Game \(index + 1)") {
                            ForEach(Array(scores.enumerated()), id: \.offset) { bowler, score in
                                LabeledContent("Bowler \(bowler + 1)", value: scoreText(score))
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(week.title)
    }

    private func scoreLine(_ title: String, score: Int?, complete: Bool) -> some View {
        LabeledContent(title) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(scoreText(score)).monospacedDigit()
                if !complete { Text(score == nil ? "Not recorded" : "Unfinished").font(.caption).foregroundStyle(BA4LTheme.secondary) }
            }
        }
    }
}

private let seasonBowlers = ["Doug", "Mustafa", "Kyle", "Pete"]
private func bowlerName(_ index: Int) -> String { seasonBowlers.at(index) ?? "Bowler \(index + 1)" }
private func scoreText(_ value: Int?) -> String { value.map(String.init) ?? "Not recorded" }
private func number(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }
private func splitText(_ value: [Double]) -> String { value.count == 2 ? "\(number(value[0])) / \(number(value[1]))" : "Not recorded" }
private extension Array {
    func at(_ index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

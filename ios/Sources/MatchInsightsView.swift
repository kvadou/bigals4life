import SwiftUI

// MARK: - Pure match scoring (mirrors web/lib/league/night-points.ts and points.ts)
struct NativeMatchPoints: Codable {
    struct Game: Codable { let game: Int; let ours: Int?; let theirs: Int?; let split: [Double] }
    struct Series: Codable { let ours: Int?; let theirs: Int?; let split: [Double] }
    struct Bowler: Codable { let name: String; let opponent: String; let games: [[Double]]; let series: [Double]; let total: [Double] }
    let team: [Double]; let individual: [Double]; let total: [Double]
    let games: [Game]; let series: Series; let bowlers: [Bowler]; let remaining: Double
}

enum NativeMatchScoring {
    static func ourGames(_ night: Night) -> [[Int?]] {
        let all = night.history + [night.current]
        return (1...3).map { number in
            let game = all.first { $0.game == number }
            return (0..<4).map { index in
                guard let game, game.complete(index) else { return nil }
                return game.score(index)
            }
        }
    }
    static func points(_ night: Night) -> NativeMatchPoints? {
        guard let match = night.match else { return nil }
        let rosterGames = ourGames(night)
        let ours = match.ours.enumerated().map { slot, bowler -> [Int?] in
            let index = Night.names.firstIndex(of: bowler.name) ?? slot
            return rosterGames.map { $0[index] }
        }
        let theirs = match.opponent.bowlers.indices.map { slot in
            (0..<3).map { game -> Int? in
                guard game < match.opponentGames.count, slot < match.opponentGames[game].count else { return nil }
                return match.opponentGames[game][slot]
            }
        }
        func total(_ rows: [[Int?]], _ bowlers: [MatchBowler], _ game: Int) -> Int? {
            guard rows.allSatisfy({ $0[game] != nil }) else { return nil }
            return rows.enumerated().reduce(0) { $0 + ($1.element[game] ?? 0) + bowlers[$1.offset].handicap }
        }
        let games = (0..<3).map { game -> NativeMatchPoints.Game in
            let ourTotal = total(ours, match.ours, game), theirTotal = total(theirs, match.opponent.bowlers, game)
            return .init(game: game + 1, ours: ourTotal, theirs: theirTotal, split: contest(ourTotal, theirTotal, 5))
        }
        func completedTotal(_ values: [Int?]) -> Int? { values.allSatisfy { $0 != nil } ? values.compactMap { $0 }.reduce(0, +) : nil }
        let ourSeries = completedTotal(games.map(\.ours)), theirSeries = completedTotal(games.map(\.theirs))
        let series = NativeMatchPoints.Series(ours: ourSeries, theirs: theirSeries, split: contest(ourSeries, theirSeries, 5))
        let bowlers = match.ours.enumerated().map { slot, bowler -> NativeMatchPoints.Bowler in
            let opponent = slot < match.opponent.bowlers.count ? match.opponent.bowlers[slot] : nil
            let ourScores = ours[slot], theirScores = slot < theirs.count ? theirs[slot] : [nil, nil, nil]
            let gs = (0..<3).map { game in
                contest(ourScores[game].map { $0 + bowler.handicap }, theirScores[game].map { $0 + (opponent?.handicap ?? 0) }, 1)
            }
            let bs = contest(completedTotal(ourScores).map { $0 + bowler.handicap * 3 }, completedTotal(theirScores).map { $0 + (opponent?.handicap ?? 0) * 3 }, 1)
            return .init(name: bowler.name, opponent: opponent?.name ?? "", games: gs, series: bs, total: gs.reduce(bs, add))
        }
        let team = games.map(\.split).reduce(series.split, add)
        let individual = bowlers.map(\.total).reduce([0, 0], add)
        let overall = add(team, individual)
        return .init(team: team, individual: individual, total: overall, games: games, series: series, bowlers: bowlers, remaining: 36 - overall[0] - overall[1])
    }
    private static func contest(_ ours: Int?, _ theirs: Int?, _ points: Double) -> [Double] {
        guard let ours, let theirs else { return [0, 0] }
        return ours > theirs ? [points, 0] : ours < theirs ? [0, points] : [points / 2, points / 2]
    }
    private static func add(_ lhs: [Double], _ rhs: [Double]) -> [Double] { [lhs[0] + rhs[0], lhs[1] + rhs[1]] }
}
// MARK: - End pure match scoring

struct MatchInsightsView: View {
    @ObservedObject var store: ScorebookStore
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var roster: InsightsRoster?
    @State private var known: [String: [Int]] = [:]
    @State private var prebowlChecked = false
    @State private var error: String?
    @State private var coachError: String?
    @State private var coach: InsightsCoach?
    @State private var coachedMatch: LeagueMatch?
    @State private var loading = false
    @State private var coaching = false
    @State private var loadID = UUID()

    var body: some View {
        List {
            if let match = store.night.match, let points = NativeMatchScoring.points(store.night) {
                Section("\(match.season) · Week \(match.week)") {
                    Text("vs \(match.opponent.name.capitalized)").font(.headline)
                    if store.pending { Label("Includes your local unsaved scores", systemImage: "icloud.slash").font(.caption).foregroundStyle(.secondary) }
                    InsightsValue("Match points", split(points.total))
                    InsightsValue("Still available", number(points.remaining))
                    InsightsValue("Team points", split(points.team))
                    InsightsValue("Individual points", split(points.individual))
                }
                Section("Team contests · with handicap") {
                    ForEach(points.games, id: \.game) { game in
                        InsightsValue("Game \(game.game)", contest(game.ours, game.theirs, game.split))
                    }
                    InsightsValue("Series", contest(points.series.ours, points.series.theirs, points.series.split))
                    Text("5 points per team game and 5 for the series. Ties split. Unfinished contests stay open.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Head to head") {
                    ForEach(Array(points.bowlers.enumerated()), id: \.offset) { _, bowler in
                        DisclosureGroup {
                            ForEach(Array(bowler.games.enumerated()), id: \.offset) { index, value in
                                InsightsValue("Game \(index + 1)", pointState(value))
                            }
                            InsightsValue("Series", pointState(bowler.series))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(bowler.name) vs \(bowler.opponent.capitalized)").font(.headline)
                                Text("\(split(bowler.total)) points").font(.subheadline).foregroundStyle(.secondary)
                            }.frame(minHeight: 44)
                        }
                    }
                }
                draftSection(match)
            } else {
                Section {
                    ContentUnavailableView("No match set up", systemImage: "person.2", description: Text("Set the opponent and handicaps in the scorebook to track the 36 match points."))
                }
            }
            targetsSection
            if loading { ProgressView("Loading league averages…") }
            if let error { Section { Text(error).foregroundStyle(.red); Button("Reload league data") { Task { await load() } }.frame(minHeight: 44) } }
        }
        .navigationTitle("Match & targets")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: store.night.match?.week) { await load() }
        .refreshable { await load() }
        .onChange(of: store.night) { _, _ in coach = nil; coachError = nil }
    }

    private var targetsSection: some View {
        let games = NativeMatchScoring.ourGames(store.night)
        return Section("Tonight’s targets") {
            if let targets = store.night.drinkTargets {
                Text("Chalkboard: \(targets.high) high · \(targets.low) low").font(.headline)
            } else {
                Text("Set the chalkboard numbers in the scorebook to track beer targets.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(Night.names.indices, id: \.self) { index in
                let finished = games.compactMap { $0[index] }
                let series = finished.reduce(0, +)
                let left = 3 - finished.count
                let bowler = oursRoster?.bowlers.first { matches($0.name, Night.names[index]) }
                VStack(alignment: .leading, spacing: 6) {
                    Text(Night.names[index]).font(.headline)
                    if let row = bowler, let average = row.average, let raise = row.toRaise, rosterMatchesSeason {
                        Text(left > 0 ? "\(max(0, raise - series)) more over \(left) game\(left == 1 ? "" : "s") raises the \(average) average." : series >= raise ? "Series \(series) raises the average." : "Series \(series). Below the series needed to raise the average.")
                        if let drop = row.toDrop { Text("Series below \(drop) drops the average.").font(.caption).foregroundStyle(.secondary) }
                    } else {
                        Text("No matching league average available.").foregroundStyle(.secondary)
                    }
                    if let target = store.night.drinkTargets {
                        ForEach(Array(Set([target.high, target.low])).sorted(), id: \.self) { value in
                            let complete = store.night.current.complete(index)
                            let score = store.night.current.score(index)
                            let maximum = store.night.maximum(index)
                            Label(complete ? (score == value ? "Hit \(value)" : "Finished at \(score), missed \(value)") : score <= value && value <= maximum ? "\(value) is still in range" : "\(value) is out of range", systemImage: complete && score == value ? "checkmark.circle.fill" : "target")
                                .font(.subheadline)
                        }
                    }
                }.padding(.vertical, 6)
            }
            Text("Average targets count completed games 1–3. Chalkboard checks use the current game’s scratch score; a target in range is not a guarantee of an exact finish.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func draftSection(_ match: LeagueMatch) -> some View {
        Section("Lineup draft") {
            Text(match.lane == .odd ? "Odd lane: we hand names in first." : match.lane == .even ? "Even lane: they hand names in first." : "Set odd or even lane in match setup before asking the coach.")
                .font(.callout).foregroundStyle(.secondary)
            ForEach(Array(match.ours.enumerated()), id: \.offset) { slot, bowler in
                InsightsValue("\(slot + 1). \(bowler.name)", "vs \(slot < match.opponent.bowlers.count ? match.opponent.bowlers[slot].name.capitalized : "Not assigned")")
                if let scores = draftKnown[bowler.name] { Text("Pre-bowled: \(scores.map(String.init).joined(separator: " · "))").font(.caption).foregroundStyle(.secondary) }
            }
            if let coach, coachedMatch == match {
                Text(coach.take).textSelection(.enabled)
                InsightsValue("Expected individual points", "\(number(coach.expected)) of 16")
                if let best = coach.best {
                    Text("Recommended order: \(best.order.joined(separator: ", "))").font(.headline)
                    Text("Expected \(number(best.expected)) of 16 individual points.").font(.subheadline)
                }
                Text("Recommendation only. Your saved lineup has not changed.").font(.caption).foregroundStyle(.secondary)
            }
            Button(coaching ? "Asking the coach…" : "Ask lineup coach", systemImage: "sparkles") { Task { await askCoach(match) } }
                .disabled(coaching || loading || coachInput(match) == nil)
                .frame(minHeight: 44)
            if coachInput(match) == nil {
                Text("Coaching needs four opponents, the lane, and a real average for every bowler from the matching season’s roster. Reload after the latest sheet is available.").font(.caption).foregroundStyle(.secondary)
            }
            if let coachError { Text(coachError).foregroundStyle(.red) }
        }
    }
    private var draftKnown: [String: [Int]] {
        var values = known
        if let prebowl = store.night.prebowl, prebowl.week == store.night.match?.week {
            let games = NativeMatchScoring.ourGames(store.night)
            for index in prebowl.bowlers where Night.names.indices.contains(index) {
                let scores = games.compactMap { $0[index] }
                if scores.count == 3 { values[Night.names[index]] = scores }
            }
        }
        return values
    }
    private var oursRoster: InsightsRoster.Team? {
        roster?.teams.first { $0.bowlers.contains { $0.name.uppercased().hasPrefix("DOUG KVAMME") } }
    }
    private var rosterMatchesSeason: Bool { store.night.match == nil || store.night.match?.season == roster?.season }
    private func matches(_ full: String, _ first: String) -> Bool { full.caseInsensitiveCompare(first) == .orderedSame || full.uppercased().hasPrefix(first.uppercased() + " ") }
    private func coachInput(_ match: LeagueMatch) -> [String: Any]? {
        guard prebowlChecked, let roster, roster.season == match.season, let lane = match.lane,
              match.ours.count == 4, match.opponent.bowlers.count == 4,
              let ourTeam = oursRoster, let theirTeam = roster.teams.first(where: { $0.number == match.opponent.number }) else { return nil }
        func side(_ bowlers: [MatchBowler], _ team: InsightsRoster.Team, ours: Bool) -> [[String: Any]]? {
            var result: [[String: Any]] = []
            for bowler in bowlers {
                guard let row = team.bowlers.first(where: { ours ? matches($0.name, bowler.name) : $0.name.caseInsensitiveCompare(bowler.name) == .orderedSame }), let average = row.average, average > 0 else { return nil }
                var item: [String: Any] = ["name": bowler.name, "average": average, "handicap": bowler.handicap]
                if ours, let scores = draftKnown[bowler.name] { item["known"] = scores }
                result.append(item)
            }
            return result
        }
        guard let ours = side(match.ours, ourTeam, ours: true), let theirs = side(match.opponent.bowlers, theirTeam, ours: false) else { return nil }
        return ["lane": lane.rawValue, "opponent": match.opponent.name, "ours": ours, "theirs": theirs]
    }
    @MainActor private func load() async {
        let token = UUID(); loadID = token; loading = true; error = nil; prebowlChecked = false; coach = nil
        defer { if loadID == token { loading = false } }
        do {
            let value: InsightsRoster = try await request("/api/league/teams")
            guard !Task.isCancelled, loadID == token else { return }
            roster = value
            if let week = store.night.match?.week {
                do {
                    let season: InsightsSeason = try await request("/api/season")
                    guard !Task.isCancelled, loadID == token, week == store.night.match?.week else { return }
                    var scores: [String: [Int]] = [:]
                    // API returns newest first. Keep the newest completed pre-bowl per bowler.
                    for night in season.weeks where night.prebowl?.week == week {
                        for index in night.prebowl?.bowlers ?? [] where Night.names.indices.contains(index) {
                            let games = (1...3).compactMap { n -> Int? in
                                guard let game = night.games.first(where: { $0.game == n }), index < game.complete.count, index < game.scores.count, game.complete[index] else { return nil }
                                return game.scores[index]
                            }
                            if games.count == 3, scores[Night.names[index]] == nil { scores[Night.names[index]] = games }
                        }
                    }
                    known = scores; prebowlChecked = true
                } catch {
                    guard !Task.isCancelled, loadID == token else { return }
                    self.error = "League averages loaded, but pre-bowl scores could not be checked. Retry before asking the coach."; known = [:]
                }
            }
        } catch { if !Task.isCancelled, loadID == token { self.error = error.localizedDescription } }
    }
    @MainActor private func askCoach(_ match: LeagueMatch) async {
        guard let body = coachInput(match) else { return }
        let snapshot = store.night
        coaching = true; coachError = nil
        defer { coaching = false }
        do {
            let answer: InsightsCoach = try await request("/api/league/lineup", body: body)
            guard store.night == snapshot else { return }
            coach = answer; coachedMatch = match
        } catch { coachError = error.localizedDescription }
    }
    private func request<T: Decodable>(_ path: String, body: [String: Any]? = nil) async throws -> T {
        var request = URLRequest(url: URL(string: ScorebookClient.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        if let body {
            request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(ScorebookClient.origin, forHTTPHeaderField: "Origin")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else { throw ScorebookError.server((try? JSONDecoder().decode(InsightsFailure.self, from: data))?.error ?? "League data could not load. Try again.") }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private func number(_ n: Double) -> String { n.formatted(.number.precision(.fractionLength(0...1))) }
    private func split(_ value: [Double]) -> String { "\(number(value[0])) – \(number(value[1]))" }
    private func pointState(_ value: [Double]) -> String { value.reduce(0, +) == 0 ? "Open" : split(value) }
    private func contest(_ ours: Int?, _ theirs: Int?, _ points: [Double]) -> String {
        "\(ours.map(String.init) ?? "Open") vs \(theirs.map(String.init) ?? "Open") · \(pointState(points))"
    }
}

private struct InsightsFailure: Decodable { let error: String }
private struct InsightsRoster: Decodable {
    struct Bowler: Decodable { let name: String; let average: Int?; let handicap: Int; let toRaise: Int?; let toDrop: Int? }
    struct Team: Decodable { let number: Int; let name: String; let bowlers: [Bowler] }
    let season: String; let week: Int; let teams: [Team]
}
private struct InsightsCoach: Decodable {
    struct Best: Decodable { let order: [String]; let expected: Double }
    let take: String; let expected: Double; let best: Best?
}
private struct InsightsSeason: Decodable {
    struct Week: Decodable {
        struct Game: Decodable { let game: Int; let scores: [Int?]; let complete: [Bool] }
        let prebowl: Prebowl?; let games: [Game]
    }
    let weeks: [Week]
}
private struct InsightsValue: View {
    let label: String; let value: String
    init(_ label: String, _ value: String) { self.label = label; self.value = value }
    var body: some View { LabeledContent(label) { Text(value).monospacedDigit() }.fixedSize(horizontal: false, vertical: true).frame(minHeight: 44).accessibilityElement(children: .combine) }
}

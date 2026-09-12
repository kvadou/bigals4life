import SwiftUI
import Charts

/// Uses the account's authenticated transport. No separate session or web view.
struct LeagueView: View {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var section = LeagueSection.standings

    var body: some View {
        NavigationStack {
            Group {
                switch section {
                case .standings: LeagueStandingsView(send: send)
                case .records: LeagueRecordsView(send: send)
                }
            }
            .navigationTitle(section.rawValue)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("League section", selection: $section) {
                        ForEach(LeagueSection.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("leagueSection")
                }
            }
        }
        .tint(BA4LTheme.tint)
    }
}

private enum LeagueSection: String, CaseIterable, Identifiable {
    case standings = "Standings", records = "Records"
    var id: String { rawValue }
}

private struct LeagueFailure: Decodable { let error: String }

private struct LeagueAPI {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    func load<T: Decodable>(_ path: String, season: String? = nil, body: [String: Any]? = nil) async throws -> T {
        var url = URLComponents(string: ScorebookClient.origin + path)!
        if let season, !season.isEmpty { url.queryItems = [URLQueryItem(name: "season", value: season)] }
        var request = URLRequest(url: url.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: body == nil ? 30 : 75)
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(ScorebookClient.origin, forHTTPHeaderField: "Origin")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else {
            throw ScorebookError.server((try? JSONDecoder().decode(LeagueFailure.self, from: data))?.error ?? "League data could not load. Please try again.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct LeagueSeason: Decodable, Identifiable {
    let name: String
    var id: String { name }
}
private struct LeagueStandings: Decodable {
    struct Season: Decodable { let name: String; let house: String; let weeksTotal: Int }
    struct Week: Decodable { let number: Int; let bowledOn: String; var recap: String? }
    struct Team: Decodable, Identifiable {
        struct Last: Decodable { let opponent: String; let points: Double; let hdcpGames: [Int]; let hdcpTotal: Int? }
        let number: Int; let name: String; let place: Int; let percentWon: Double
        let pointsWon: Double; let pointsLost: Double; let ytdWon: Double; let ytdLost: Double
        let scratchPins: Int?; let ours: Bool; let lastWeek: Last?
        var id: Int { number }
    }
    struct Bowler: Decodable, Identifiable {
        let name: String; let average: Int?; let handicap: Int?; let toRaise: Int?; let toDrop: Int?
        let games: [Int]?; let total: Int?; let matchPoints: Double?
        var id: String { name }
    }
    struct Leader: Decodable { let name: String; let team: String; let points: Double; let ours: Bool }
    struct History: Decodable, Identifiable { let week: Int; let points: Double?; let opponent: String?; let place: Int?; var id: Int { week } }
    struct Check: Decodable, Identifiable {
        struct Night: Decodable, Identifiable {
            struct Difference: Decodable { let who: String; let field: String; let ours: String; let gary: String }
            let nightId: String; let opponent: String; let checked: Int; let discrepancies: [Difference]
            var id: String { nightId }
        }
        let week: Int; let nights: [Night]; var id: Int { week }
    }
    let season: Season; let seasons: [LeagueSeason]; var week: Week
    let teams: [Team]; let roster: [Bowler]; let leaderboard: [Leader]; let history: [History]
    let reconciliation: [Check]
}

private struct LeagueStandingsView: View {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var standings: LeagueStandings?
    @State private var season = ""
    @State private var error: String?
    @State private var busy = false
    @State private var loadID = UUID()
    @State private var recapBusy = false
    @State private var recapError: String?

    var body: some View {
        List {
            if let standings {
                Section {
                    Picker("Season", selection: $season) {
                        Text("Latest season").tag("")
                        ForEach(standings.seasons) { Text($0.name).tag($0.name) }
                    }
                    Text(standings.season.name).font(.headline)
                    Text("Week \(standings.week.number) of \(standings.season.weeksTotal) · \(standings.season.house)")
                    Text("Sheet dated \(standings.week.bowledOn)").font(.caption).foregroundStyle(.secondary)
                }
                errorSection
                recapSection(standings)
                Section("Team standings") {
                    ForEach(standings.teams) { team in
                        DisclosureGroup {
                            LeagueValue("Won / lost", "\(leagueNumber(team.pointsWon)) / \(leagueNumber(team.pointsLost))")
                            LeagueValue("Win percentage", "\(team.percentWon.formatted(.number.precision(.fractionLength(1))))%")
                            LeagueValue("Year to date", "\(leagueNumber(team.ytdWon)) / \(leagueNumber(team.ytdLost))")
                            LeagueValue("Scratch pins", leagueNumber(team.scratchPins))
                            if let last = team.lastWeek {
                                LeagueValue("Last opponent", last.opponent.capitalized)
                                LeagueValue("Last week points", leagueNumber(last.points))
                                LeagueValue("Handicap games", last.hdcpGames.map(String.init).joined(separator: " · "))
                                LeagueValue("Handicap total", leagueNumber(last.hdcpTotal))
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(team.place). \(team.name.capitalized)").font(.headline)
                                Text("\(leagueNumber(team.pointsWon)) won · \(leagueNumber(team.pointsLost)) lost\(team.ours ? " · Our team" : "")")
                                    .font(.subheadline).foregroundStyle(team.ours ? BA4LTheme.tint : .secondary)
                            }.frame(minHeight: 44)
                        }
                    }
                }
                Section("Our lineup") {
                    ForEach(standings.roster) { bowler in
                        DisclosureGroup {
                            LeagueValue("Average", leagueNumber(bowler.average))
                            LeagueValue("Handicap", leagueNumber(bowler.handicap))
                            LeagueValue("Match points", leagueNumber(bowler.matchPoints))
                            LeagueValue("Last week", bowler.games?.map(String.init).joined(separator: " · ") ?? "Sat out")
                            LeagueValue("Series", leagueNumber(bowler.total))
                            LeagueValue("Series to raise average", leagueNumber(bowler.toRaise))
                            LeagueValue("Drops below", leagueNumber(bowler.toDrop))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(bowler.name.capitalized).font(.headline)
                                Text("Average \(leagueNumber(bowler.average)) · handicap \(leagueNumber(bowler.handicap))")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }.frame(minHeight: 44)
                        }
                    }
                }
                Section("Individual match points") {
                    ForEach(Array(standings.leaderboard.enumerated()), id: \.offset) { index, bowler in
                        LeagueValue("\(index + 1). \(bowler.name.capitalized)", "\(leagueNumber(bowler.points)) points", detail: bowler.team.capitalized + (bowler.ours ? " · Our team" : ""))
                    }
                }
                Section("Our week by week") {
                    if standings.history.isEmpty { Text("More weekly sheets will add the team's history.").foregroundStyle(.secondary) }
                    ForEach(standings.history.reversed()) { week in
                        LeagueValue("Week \(week.week)", "\(leagueNumber(week.points)) of 36", detail: (week.opponent?.capitalized ?? "Opponent unavailable") + (week.place.map { " · place \($0)" } ?? ""))
                    }
                }
                ForEach(standings.reconciliation) { check in
                    Section("Week \(check.week) · Sheet checks") {
                        ForEach(check.nights) { night in
                            DisclosureGroup {
                                ForEach(Array(night.discrepancies.enumerated()), id: \.offset) { _, difference in
                                    LeagueValue("\(difference.who.capitalized) · \(difference.field)", "Ours \(difference.ours) · sheet \(difference.gary)")
                                }
                                Text("Gary’s sheet is the official record.").font(.caption).foregroundStyle(.secondary)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("vs \(night.opponent.capitalized)")
                                    Text("\(night.checked) checked · \(night.discrepancies.count) differences")
                                        .font(.caption).foregroundStyle(.secondary)
                                }.frame(minHeight: 44)
                            }
                        }
                    }
                }
            } else if busy {
                ProgressView("Loading standings…")
            } else {
                ContentUnavailableView("Standings unavailable", systemImage: "list.number", description: Text(error ?? "No standings have been ingested yet."))
                Button("Try again") { Task { await load() } }.frame(minHeight: 44)
            }
        }
        .listStyle(.insetGrouped)
        .task(id: season) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private var errorSection: some View {
        if let error { Section { Text(error).foregroundStyle(.red); Button("Retry") { Task { await load() } } } }
    }
    private func recapSection(_ current: LeagueStandings) -> some View {
        Section("Week \(current.week.number) recap") {
            if let recap = current.week.recap, !recap.isEmpty {
                Text(recap).textSelection(.enabled)
                ShareLink(item: recap) { Label("Share recap", systemImage: "square.and.arrow.up") }
            } else { Text("No recap yet for this week.").foregroundStyle(.secondary) }
            Button(current.week.recap == nil ? "Write recap" : "Rewrite recap", systemImage: "sparkles") {
                Task { await writeRecap(current) }
            }.disabled(recapBusy || busy).frame(minHeight: 44)
            if recapBusy { ProgressView("Writing recap…") }
            if let recapError { Text(recapError).foregroundStyle(.red) }
        }
    }
    @MainActor private func load() async {
        let requestID = UUID(); loadID = requestID
        busy = true; error = nil
        defer { if loadID == requestID { busy = false } }
        do {
            let next: LeagueStandings = try await LeagueAPI(send: send).load("/api/league/standings", season: season)
            guard !Task.isCancelled, loadID == requestID else { return }
            standings = next; recapError = nil
        } catch {
            guard !Task.isCancelled, loadID == requestID else { return }
            self.error = error.localizedDescription
        }
    }
    @MainActor private func writeRecap(_ current: LeagueStandings) async {
        recapBusy = true; recapError = nil
        defer { recapBusy = false }
        do {
            struct Recap: Decodable { let recap: String }
            let result: Recap = try await LeagueAPI(send: send).load("/api/league/recap", body: ["season": current.season.name, "week": current.week.number, "force": current.week.recap != nil])
            guard standings?.season.name == current.season.name, standings?.week.number == current.week.number else { return }
            standings?.week.recap = result.recap
        } catch { recapError = error.localizedDescription }
    }
}

private struct LeagueMark: Decodable { let value: Int; let seasonName: String; let week: Int; let bowledOn: String }
private struct LeagueRecord: Decodable, Identifiable {
    struct Trend: Decodable { let seasonName: String; let week: Int; let average: Int }
    struct Night: Decodable {
        let seasonName: String; let week: Int; let bowledOn: String; let opponent: String?
        let average: Int?; let scratchGames: [Int]?; let series: Int
    }
    let blsId: Int; let name: String; let teamName: String; let seasons: [String]
    let highGame: LeagueMark?; let highSeries: LeagueMark?; let average: Int?; let handicap: Int?
    let gamesBowled: Int; let pins: Int; let nightsCounted: Int; let matchPoints: Double?
    let trend: [Trend]; let nights: [Night]
    var id: Int { blsId }
}
private struct LeagueRecordBook: Decodable {
    struct Coverage: Decodable, Identifiable { let name: String; let have: Int; let weeksTotal: Int; let missing: [Int]; var id: String { name } }
    let seasons: [LeagueSeason]; let scope: String?; let records: [LeagueRecord]; let coverage: [Coverage]; let ourTeam: String
}
private struct LeagueCareer: Decodable { let record: LeagueRecord; let perSeason: [LeagueRecord] }

private struct LeagueRecordsView: View {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var book: LeagueRecordBook?
    @State private var season = ""
    @State private var search = ""
    @State private var busy = false
    @State private var loadID = UUID()
    @State private var error: String?
    private var filtered: [LeagueRecord] {
        (book?.records ?? []).filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.teamName.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        List {
            if let book {
                Section {
                    Picker("Season", selection: $season) {
                        Text("All time").tag("")
                        ForEach(book.seasons) { Text($0.name).tag($0.name) }
                    }
                    Text("Computed from the weekly standings sheets.").font(.caption).foregroundStyle(.secondary)
                }
                if let error { Section { Text(error).foregroundStyle(.red); Button("Retry") { Task { await load() } } } }
                ForEach(book.coverage.filter { !$0.missing.isEmpty }) { gap in
                    Section("Record coverage") { Text("\(gap.name) is missing weeks \(gap.missing.map(String.init).joined(separator: ", ")). Records from those nights are not included.").font(.callout) }
                }
                if search.isEmpty {
                    highs(book.records, series: false)
                    highs(book.records, series: true)
                }
                Section("Every bowler · \(filtered.count)") {
                    if filtered.isEmpty { Text(search.isEmpty ? "No records in this season yet." : "No bowlers match your search.").foregroundStyle(.secondary) }
                    ForEach(filtered) { record in
                        NavigationLink { LeagueCareerView(id: record.blsId, send: send) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(record.name.capitalized).font(.headline)
                                Text(record.teamName.capitalized + (record.teamName == book.ourTeam ? " · Our team" : "")).font(.caption).foregroundStyle(.secondary)
                                Text("Avg \(leagueNumber(record.average)) · high \(leagueNumber(record.highGame?.value)) · \(record.gamesBowled) games")
                                    .font(.subheadline)
                            }.frame(minHeight: 44)
                        }
                    }
                }
            } else if busy { ProgressView("Loading records…") }
            else {
                ContentUnavailableView("Records unavailable", systemImage: "trophy", description: Text(error ?? "No weekly sheets have been ingested yet."))
                Button("Try again") { Task { await load() } }.frame(minHeight: 44)
            }
        }
        .searchable(text: $search, prompt: "Bowler or team")
        .task(id: season) { await load() }
        .refreshable { await load() }
    }
    private func highs(_ records: [LeagueRecord], series: Bool) -> some View {
        let mark: (LeagueRecord) -> LeagueMark? = { series ? $0.highSeries : $0.highGame }
        let sorted = records.filter { mark($0) != nil }.sorted {
            let lhs = mark($0)!.value, rhs = mark($1)!.value
            return lhs == rhs ? $0.name < $1.name : lhs > rhs
        }
        // Include all tied tenth-place records, matching the web ranking.
        let cutoff = sorted.count > 10 ? mark(sorted[9])!.value : 0
        let leaders = sorted.filter { mark($0)!.value >= cutoff }
        return Section(series ? "High series" : "High game") {
            if leaders.isEmpty { Text("No counted nights yet.").foregroundStyle(.secondary) }
            ForEach(leaders) { record in
                let value = mark(record)!
                let place = (sorted.firstIndex { mark($0)!.value == value.value } ?? 0) + 1
                NavigationLink { LeagueCareerView(id: record.blsId, send: send) } label: {
                    LeagueValue("\(place). \(record.name.capitalized)", String(value.value), detail: "\(value.seasonName) · week \(value.week)")
                }
            }
        }
    }
    @MainActor private func load() async {
        let requestID = UUID(); loadID = requestID
        busy = true; error = nil
        defer { if loadID == requestID { busy = false } }
        do {
            let result: LeagueRecordBook = try await LeagueAPI(send: send).load("/api/league/records", season: season)
            guard !Task.isCancelled, loadID == requestID else { return }
            book = result
        } catch { if !Task.isCancelled, loadID == requestID { self.error = error.localizedDescription } }
    }
}

private struct LeagueCareerView: View {
    let id: Int
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var career: LeagueCareer?
    @State private var error: String?
    @State private var busy = false
    @State private var loadID = UUID()
    var body: some View {
        List {
            if let career {
                let record = career.record
                Section(record.teamName.capitalized) {
                    LeagueValue("Counted nights", String(record.nightsCounted))
                    LeagueValue("Games", String(record.gamesBowled))
                    LeagueValue("Pins", record.pins.formatted())
                    LeagueValue("Average / handicap", "\(leagueNumber(record.average)) / \(leagueNumber(record.handicap))")
                    LeagueValue("Match points", leagueNumber(record.matchPoints))
                }
                Section("Career bests") {
                    best("High game", record.highGame)
                    best("High series", record.highSeries)
                }
                Section("Average trend") {
                    if record.trend.count > 1 {
                        Chart(Array(record.trend.enumerated()), id: \.offset) { index, point in
                            LineMark(x: .value("Week sequence", index), y: .value("Average", point.average))
                                .foregroundStyle(BA4LTheme.tint)
                            PointMark(x: .value("Week sequence", index), y: .value("Average", point.average))
                                .foregroundStyle(BA4LTheme.tint)
                                .accessibilityLabel("\(point.seasonName), week \(point.week)")
                                .accessibilityValue("Average \(point.average)")
                        }
                        .chartXAxis(.hidden)
                        .frame(height: 180)
                    }
                    DisclosureGroup("Weekly averages") {
                        ForEach(Array(record.trend.enumerated()), id: \.offset) { _, point in
                            LeagueValue("\(point.seasonName) · week \(point.week)", String(point.average))
                        }
                        if record.trend.isEmpty { Text("No averages recorded yet.").foregroundStyle(.secondary) }
                    }
                }
                Section("By season") {
                    ForEach(Array(career.perSeason.enumerated()), id: \.offset) { _, season in
                        DisclosureGroup(season.seasons.first ?? "Season") {
                            LeagueValue("Counted nights", String(season.nightsCounted))
                            LeagueValue("Average", leagueNumber(season.average))
                            best("High game", season.highGame)
                            best("High series", season.highSeries)
                        }
                    }
                }
                Section("Night by night · newest first") {
                    ForEach(Array(record.nights.enumerated()), id: \.offset) { _, night in
                        DisclosureGroup {
                            LeagueValue("Against", night.opponent?.capitalized ?? "Unavailable")
                            ForEach(Array((night.scratchGames ?? []).enumerated()), id: \.offset) { game, score in LeagueValue("Game \(game + 1)", String(score)) }
                            LeagueValue("Series", String(night.series))
                            LeagueValue("Average after", leagueNumber(night.average))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(night.seasonName) · week \(night.week)").font(.headline)
                                Text("\(night.bowledOn) · \(night.series) series").font(.subheadline).foregroundStyle(.secondary)
                            }.frame(minHeight: 44)
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            } else if busy { ProgressView("Loading career…") }
            else { ContentUnavailableView("Record unavailable", systemImage: "person.crop.rectangle", description: Text(error ?? "This bowler has no recorded games.")); Button("Try again") { Task { await load() } } }
        }
        .navigationTitle(career?.record.name.capitalized ?? "Bowler record")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: id) { await load() }
        .refreshable { await load() }
    }
    private func best(_ label: String, _ mark: LeagueMark?) -> some View {
        LeagueValue(label, leagueNumber(mark?.value), detail: mark.map { "\($0.seasonName) · week \($0.week) · \($0.bowledOn)" } ?? "No counted night yet")
    }
    @MainActor private func load() async {
        let requestID = UUID(); loadID = requestID
        busy = true; error = nil
        defer { if loadID == requestID { busy = false } }
        do {
            let result: LeagueCareer = try await LeagueAPI(send: send).load("/api/league/records/\(id)")
            guard !Task.isCancelled, loadID == requestID else { return }
            career = result
        } catch { if !Task.isCancelled, loadID == requestID { self.error = error.localizedDescription } }
    }
}

/// Values stack naturally under large text or narrow iPad windows.
private struct LeagueValue: View {
    let label: String; let value: String; let detail: String?
    init(_ label: String, _ value: String, detail: String? = nil) { self.label = label; self.value = value; self.detail = detail }
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent(label) { Text(value).monospacedDigit().foregroundStyle(.primary) }
            if let detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        .frame(minHeight: 44)
    }
}
private func leagueNumber(_ value: Int?) -> String { value.map(String.init) ?? "Not available" }
private func leagueNumber(_ value: Double?) -> String { value.map { $0.formatted(.number.precision(.fractionLength(0...1))) } ?? "Not available" }

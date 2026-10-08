import SwiftUI
import Charts

/// Uses the account's authenticated transport. No separate session or web view.
struct LeagueView: View {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    @State private var section = LeagueSection.standings

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("League section", selection: $section) {
                    ForEach(LeagueSection.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .accessibilityIdentifier("leagueSection")
                Group {
                    switch section {
                    case .standings: LeagueStandingsView(send: send, bowlers: false)
                    case .bowlers: LeagueStandingsView(send: send, bowlers: true)
                    case .records: LeagueRecordsView(send: send)
                    }
                }
            }
            .navigationTitle("League")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(BA4LTheme.tint)
    }
}

private enum LeagueSection: String, CaseIterable, Identifiable {
    case standings = "Standings", bowlers = "Bowlers", records = "Records"
    var id: String { rawValue }
}

// MARK: - Pure league math (mirrors web/lib/league/standings.ts)
enum NativeLeagueMath {
    static func ordinal(_ n: Int) -> String {
        let tens = n % 100
        let suffix: String
        if (11...13).contains(tens) { suffix = "th" }
        else { switch n % 10 { case 1: suffix = "st"; case 2: suffix = "nd"; case 3: suffix = "rd"; default: suffix = "th" } }
        return "\(n)\(suffix)"
    }
    /// First sentence of a recap, or the whole text when it has no sentence break.
    static func firstSentence(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var seen = ""
        for ch in trimmed {
            seen.append(ch)
            if ch == "\n" { return seen.trimmingCharacters(in: .whitespacesAndNewlines) }
            if ch == "." || ch == "!" || ch == "?" { return seen }
        }
        return seen
    }
    /// Points to reach `target` place: positive is behind, 0 is at or above. Nil when no team holds that place.
    static func pointsTo(place target: Int, ours: Double, teams: [(place: Int, points: Double)]) -> Double? {
        guard let team = teams.first(where: { $0.place == target }) else { return nil }
        return max(0, team.points - ours)
    }
    /// "9", "3.5", "71.5": whole numbers lose the decimal.
    static func points(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}
// MARK: - End pure league math

private struct LeagueFailure: Decodable { let error: String }

struct LeagueAPI {
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

struct LeagueSeason: Decodable, Identifiable {
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
        let scratchPins: Int?; let ours: Bool; let gapToAbove: Double?; let movement: Int?; let lastWeek: Last?
        var id: Int { number }
    }
    struct Bowler: Decodable, Identifiable {
        let name: String; let blsId: Int?; let average: Int?; let handicap: Int?; let toRaise: Int?; let toDrop: Int?
        let games: [Int]?; let total: Int?; let matchPoints: Double?
        var id: String { name }
    }
    struct Leader: Decodable { let name: String; let team: String; let points: Double; let ours: Bool }
    struct History: Decodable, Identifiable { let week: Int; let points: Double?; let lost: Double?; let opponent: String?; let place: Int?; var id: Int { week } }
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
    var ours: Team? { teams.first { $0.ours } }
}

private struct LeagueStandingsView: View {
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)
    let bowlers: Bool
    @State private var standings: LeagueStandings?
    @State private var season = ""
    @State private var error: String?
    @State private var busy = false
    @State private var loadID = UUID()
    @State private var recapBusy = false
    @State private var recapError: String?
    @State private var recapOpen = false

    var body: some View {
        List {
            if let standings {
                if bowlers { bowlerSections(standings) } else { standingsSections(standings) }
            } else if busy {
                ProgressView("Loading standings…")
            } else {
                ContentUnavailableView("Standings unavailable", systemImage: "list.number", description: Text(error ?? "No standings have been ingested yet."))
                Button("Try again") { Task { await load() } }.frame(minHeight: 44)
            }
        }
        .listStyle(.insetGrouped)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Season", selection: $season) {
                        Text("Latest season").tag("")
                        ForEach(standings?.seasons ?? []) { Text($0.name).tag($0.name) }
                    }
                } label: { Label("Season", systemImage: "calendar") }
                .accessibilityIdentifier("leagueSeason")
            }
        }
        .task(id: season) { await load() }
        .refreshable { await load() }
    }

    // MARK: Standings

    @ViewBuilder private func standingsSections(_ s: LeagueStandings) -> some View {
        Section { header(s) }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        errorSection
        Section {
            ForEach(Array(s.teams.enumerated()), id: \.element.id) { index, team in
                teamRow(team, first: index == 0)
                    .listRowBackground(team.ours ? Color("BrandGoldSurface") : nil)
            }
        } header: {
            HStack {
                Text("#").frame(width: 44, alignment: .leading)
                Text("Team")
                Spacer()
                Text("Pts").frame(width: 52, alignment: .trailing)
                Text("Gap").frame(width: 44, alignment: .trailing)
                Text("Wk").frame(width: 40, alignment: .trailing)
            }
            .font(.caption).monospacedDigit()
        }
        if !s.roster.isEmpty {
            Section("Our four") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(s.roster) { bowler in bowlerTile(bowler) }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
        }
        weekByWeek(s)
        recapSection(s)
        ForEach(s.reconciliation) { check in
            Section("Week \(check.week) · Sheet checks") {
                ForEach(check.nights) { night in
                    DisclosureGroup {
                        ForEach(Array(night.discrepancies.enumerated()), id: \.offset) { _, difference in
                            LeagueValue("\(difference.who.capitalized) · \(difference.field)", "Ours \(difference.ours) · sheet \(difference.gary)")
                        }
                        Text("Gary’s sheet is the official record.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("vs \(night.opponent.capitalized)")
                            Text("\(night.checked) checked · \(night.discrepancies.count) differences")
                                .font(.caption).foregroundStyle(BA4LTheme.secondary)
                        }.frame(minHeight: 44)
                    }
                }
            }
        }
    }

    private func header(_ s: LeagueStandings) -> some View {
        let lines = s.teams.map { (place: $0.place, points: $0.pointsWon) }
        let weeksLeft = max(0, s.season.weeksTotal - s.week.number)
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(s.season.name) · Week \(s.week.number) of \(s.season.weeksTotal)")
                .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.6)
                .foregroundStyle(BA4LTheme.onTint.opacity(0.8))
            if let ours = s.ours {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(NativeLeagueMath.ordinal(ours.place)) of \(s.teams.count)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .accessibilityIdentifier("leaguePlace")
                    Spacer()
                    Text("\(NativeLeagueMath.points(ours.pointsWon)) – \(NativeLeagueMath.points(ours.pointsLost))")
                        .font(.title2.weight(.semibold)).monospacedDigit()
                }
                Text(gapLine(ours, s))
                    .font(.subheadline.weight(.medium)).foregroundStyle(Color("BrandGold"))
                let fourth = NativeLeagueMath.pointsTo(place: 4, ours: ours.pointsWon, teams: lines)
                HStack(spacing: 6) {
                    Text("\(ours.percentWon.formatted(.number.precision(.fractionLength(1))))% won")
                    if ours.place > 4, let fourth { Text("·"); Text("\(NativeLeagueMath.points(fourth)) to 4th") }
                    Text("·"); Text("\(weeksLeft) weeks left")
                }
                .font(.caption).foregroundStyle(BA4LTheme.onTint.opacity(0.85))
                if ours.place > 4, let target = lines.first(where: { $0.place == 4 }), target.points > 0 {
                    ProgressView(value: min(1, ours.pointsWon / target.points))
                        .tint(Color("BrandGold"))
                        .accessibilityLabel("Climb to fourth")
                        .accessibilityValue("\(Int((min(1, ours.pointsWon / target.points) * 100).rounded())) percent")
                }
            } else {
                Text("Our team is not on this sheet yet.").font(.headline)
            }
        }
        .foregroundStyle(BA4LTheme.onTint)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BA4LTheme.tint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }

    private func gapLine(_ ours: LeagueStandings.Team, _ s: LeagueStandings) -> String {
        if ours.place == 1 {
            if let second = s.teams.first(where: { $0.place == 2 }) { return "Leading by \(NativeLeagueMath.points(ours.pointsWon - second.pointsWon))" }
            return "Leading the league"
        }
        guard let above = s.teams.first(where: { $0.place == ours.place - 1 }) else { return "" }
        let gap = ours.gapToAbove ?? (above.pointsWon - ours.pointsWon)
        return "\(NativeLeagueMath.points(gap)) behind \(above.name.capitalized) for \(NativeLeagueMath.ordinal(above.place))"
    }

    private func teamRow(_ team: LeagueStandings.Team, first: Bool) -> some View {
        let on = team.ours
        let move = team.movement ?? 0
        return DisclosureGroup {
            LeagueValue("Win percentage", "\(team.percentWon.formatted(.number.precision(.fractionLength(1))))%")
            LeagueValue("Year to date", "\(leagueNumber(team.ytdWon)) / \(leagueNumber(team.ytdLost))")
            LeagueValue("Scratch pins", leagueNumber(team.scratchPins))
            if let last = team.lastWeek {
                LeagueValue("Last opponent", last.opponent.capitalized)
                LeagueValue("Handicap games", last.hdcpGames.map(String.init).joined(separator: " · "))
                LeagueValue("Handicap total", leagueNumber(last.hdcpTotal))
            }
        } label: {
            HStack(spacing: 0) {
                HStack(spacing: 2) {
                    Text(String(team.place)).font(.headline).monospacedDigit()
                    if move > 0 { Image(systemName: "arrow.up").font(.caption2.weight(.bold)).foregroundStyle(Color("BrandGold")) }
                    else if move < 0 { Image(systemName: "arrow.down").font(.caption2.weight(.bold)).foregroundStyle(BA4LTheme.secondary) }
                }
                .frame(width: 44, alignment: .leading)
                Text(team.name.capitalized).font(on ? .headline : .body).lineLimit(2).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Text(NativeLeagueMath.points(team.pointsWon)).font(.headline).monospacedDigit().frame(width: 52, alignment: .trailing)
                Text(first ? "–" : team.gapToAbove.map(NativeLeagueMath.points) ?? "–").monospacedDigit().foregroundStyle(on ? Color("OnGoldSurface") : BA4LTheme.secondary).frame(width: 44, alignment: .trailing)
                Text(team.lastWeek.map { NativeLeagueMath.points($0.points) } ?? "–").monospacedDigit().foregroundStyle(on ? Color("OnGoldSurface") : BA4LTheme.secondary).frame(width: 40, alignment: .trailing)
            }
            .foregroundStyle(on ? Color("OnGoldSurface") : .primary)
            .frame(minHeight: 44)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(rowLabel(team, move: move))
            .accessibilityIdentifier(on ? "ourTeamRow" : "team-\(team.place)")
        }
    }

    private func rowLabel(_ team: LeagueStandings.Team, move: Int) -> String {
        var parts = ["\(NativeLeagueMath.ordinal(team.place)), \(team.name.capitalized)\(team.ours ? ", our team" : "")", "\(NativeLeagueMath.points(team.pointsWon)) points"]
        if let gap = team.gapToAbove { parts.append("\(NativeLeagueMath.points(gap)) behind") }
        if let last = team.lastWeek { parts.append("\(NativeLeagueMath.points(last.points)) last week") }
        if move > 0 { parts.append("up \(move)") } else if move < 0 { parts.append("down \(-move)") }
        return parts.joined(separator: ", ")
    }

    private func bowlerTile(_ bowler: LeagueStandings.Bowler) -> some View {
        NavigationLink {
            if let id = bowler.blsId, id > 0 { LeagueCareerView(id: id, send: send) }
            else { ContentUnavailableView("No record yet", systemImage: "person.crop.rectangle") }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(bowler.name.capitalized).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(leagueNumber(bowler.average)).font(.system(size: 28, weight: .bold, design: .rounded)).monospacedDigit()
                Text("hdcp \(leagueNumber(bowler.handicap))").font(.caption).foregroundStyle(BA4LTheme.secondary)
                if let games = bowler.games, !games.isEmpty, let high = games.max() {
                    Text("\(high) high").font(.caption2).foregroundStyle(BA4LTheme.secondary)
                } else { Text("Sat out").font(.caption2).foregroundStyle(BA4LTheme.secondary) }
            }
            .padding(12)
            .frame(width: 118, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(BA4LTheme.tint.opacity(0.25)))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the full record")
    }

    @ViewBuilder private func weekByWeek(_ s: LeagueStandings) -> some View {
        Section("Week by week") {
            if s.history.isEmpty { Text("More weekly sheets will add the team's history.").foregroundStyle(BA4LTheme.secondary) }
            else {
                Chart(s.history) { week in
                    BarMark(x: .value("Week", week.week), y: .value("Points", week.points ?? 0))
                        .foregroundStyle((week.points ?? 0) >= 18 ? Color("BrandGold") : BA4LTheme.tint)
                        .accessibilityLabel("Week \(week.week)")
                        .accessibilityValue("\(leagueNumber(week.points)) of 36")
                }
                .chartXScale(domain: 1...max(s.season.weeksTotal, 1))
                .chartYScale(domain: 0...36)
                .chartYAxis { AxisMarks(values: [0, 18, 36]) }
                .chartXAxis { AxisMarks(values: .stride(by: 5)) }
                .frame(height: 120)
                .padding(.vertical, 4)
                DisclosureGroup("Every week") {
                    ForEach(s.history.reversed()) { week in
                        LeagueValue("Week \(week.week)", "\(leagueNumber(week.points)) – \(leagueNumber(week.lost))", detail: (week.opponent?.capitalized ?? "Opponent unavailable") + (week.place.map { " · \(NativeLeagueMath.ordinal($0))" } ?? ""))
                    }
                }
            }
        }
    }

    private func recapSection(_ current: LeagueStandings) -> some View {
        Section("Week \(current.week.number) recap") {
            if let recap = current.week.recap, !recap.isEmpty {
                if recapOpen { Text(recap).textSelection(.enabled) }
                else { Text(NativeLeagueMath.firstSentence(recap)) }
                Button(recapOpen ? "Show less" : "Read the recap") { withAnimation { recapOpen.toggle() } }.frame(minHeight: 44)
                ShareLink(item: recap) { Label("Send to team", systemImage: "square.and.arrow.up") }.frame(minHeight: 44)
            } else { Text("No recap yet for this week.").foregroundStyle(BA4LTheme.secondary) }
            Button(current.week.recap == nil ? "Write recap" : "Rewrite recap", systemImage: "sparkles") {
                Task { await writeRecap(current) }
            }.disabled(recapBusy || busy).frame(minHeight: 44)
            if recapBusy { ProgressView("Writing recap…") }
            if let recapError { Text(recapError).foregroundStyle(.red) }
        }
    }

    // MARK: Bowlers

    @ViewBuilder private func bowlerSections(_ s: LeagueStandings) -> some View {
        errorSection
        Section("Our lineup · Week \(s.week.number)") {
            ForEach(s.roster) { bowler in
                NavigationLink {
                    if let id = bowler.blsId, id > 0 { LeagueCareerView(id: id, send: send) }
                    else { ContentUnavailableView("No record yet", systemImage: "person.crop.rectangle") }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(bowler.name.capitalized).font(.headline)
                            Spacer()
                            Text("\(leagueNumber(bowler.average)) avg").monospacedDigit()
                        }
                        Text("Handicap \(leagueNumber(bowler.handicap)) · last week \(bowler.games?.map(String.init).joined(separator: " · ") ?? "sat out")")
                            .font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                        Text("Series \(leagueNumber(bowler.total)) · \(leagueNumber(bowler.toRaise)) raises the average · \(leagueNumber(bowler.matchPoints)) match points")
                            .font(.caption).foregroundStyle(BA4LTheme.secondary)
                    }.frame(minHeight: 44)
                }
            }
        }
        Section("Individual match points") {
            ForEach(Array(s.leaderboard.enumerated()), id: \.offset) { index, bowler in
                LeagueValue("\(index + 1). \(bowler.name.capitalized)", "\(leagueNumber(bowler.points)) points", detail: bowler.team.capitalized + (bowler.ours ? " · Our team" : ""))
                    .listRowBackground(bowler.ours ? Color("BrandGoldSurface") : nil)
                    .foregroundStyle(bowler.ours ? Color("OnGoldSurface") : .primary)
            }
        }
    }

    @ViewBuilder private var errorSection: some View {
        if let error { Section { Text(error).foregroundStyle(.red); Button("Retry") { Task { await load() } } } }
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

struct LeagueMark: Decodable { let value: Int; let seasonName: String; let week: Int; let bowledOn: String }
struct LeagueRecord: Decodable, Identifiable {
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
struct LeagueRecordBook: Decodable {
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
                    Text("Computed from the weekly standings sheets.").font(.caption).foregroundStyle(BA4LTheme.secondary)
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
                    if filtered.isEmpty { Text(search.isEmpty ? "No records in this season yet." : "No bowlers match your search.").foregroundStyle(BA4LTheme.secondary) }
                    ForEach(filtered) { record in
                        NavigationLink { LeagueCareerView(id: record.blsId, send: send) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(record.name.capitalized).font(.headline)
                                Text(record.teamName.capitalized + (record.teamName == book.ourTeam ? " · Our team" : "")).font(.caption).foregroundStyle(BA4LTheme.secondary)
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
            if leaders.isEmpty { Text("No counted nights yet.").foregroundStyle(BA4LTheme.secondary) }
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
                        if record.trend.isEmpty { Text("No averages recorded yet.").foregroundStyle(BA4LTheme.secondary) }
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
                                Text("\(night.bowledOn) · \(night.series) series").font(.subheadline).foregroundStyle(BA4LTheme.secondary)
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
            if let detail { Text(detail).font(.caption).foregroundStyle(BA4LTheme.secondary) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        .frame(minHeight: 44)
    }
}
private func leagueNumber(_ value: Int?) -> String { value.map(String.init) ?? "Not available" }
private func leagueNumber(_ value: Double?) -> String { value.map { $0.formatted(.number.precision(.fractionLength(0...1))) } ?? "Not available" }

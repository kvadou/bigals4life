import SwiftUI

struct TonightProfile: Decodable {
    let displayName: String
    let bowlerName: String?

    var bowlerIndex: Int? {
        guard let bowlerName else { return nil }
        let name = bowlerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return Night.names.firstIndex { $0.caseInsensitiveCompare(name) == .orderedSame }
    }
    /// Full names as Gary's sheet prints them. An account name like "dougkvamme" is a handle, not a greeting.
    static let leagueNames = ["Doug": "Doug Kvamme", "Mustafa": "Mustafa Sakhi", "Kyle": "Kyle Dickhaus", "Pete": "Pete Anderson"]
    var fullName: String {
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.contains(" ") { return name } // a first and last name you set yourself wins
        if let index = bowlerIndex, let full = Self.leagueNames[Night.names[index]] { return full }
        if !name.contains(" "), let first = Night.names.first(where: { name.lowercased().hasPrefix($0.lowercased()) }), let full = Self.leagueNames[first] { return full }
        return name
    }
    var greeting: String {
        let name = fullName
        return name.isEmpty ? "Ready for the lanes?" : "Welcome, \(name)."
    }
}

/// GET /api/league/tonight: the next scheduled league night and who we bowl.
/// Every field is optional so a partial or newer payload still decodes.
struct LeagueTonight: Decodable {
    struct Bowler: Decodable { let name: String?; let average: Double?; let handicap: Double? }
    struct Opponent: Decodable { let number: Int?; let name: String?; let bowlers: [Bowler]? }
    let today: String?
    let date: String?
    let leagueNight: Bool?
    let time: String?
    let season: String?
    let week: Int?
    let lanes: String?
    let lane: String?
    let opponent: Opponent?
    let ours: [Bowler]?
    let nightId: String?

    var isTonight: Bool { leagueNight == true }
    var matchTitle: String {
        let name = opponent?.name?.trimmingCharacters(in: .whitespacesAndNewlines).capitalized
        let lead = week.map { "Week \($0)" } ?? "League night"
        guard let name, !name.isEmpty else { return lead }
        return "\(lead) vs \(name)"
    }
    var shortDate: String {
        let parts = (date ?? "").split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let day = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return date ?? "" }
        return day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
    var detail: String {
        var parts: [String] = []
        if let lanes, !lanes.isEmpty { parts.append("Lanes \(lanes)") }
        if let time, !time.isEmpty { parts.append(time) }
        switch lane {
        case "odd": parts.append("odd lane, we hand names in first")
        case "even": parts.append("even lane, we see their four first")
        default: break
        }
        return parts.joined(separator: " · ")
    }
}

/// An account's bowling-night home. Every number comes from the shared scorebook or season API.
struct TonightView: View {
    @ObservedObject var store: ScorebookStore
    @Binding var selectedBowler: Int?
    let profile: TonightProfile?
    let send: SeasonTransport
    let accountID: String
    @Binding var homeIsRoot: Bool
    @Binding var showSeason: Bool
    @Binding var seasonSelection: String?
    let onOpenNight: (String) -> Void
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @StateObject private var liveDiscovery = LiveLaneDiscovery()
    @State private var watchingLive: LiveLaneListing?
    @Environment(\.scenePhase) private var scenePhase
    private enum Destination: Hashable { case score; case review(String) }
    @State private var path: [Destination] = []
    @State private var showLiveLane = false
    @State private var availableWidth: CGFloat = 0
    @State private var season: SeasonResponse?
    @State private var error: String?
    @State private var loading = false
    @State private var requestID = UUID()
    @State private var tonight: LeagueTonight?
    @State private var startingTonight = false
    @State private var tonightError: String?
    /// Pre-bowls this screen already stepped away from, so a deliberate reopen sticks.
    @State private var leftPrebowls: Set<String> = []

    @ScaledMetric(relativeTo: .largeTitle) private var scoreSize = 48.0

    private var selected: Int? { selectedBowler.flatMap { Night.names.indices.contains($0) ? $0 : nil } }
    private var summary: SeasonWeek? { season?.weeks.first { $0.id == store.teamID } }
    private var currentTitle: String {
        let week = store.night.prebowl?.week ?? store.night.match?.week ?? summary?.week
        if let week { return "Week \(week)" }
        return store.teamID == nil ? "Device scorebook" : "Team scorebook"
    }
    private var participants: [Int] { store.night.prebowl?.bowlers ?? Array(Night.names.indices) }
    private var games: [[Int?]] { NativeMatchScoring.ourGames(store.night) }
    private var completed: Bool { participants.allSatisfy { index in games.allSatisfy { $0[index] != nil } } }
    private var points: NativeMatchPoints? { store.night.prebowl == nil ? NativeMatchScoring.points(store.night) : nil }
    /// Matches the web home: the team night leads, pre-bowls are secondary.
    private var teamWeek: SeasonWeek? { season?.weeks.first { $0.prebowl == nil } }
    private var prebowlWeeks: [SeasonWeek] {
        guard let season else { return [] }
        let floor = teamWeek?.week ?? 0
        return season.weeks.filter { $0.prebowl != nil && $0.id != store.teamID && ($0.week ?? 0) >= floor }
    }
    private var previousResult: SeasonWeek? { season?.weeks.first { $0.id != store.teamID && $0.prebowl == nil && $0.finishedGames >= 3 } }
    private var nightState: String {
        if store.night.prebowl != nil { return completed ? "Pre-bowl complete" : "Pre-bowl in progress" }
        if completed { return points?.remaining == 0 ? "Final" : "Scores complete" }
        return "Game \(store.night.game) · Live"
    }
    private var canReview: Bool { completed && store.teamID != nil }
    private var teamSeries: Int { games.reduce(0) { total, game in total + participants.compactMap { game[$0] }.reduce(0, +) } }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if horizontalSizeClass == .regular && availableWidth >= 900 && !dynamicTypeSize.isAccessibilitySize {
                    HStack(alignment: .top, spacing: 24) {
                        ScrollView { mainColumn }
                            .contentMargins(.bottom, 24, for: .scrollContent)
                        ScrollView { sideColumn }
                            .contentMargins(.bottom, 24, for: .scrollContent)
                            .frame(width: min(380, availableWidth * 0.34))
                    }.padding(.horizontal, 24).padding(.top, 16)
                } else {
                    ScrollView {
                        VStack(spacing: 20) { mainColumn; sideColumn }
                            .padding(.horizontal, 18).padding(.top, 12)
                    }
                    .contentMargins(.bottom, 28, for: .scrollContent)
                }
            }
            // Observe the container without interposing a GeometryReader between
            // native navigation and its primary scroll view. System bar insets
            // then follow the expanded/minimized tab bar and window resizing.
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { availableWidth = $0 }
            .tint(BA4LTheme.tint)
            .background(Color("HomeBackground"), ignoresSafeAreaEdges: .all)
            .navigationTitle("Tonight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color("HomeBackground"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(Color("BrandIvory"), for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        BA4LBrandMark(size: 27)
                        Text("BA4L").font(.system(.title3, design: .serif, weight: .black))
                    }.foregroundStyle(Color("OnForest")).accessibilityLabel("BA4L Tonight")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSeason = true } label: {
                        Label("Season", systemImage: "calendar").labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                            .foregroundStyle(Color("BrandGold"))

                    }
                        .buttonStyle(.plain).accessibilityIdentifier("tonightSeason")
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .score:
                    ScoreboardView(store: store, selectedBowler: $selectedBowler, embeddedInNavigation: true)
                case .review(let id):
                    ReviewView(nightID: id, accountID: accountID, send: send)
                        .navigationBarTitleDisplayMode(.inline)
                }
            }
            .fullScreenCover(isPresented: $showLiveLane) { LiveStudioView(accountID: accountID, send: send) }
            .fullScreenCover(item: $watchingLive) { listing in
                DiscoveredLiveLaneView(listing: listing, send: send)
            }
            .refreshable { await refresh(); await liveDiscovery.refresh(send: send) }
            .task(id: scenePhase == .active && watchingLive?.id == nil && !showLiveLane && !showSeason) {
                liveDiscovery.stop()
                guard scenePhase == .active, watchingLive == nil, !showLiveLane, !showSeason else { return }
                while !Task.isCancelled {
                    await liveDiscovery.refresh(send: send)
                    do { try await Task.sleep(for: .seconds(15)) } catch { break }
                }
            }
            .onDisappear { liveDiscovery.stop() }
            .task { await refresh() }
            .sheet(isPresented: $showSeason) {
                SeasonView(send: send, selection: $seasonSelection, onOpenNight: { id in showSeason = false; onOpenNight(id) })
                    .safeAreaInset(edge: .bottom) {
                        Button { showSeason = false } label: { Text("Done").frame(maxWidth: .infinity, minHeight: 44) }
                            .buttonStyle(.bordered).padding(.horizontal).background(.bar)
                    }
            }
        }
        .onChange(of: path.isEmpty && !showLiveLane && watchingLive == nil && !showSeason, initial: true) { _, isRoot in
            homeIsRoot = isRoot
        }
    }

    private var mainColumn: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(store.night.prebowl != nil ? "Before league night." : completed ? "The night, together." : "Four bowlers. One night.")
                    .font(.system(.largeTitle, design: .serif, weight: .bold))
                    .foregroundStyle(Color("OnForest")).fixedSize(horizontal: false, vertical: true)
                Text(profile?.greeting ?? "Your team. Your scorebook.")
                    .font(.subheadline).foregroundStyle(Color("BrandGold"))
            }
            if let tonight { tonightCard(tonight) }
            resultPanel
            ForEach(liveDiscovery.sessions) { live in
                Button { watchingLive = live } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(live.title, systemImage: "video.fill").font(.headline)
                        Text(live.bowlers.joined(separator: ", ")).font(.subheadline)
                        HStack {
                            Text("\(live.cameraCount) live camera\(live.cameraCount == 1 ? "" : "s")").font(.caption)
                            Spacer()
                            Label("Watch live", systemImage: "arrow.up.right").font(.headline)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
                        .foregroundStyle(.primary)
                        .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain).accessibilityIdentifier("watchLive-" + live.scorebookId)
            }
            Button { showLiveLane = true } label: {
                HStack(spacing: 12) {
                    Image(systemName: "video.fill")
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Live & practice").font(.headline)
                        Text("Share with the team or record for yourself").font(.subheadline)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "arrow.up.right")
                }.frame(minHeight: 52).padding(14)
                    .foregroundStyle(.primary)
                    .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 14))
            }.buttonStyle(.plain).accessibilityIdentifier("openLiveLane")
            if let message = liveDiscovery.message {
                Text(message).font(.caption).foregroundStyle(Color("OnForest"))
                    .accessibilityIdentifier("liveDiscoveryMessage")
            }
            personalPanel
            NavigationLink { MatchInsightsView(store: store, send: send) } label: {
                HStack(spacing: 12) {
                    Image(systemName: "target")
                    Text("Match points & lineup").fontWeight(.semibold)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.caption.weight(.bold))
                }.frame(minHeight: 48).padding(.horizontal, 16)
                    .foregroundStyle(Color("BrandGold"))
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.24), lineWidth: 1))
            }.buttonStyle(.plain)
        }
    }
    private var sideColumn: some View {
        VStack(alignment: .leading, spacing: 20) {
            teamPanel
            ForEach(prebowlWeeks) { prebowlPanel($0) }
            if let result = previousResult { previousPanel(result) }
            seasonPanel
        }
    }

    private var resultPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            ViewThatFits(in: .horizontal) {
                HStack { Text(currentTitle).fontWeight(.semibold); Spacer(); Text(nightState) }
                VStack(alignment: .leading, spacing: 4) { Text(currentTitle).fontWeight(.semibold); Text(nightState) }
            }.font(.subheadline)
            if let summary { Text(summary.dateLabel).font(.caption).foregroundStyle(BA4LTheme.secondary) }
            if let match = store.night.match, let points {
                matchup(points, opponent: match.opponent.name)
                VStack(spacing: 6) {
                    Text(completed ? "Team scratch series" : "Scratch pins · completed games").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Text(teamSeries.formatted()).font(.title3.bold().monospacedDigit())
                }.frame(maxWidth: .infinity)
                Divider()
                gamePoints(points)
                let seriesPoints = points.bowlers.map(\.series).reduce(points.series.split) { [$0[0] + $1[0], $0[1] + $1[1]] }
                HStack {
                    Text("Series points").font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Text(pointPair(seriesPoints)).font(.title3.bold().monospacedDigit())
                }.padding(12)
                    .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 10))
                if points.remaining > 0 {
                    Text("\(formatted(points.remaining)) of 36 points still available. Open games are not counted yet.")
                        .font(.caption).foregroundStyle(BA4LTheme.secondary)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(store.night.prebowl != nil ? participants.map { Night.names[$0] }.joined(separator: ", ") : "Big Al’s 4 Life")
                        .font(.title2.bold())
                    Text(teamSeries.formatted()).font(.system(size: scoreSize, weight: .bold, design: .rounded).monospacedDigit())
                    Text(store.night.prebowl != nil ? "Scratch pins from completed pre-bowl games" : "Team scratch pins from completed games")
                        .font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                    if store.night.match == nil { Text("Match points appear after the opponent and handicaps are set.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
                }
            }
            primaryAction
            if canReview {
                Button("View scorecards") { openScorecard() }.frame(maxWidth: .infinity, minHeight: 44)
            }
            Label(store.status, systemImage: store.pending ? "icloud.and.arrow.up" : store.error == nil ? "checkmark.icloud" : "exclamationmark.icloud")
                .font(.caption).foregroundStyle(BA4LTheme.secondary)
            if let error = store.error {
                Text(error).font(.callout).foregroundStyle(.red)
                Button("Retry score sync") { Task { await store.retry() } }.disabled(store.busy).frame(minHeight: 44)
            }
            if store.pending { Text("Includes your latest local changes, waiting to sync.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
            if store.teamID == nil { Text("Saved on this device. Open a night from Season to join your shared scorebook.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    @ViewBuilder private func matchup(_ points: NativeMatchPoints, opponent: String) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 14) {
                Text("BA4L").font(.headline)
                Text(formatted(points.total[0])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                Text("Our points").font(.caption).foregroundStyle(BA4LTheme.secondary)
                Text(opponent.capitalized).font(.headline)
                Text(formatted(points.total[1])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                Text("Their points").font(.caption).foregroundStyle(BA4LTheme.secondary)
            }.accessibilityElement(children: .combine)
        } else {
            Grid(horizontalSpacing: 12, verticalSpacing: 6) {
                GridRow {
                    Text("BA4L").font(.headline).frame(maxWidth: .infinity)
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    Text(opponent.capitalized).font(.headline).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                }
                GridRow {
                    Text(formatted(points.total[0])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                    Text("–").font(.title.weight(.light)).accessibilityHidden(true)
                    Text(formatted(points.total[1])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                }
                GridRow {
                    Text("Our points").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    Text("Their points").font(.caption).foregroundStyle(BA4LTheme.secondary)
                }
            }.accessibilityElement(children: .combine)
        }
    }
    private func gamePoints(_ points: NativeMatchPoints) -> some View {
        let columns = dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : Array(repeating: GridItem(.flexible(), spacing: 12), count: 3)
        return LazyVGrid(columns: columns, spacing: 14) {
            ForEach(Array(points.games.enumerated()), id: \.element.game) { index, game in
                let split = points.bowlers.reduce(game.split) { total, bowler in
                    guard index < bowler.games.count else { return total }
                    return [total[0] + bowler.games[index][0], total[1] + bowler.games[index][1]]
                }
                VStack(spacing: 4) {
                    Text("Game \(game.game)").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    Text(pointPair(split)).font(.title3.bold().monospacedDigit())
                    Text("Game points").font(.caption2).foregroundStyle(BA4LTheme.secondary)
                }.frame(maxWidth: .infinity).accessibilityElement(children: .combine)
            }
        }
    }
    private var primaryAction: some View {
        Button { canReview ? openReview() : openScorecard() } label: {
            HStack {
                Text(canReview ? "Review the night" : scoreAction).fixedSize(horizontal: false, vertical: true)
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 8); Image(systemName: "arrow.right") }
            }.font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(Color("OnBrandGreen"))
        }.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 12))
            .tint(Color("BrandGreen")).foregroundStyle(Color("OnBrandGreen"))
            .accessibilityIdentifier("tonightContinue")
    }
    private var scoreAction: String {
        guard selected != nil else { return "Choose a scorecard" }
        if store.role == .viewer || completed { return "View scorecard" }
        return "Continue scoring"
    }
    private var personalPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Your scorecard", selection: $selectedBowler) {
                Text("Choose a bowler").tag(nil as Int?)
                ForEach(Night.names.indices, id: \.self) { Text(Night.names[$0]).tag(Optional($0)) }
            }.frame(minHeight: 44).accessibilityIdentifier("tonightBowler")
            if let index = selected {
                let game = store.night.current
                if let prebowl = store.night.prebowl, !prebowl.bowlers.contains(index) {
                    Text("Your next league night").font(.headline)
                    Text("This pre-bowl belongs to your teammates. Your scorecard is ready for league night.").font(.callout).foregroundStyle(BA4LTheme.secondary)
                } else {
                let personalLayout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
                personalLayout {
                    Text("\(game.score(index))").font(.title.bold().monospacedDigit())
                    Text("\(Night.names[index]) · \(game.complete(index) ? "final" : "scored")").font(.subheadline)
                }
                if !game.complete(index) {
                    Text("Frame \(game.bowling(index).frameNumber) · ball \(game.bowling(index).ballNumber) · up to \(store.night.maximum(index))")
                        .font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                }
                }
            } else { Text("Your choice stays with this account on this device.").font(.callout).foregroundStyle(BA4LTheme.secondary) }
            if !canReview {
                Button { openReview() } label: { Label("Bowling Bro’ · review notes", systemImage: "text.bubble") }
                    .disabled(store.teamID == nil).frame(minHeight: 44).accessibilityIdentifier("tonightReviewNotes")
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    private var teamPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(completed ? "The team · scratch series" : "The team · game \(store.night.game)").font(.headline)
            ForEach(Night.names.indices, id: \.self) { index in
                if index != 0 { Divider() }
                let game = store.night.current
                let score = completed ? games.compactMap { $0[index] }.reduce(0, +) : game.score(index)
                Button { selectedBowler = index; openScorecard() } label: {
                    LabeledContent {
                        Text(score.formatted()).font(.title3.bold().monospacedDigit()).foregroundStyle(.primary)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Night.names[index]).font(.headline).foregroundStyle(.primary)
                            Text(store.night.prebowl != nil && !participants.contains(index) ? "Not in this pre-bowl" : completed ? "Series recorded" : game.complete(index) ? "Game complete" : "Frame \(game.bowling(index).frameNumber)")
                                .font(.caption).foregroundStyle(BA4LTheme.secondary)
                        }
                    }.frame(minHeight: 44)
                }.buttonStyle(.plain).accessibilityLabel("Open \(Night.names[index])’s scorecard, \(score) scratch pins")
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    private func previousPanel(_ result: SeasonWeek) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Last completed league night").font(.headline)
            Text("\(result.title) · \(result.dateLabel)").font(.subheadline).foregroundStyle(BA4LTheme.secondary)
            if let opponent = result.opponent { Text("vs \(opponent.capitalized)") }
            if let points = result.points {
                LabeledContent("Match points", value: "\(formatted(points.ours)) – \(formatted(points.theirs))")
                if points.remaining > 0 { Text("\(formatted(points.remaining)) points await opponent scores.").font(.caption).foregroundStyle(BA4LTheme.secondary) }
            }
            if let score = result.teamSeries { LabeledContent("Team scratch series", value: score.formatted()) }
            Button("Open \(result.title)") { openPreviousNight(result.id) }.disabled(!store.canSwitchTeam).frame(minHeight: 44)
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    @ViewBuilder private func tonightCard(_ info: LeagueTonight) -> some View {
        let hero = info.isTonight
        VStack(alignment: .leading, spacing: 10) {
            Text(hero ? "LEAGUE NIGHT · TONIGHT" : "NEXT UP · \(info.shortDate)")
                .font(.caption.weight(.bold)).tracking(0.8)
                .foregroundStyle(hero ? Color("BrandGreen") : BA4LTheme.secondary)
            Text(info.matchTitle)
                .font(hero ? .system(.title2, design: .serif, weight: .bold) : .headline)
                .fixedSize(horizontal: false, vertical: true)
            if !info.detail.isEmpty {
                Text(info.detail).font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if hero { scouting(info) }
            if hero && info.nightId != nil && info.nightId == store.teamID {
                Label("Scoring tonight \u{00B7} Game \(store.night.game)", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color("BrandGreen"))
                    .accessibilityIdentifier("tonightScoringNow")
            } else if hero {
                Button { startTonight() } label: {
                    HStack {
                        Text(info.nightId == nil ? "Start scoring tonight" : "Open tonight\u{2019}s scorebook").fixedSize(horizontal: false, vertical: true)
                        if !dynamicTypeSize.isAccessibilitySize {
                            Spacer(minLength: 8)
                            if startingTonight { ProgressView() } else { Image(systemName: "arrow.right") }
                        }
                    }.font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(Color("OnBrandGreen"))
                }.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 12))
                    .tint(Color("BrandGreen")).foregroundStyle(Color("OnBrandGreen"))
                    .disabled(startingTonight)
                    .accessibilityIdentifier("tonightStartLeagueNight")
                if let tonightError {
                    Text(tonightError).font(.callout).foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(hero ? 20 : 16).frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(.primary)
        .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tonightLeagueCard")
    }
    /// Their four and ours with average and handicap: the numbers the lineup order is decided on.
    @ViewBuilder private func scouting(_ info: LeagueTonight) -> some View {
        let theirs = Array((info.opponent?.bowlers ?? []).filter { ($0.average ?? 0) > 0 }.prefix(4))
        let ours = (info.ours ?? []).filter { ($0.average ?? 0) > 0 }
        if !theirs.isEmpty {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                GridRow {
                    Text("Them").gridColumnAlignment(.leading)
                    Text("Avg").gridColumnAlignment(.trailing)
                    Text("Hdcp").gridColumnAlignment(.trailing)
                    Text("Us").gridColumnAlignment(.leading)
                    Text("Avg").gridColumnAlignment(.trailing)
                    Text("Hdcp").gridColumnAlignment(.trailing)
                }.font(.caption.weight(.semibold)).foregroundStyle(BA4LTheme.secondary)
                ForEach(0..<max(theirs.count, ours.count), id: \.self) { i in
                    GridRow {
                        cell(theirs, i, \.name); number(theirs, i, \.average); number(theirs, i, \.handicap)
                        cell(ours, i, \.name); number(ours, i, \.average); number(ours, i, \.handicap)
                    }.font(.subheadline)
                }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Scouting: " + theirs.map { "\(firstName($0.name)) \(Int($0.average ?? 0)) average, \(Int($0.handicap ?? 0)) handicap" }.joined(separator: "; "))
            Text("Handicap is 90% of 210 minus average, so everyone lands within a few pins. Form beats order.")
                .font(.caption).foregroundStyle(BA4LTheme.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
    private func firstName(_ name: String?) -> String { (name ?? "").split(separator: " ").first.map { String($0).capitalized } ?? "" }
    private func cell(_ rows: [LeagueTonight.Bowler], _ i: Int, _ key: KeyPath<LeagueTonight.Bowler, String?>) -> some View {
        Text(i < rows.count ? firstName(rows[i][keyPath: key]) : "").lineLimit(1)
    }
    private func number(_ rows: [LeagueTonight.Bowler], _ i: Int, _ key: KeyPath<LeagueTonight.Bowler, Double?>) -> some View {
        Text(i < rows.count ? "\(Int(rows[i][keyPath: key] ?? 0))" : "").monospacedDigit()
    }
    private func prebowlPanel(_ week: SeasonWeek) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(week.title) pre-bowl").font(.headline)
            Text(week.participants.compactMap { Night.names.indices.contains($0) ? Night.names[$0] : nil }.joined(separator: ", "))
                .font(.subheadline)
            if let score = week.teamSeries { LabeledContent("Scratch pins", value: score.formatted()) }
            Text(week.progressLabel).font(.caption).foregroundStyle(BA4LTheme.secondary)
            Button("Open pre-bowl") { leftPrebowls.insert(week.id); openPreviousNight(week.id) }
                .disabled(!store.canSwitchTeam).frame(minHeight: 44)
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    private var seasonPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { showSeason = true } label: { Label("All weeks & pre-bowls", systemImage: "calendar").frame(minHeight: 44) }
            if loading { ProgressView("Loading season…") }
            if let error { Text(error).font(.callout).foregroundStyle(.red); Button("Retry season") { Task { await refresh() } }.frame(minHeight: 44) }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    private func openScorecard() { path.append(.score) }
    private func openReview() {
        guard let id = store.teamID else { return }
        path.append(.review(id))
    }
    private func openPreviousNight(_ id: String) {
        Task {
            await store.start()
            guard store.canSwitchTeam else { openScorecard(); return }
            await store.openTeam(ScorebookClient.origin + "/season/" + id)
            openScorecard()
        }
    }

    private func startTonight() {
        guard !startingTonight else { return }
        startingTonight = true; tonightError = nil
        Task { @MainActor in
            defer { startingTonight = false }
            do {
                var request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/league/tonight")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue(ScorebookClient.origin, forHTTPHeaderField: "Origin")
                request.httpBody = Data("{}".utf8)
                let (data, response) = try await send(request)
                struct Created: Decodable { let id: String }
                struct Failure: Decodable { let error: String }
                guard (200..<300).contains(response.statusCode) else {
                    throw ScorebookError.server((try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Tonight\u{2019}s scorebook could not open. Try again.")
                }
                let id = try JSONDecoder().decode(Created.self, from: data).id
                await store.start()
                if store.teamID != id {
                    guard store.canSwitchTeam else {
                        tonightError = "Finish syncing this scorebook first, then try again."
                        return
                    }
                    await store.openTeam(ScorebookClient.origin + "/season/" + id)
                    guard store.teamID == id else {
                        tonightError = store.error ?? "Tonight\u{2019}s scorebook could not open. Try again."
                        return
                    }
                }
                openScorecard()
                await loadTonight()
            } catch {
                tonightError = error.localizedDescription
            }
        }
    }
    /// Optional card data. Any failure (404, offline, older server) just hides the card.
    @MainActor private func loadTonight() async {
        do {
            let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/league/tonight")!, cachePolicy: .reloadIgnoringLocalCacheData))
            guard response.statusCode == 200 else { tonight = nil; return }
            tonight = try JSONDecoder().decode(LeagueTonight.self, from: data)
        } catch {
            if !Task.isCancelled { tonight = nil }
        }
    }
    /// A finished pre-bowl should not stand in for the team night on this screen.
    @MainActor private func preferTeamNight() async {
        guard let id = store.teamID, store.night.prebowl != nil, completed, !leftPrebowls.contains(id),
              let team = teamWeek, team.id != id, store.canSwitchTeam,
              (team.week ?? 0) >= (store.night.prebowl?.week ?? 0) else { return }
        leftPrebowls.insert(id)
        await store.openTeam(ScorebookClient.origin + "/season/" + team.id)
    }

    private func pointPair(_ values: [Double]) -> String { values[0] + values[1] == 0 ? "Open" : "\(formatted(values[0])) – \(formatted(values[1]))" }

    @MainActor private func refresh() async {
        let token = UUID(); requestID = token; loading = true; error = nil
        defer { if requestID == token { loading = false } }
        await store.start()
        await store.refresh(force: true)
        async let league: Void = loadTonight()
        await loadSeason(token)
        await league
    }
    @MainActor private func loadSeason(_ token: UUID) async {
        do {
            let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/season")!, cachePolicy: .reloadIgnoringLocalCacheData))
            guard !Task.isCancelled, requestID == token else { return }
            guard response.statusCode == 200 else { throw ScorebookError.server("Season history could not load. Your current scorebook is still available.") }
            season = try JSONDecoder().decode(SeasonResponse.self, from: data)
            await preferTeamNight()
        } catch {
            guard !Task.isCancelled, requestID == token else { return }
            self.error = error.localizedDescription
        }
    }
    private func formatted(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }
}

import SwiftUI

struct TonightProfile: Decodable {
    let displayName: String
    let bowlerName: String?

    var bowlerIndex: Int? {
        guard let bowlerName else { return nil }
        let name = bowlerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return Night.names.firstIndex { $0.caseInsensitiveCompare(name) == .orderedSame }
    }
    var greeting: String {
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "Ready for the lanes?" : "Welcome, \(name)."
    }
}

/// An account's bowling-night home. Every number comes from the shared scorebook or season API.
struct TonightView: View {
    @ObservedObject var store: ScorebookStore
    @Binding var selectedBowler: Int?
    let profile: TonightProfile?
    let send: SeasonTransport
    let onScore: () -> Void
    let onReview: () -> Void
    let onOpenNight: (String) -> Void
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showSeason = false
    @State private var availableWidth: CGFloat = 0
    @State private var season: SeasonResponse?
    @State private var error: String?
    @State private var loading = false
    @State private var requestID = UUID()

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
    private var previousResult: SeasonWeek? { season?.weeks.first { $0.id != store.teamID && $0.prebowl == nil && $0.finishedGames >= 3 } }
    private var nightState: String {
        if store.night.prebowl != nil { return completed ? "Pre-bowl complete" : "Pre-bowl in progress" }
        if completed { return points?.remaining == 0 ? "Final" : "Scores complete" }
        return "Game \(store.night.game) · Live"
    }
    private var canReview: Bool { completed && store.teamID != nil }
    private var teamSeries: Int { games.reduce(0) { total, game in total + participants.compactMap { game[$0] }.reduce(0, +) } }

    var body: some View {
        NavigationStack {
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
            .background(Color("BrandForest"), ignoresSafeAreaEdges: .top)
            .navigationTitle("Tonight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color("BrandForest"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(horizontalSizeClass == .regular ? Color("BrandForest") : Color("BrandIvory"), for: .tabBar)
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
                            .background(Color("BrandForest"), in: Circle())
                    }
                        .buttonStyle(.plain).accessibilityIdentifier("tonightSeason")
                }
            }
            .refreshable { await refresh() }
            .task { await refresh() }
            .sheet(isPresented: $showSeason) {
                SeasonView(send: send, onOpenNight: { id in showSeason = false; onOpenNight(id) })
                    .safeAreaInset(edge: .bottom) {
                        Button { showSeason = false } label: { Text("Done").frame(maxWidth: .infinity, minHeight: 44) }
                            .buttonStyle(.bordered).padding(.horizontal).background(.bar)
                    }
            }
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
            resultPanel
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
            if let summary { Text(summary.dateLabel).font(.caption).foregroundStyle(.secondary) }
            if let match = store.night.match, let points {
                matchup(points, opponent: match.opponent.name)
                VStack(spacing: 6) {
                    Text(completed ? "Team scratch series" : "Scratch pins · completed games").font(.caption).foregroundStyle(.secondary)
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
                    .background(Color("BrandGoldSurface"), in: RoundedRectangle(cornerRadius: 10))
                if points.remaining > 0 {
                    Text("\(formatted(points.remaining)) of 36 points still available. Open games are not counted yet.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(store.night.prebowl != nil ? participants.map { Night.names[$0] }.joined(separator: ", ") : "Big Al’s 4 Life")
                        .font(.title2.bold())
                    Text(teamSeries.formatted()).font(.system(size: scoreSize, weight: .bold, design: .rounded).monospacedDigit())
                    Text(store.night.prebowl != nil ? "Scratch pins from completed pre-bowl games" : "Team scratch pins from completed games")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if store.night.match == nil { Text("Match points appear after the opponent and handicaps are set.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            primaryAction
            if canReview {
                Button("View scorecards") { onScore() }.frame(maxWidth: .infinity, minHeight: 44)
            }
            Label(store.status, systemImage: store.pending ? "icloud.and.arrow.up" : store.error == nil ? "checkmark.icloud" : "exclamationmark.icloud")
                .font(.caption).foregroundStyle(.secondary)
            if let error = store.error {
                Text(error).font(.callout).foregroundStyle(.red)
                Button("Retry score sync") { Task { await store.retry() } }.disabled(store.busy).frame(minHeight: 44)
            }
            if store.pending { Text("Includes your latest local changes, waiting to sync.").font(.caption).foregroundStyle(.secondary) }
            if store.teamID == nil { Text("Saved on this device. Open a night from Season to join your shared scorebook.").font(.caption).foregroundStyle(.secondary) }
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 16))
    }
    @ViewBuilder private func matchup(_ points: NativeMatchPoints, opponent: String) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 14) {
                Text("BA4L").font(.headline)
                Text(formatted(points.total[0])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                Text("Our points").font(.caption).foregroundStyle(.secondary)
                Text(opponent.capitalized).font(.headline)
                Text(formatted(points.total[1])).font(.system(size: scoreSize, weight: .black, design: .rounded).monospacedDigit())
                Text("Their points").font(.caption).foregroundStyle(.secondary)
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
                    Text("Our points").font(.caption).foregroundStyle(.secondary)
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    Text("Their points").font(.caption).foregroundStyle(.secondary)
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
                    Text("Game \(game.game)").font(.caption).foregroundStyle(.secondary)
                    Text(pointPair(split)).font(.title3.bold().monospacedDigit())
                    Text("Game points").font(.caption2).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity).accessibilityElement(children: .combine)
            }
        }
    }
    private var primaryAction: some View {
        Button { canReview ? onReview() : onScore() } label: {
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
                let personalLayout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
                personalLayout {
                    Text("\(game.score(index))").font(.title.bold().monospacedDigit())
                    Text("\(Night.names[index]) · \(game.complete(index) ? "final" : "scored")").font(.subheadline)
                }
                if !game.complete(index) {
                    Text("Frame \(game.bowling(index).frameNumber) · ball \(game.bowling(index).ballNumber) · up to \(store.night.maximum(index))")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if let prebowl = store.night.prebowl, !prebowl.bowlers.contains(index) {
                    Text("This pre-bowl is for your teammates. Your scorecard is not part of its result.").font(.callout).foregroundStyle(.secondary)
                }
            } else { Text("Your choice stays with this account on this device.").font(.callout).foregroundStyle(.secondary) }
            if !canReview {
                Button { onReview() } label: { Label("Bowling Bro’ · review notes", systemImage: "text.bubble") }
                    .disabled(store.teamID == nil).frame(minHeight: 44)
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
                Button { selectedBowler = index; onScore() } label: {
                    LabeledContent {
                        Text(score.formatted()).font(.title3.bold().monospacedDigit()).foregroundStyle(.primary)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Night.names[index]).font(.headline).foregroundStyle(.primary)
                            Text(store.night.prebowl != nil && !participants.contains(index) ? "Not in this pre-bowl" : completed ? "Series recorded" : game.complete(index) ? "Game complete" : "Frame \(game.bowling(index).frameNumber)")
                                .font(.caption).foregroundStyle(.secondary)
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
            Text("\(result.title) · \(result.dateLabel)").font(.subheadline).foregroundStyle(.secondary)
            if let opponent = result.opponent { Text("vs \(opponent.capitalized)") }
            if let points = result.points {
                LabeledContent("Match points", value: "\(formatted(points.ours)) – \(formatted(points.theirs))")
                if points.remaining > 0 { Text("\(formatted(points.remaining)) points await opponent scores.").font(.caption).foregroundStyle(.secondary) }
            }
            if let score = result.teamSeries { LabeledContent("Team scratch series", value: score.formatted()) }
            Button("Open \(result.title)") { onOpenNight(result.id) }.disabled(!store.canSwitchTeam).frame(minHeight: 44)
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
    private func pointPair(_ values: [Double]) -> String { values[0] + values[1] == 0 ? "Open" : "\(formatted(values[0])) – \(formatted(values[1]))" }

    @MainActor private func refresh() async {
        let token = UUID(); requestID = token; loading = true; error = nil
        defer { if requestID == token { loading = false } }
        await store.start()
        await store.refresh(force: true)
        do {
            let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/season")!, cachePolicy: .reloadIgnoringLocalCacheData))
            guard !Task.isCancelled, requestID == token else { return }
            guard response.statusCode == 200 else { throw ScorebookError.server("Season history could not load. Your current scorebook is still available.") }
            season = try JSONDecoder().decode(SeasonResponse.self, from: data)
        } catch {
            guard !Task.isCancelled, requestID == token else { return }
            self.error = error.localizedDescription
        }
    }
    private func formatted(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }
}

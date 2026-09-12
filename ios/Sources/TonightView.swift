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
    @State private var season: SeasonResponse?
    @State private var error: String?
    @State private var loading = false
    @State private var requestID = UUID()

    private var selected: Int? { selectedBowler.flatMap { Night.names.indices.contains($0) ? $0 : nil } }
    private var currentTitle: String {
        if let prebowl = store.night.prebowl { return "Week \(prebowl.week) pre-bowl" }
        if let match = store.night.match { return "Week \(match.week)" }
        if let summary = season?.weeks.first(where: { $0.id == store.teamID }), let week = summary.week { return "Week \(week)" }
        return store.teamID == nil ? "Device scorebook" : "Team scorebook"
    }
    private var participants: [Int] { store.night.prebowl?.bowlers ?? Array(Night.names.indices) }
    private var completed: Bool {
        let games = NativeMatchScoring.ourGames(store.night)
        return participants.allSatisfy { index in games.allSatisfy { $0[index] != nil } }
    }
    private var previousResult: SeasonWeek? {
        season?.weeks.first { $0.id != store.teamID && $0.prebowl == nil && $0.finishedGames >= 3 }
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                if horizontalSizeClass == .regular && geometry.size.width >= 800 && !dynamicTypeSize.isAccessibilitySize {
                    HStack(spacing: 0) {
                        List { welcomeSection; currentSection; actionSection }
                            .frame(width: geometry.size.width * 0.52)
                        Divider()
                        List { teamSection; previousSection; seasonSection }
                    }
                } else {
                    List { welcomeSection; currentSection; actionSection; teamSection; previousSection; seasonSection }
                }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Tonight")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSeason = true } label: { Label("Season", systemImage: "calendar") }
                        .accessibilityIdentifier("tonightSeason")
                }
            }
            .refreshable { await refresh() }
            .task { await refresh() }
            .sheet(isPresented: $showSeason) {
                SeasonView(send: send, onOpenNight: { id in showSeason = false; onOpenNight(id) })
                    .safeAreaInset(edge: .bottom) {
                        Button { showSeason = false } label: {
                            Text("Done").frame(maxWidth: .infinity, minHeight: 44)
                        }
                            .buttonStyle(.bordered).padding(.horizontal)
                            .background(.bar)
                    }
            }
        }
    }
    private var welcomeSection: some View {
        Section {
            Text(profile?.greeting ?? "Ready for the lanes?").font(.title2.bold())
                .fixedSize(horizontal: false, vertical: true)
            Picker("Scoring for", selection: $selectedBowler) {
                Text("Choose a bowler").tag(nil as Int?)
                ForEach(Night.names.indices, id: \.self) { Text(Night.names[$0]).tag(Optional($0)) }
            }
            .frame(minHeight: 44)
            .accessibilityIdentifier("tonightBowler")
        } footer: {
            Text(selected == nil ? "Choose your scorecard to begin. Your choice stays with this account on this device." : "You can switch bowlers any time to help score for the team.")
        }
    }
    private var currentSection: some View {
        Section {
            if let match = store.night.match {
                Text("vs \(match.opponent.name.capitalized)").font(.headline)
            }
            if store.night.prebowl != nil {
                Label(completed ? "Pre-bowl scores recorded" : "Pre-bowl in progress", systemImage: "calendar.badge.clock")
                Text(participants.map { Night.names[$0] }.joined(separator: ", "))
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Label(completed ? "Night complete" : "Game \(store.night.game)", systemImage: completed ? "checkmark.circle" : "figure.bowling")
            }
            if let index = selected {
                let game = store.night.current
                let isComplete = game.complete(index)
                let scoreLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
                scoreLayout {
                    Text("\(game.score(index))").font(.largeTitle.bold().monospacedDigit())
                    Text("\(Night.names[index]) · \(isComplete ? "final" : "scored")")
                        .font(.subheadline).foregroundStyle(.secondary)
                }.accessibilityElement(children: .combine)
                if !isComplete {
                    Text("Frame \(game.bowling(index).frameNumber) · ball \(game.bowling(index).ballNumber) · up to \(store.night.maximum(index))")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if let prebowl = store.night.prebowl, !prebowl.bowlers.contains(index) {
                    Text("This pre-bowl is for your teammates. Your scorecard is not part of its result.")
                        .font(.callout).foregroundStyle(.secondary)
                }
            }
            if let points = NativeMatchScoring.points(store.night), store.night.prebowl == nil {
                LabeledContent("Match points", value: "\(formatted(points.total[0])) – \(formatted(points.total[1]))")
                if points.remaining > 0 { Text("\(formatted(points.remaining)) points still available").font(.caption).foregroundStyle(.secondary) }
            }
            Label(store.status, systemImage: store.pending ? "icloud.and.arrow.up" : store.error == nil ? "checkmark.icloud" : "exclamationmark.icloud")
                .font(.caption).foregroundStyle(.secondary)
            if let error = store.error {
                Text(error).font(.callout).foregroundStyle(.red)
                Button("Retry score sync") { Task { await store.retry() } }.disabled(store.busy).frame(minHeight: 44)
            }
            Button { onScore() } label: {
                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        Text(scoreAction).multilineTextAlignment(.center)
                    } else {
                        Label(scoreAction, systemImage: "figure.bowling")
                    }
                }
                .font(.headline).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(Color("OnBrandGreen"))
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 16))
            .tint(Color("BrandGreen"))
            .foregroundStyle(Color("OnBrandGreen"))
            .accessibilityIdentifier("tonightContinue")
        } header: {
            Text(currentTitle)
        } footer: {
            Text(store.teamID == nil ? "This scorebook is saved on this device. Open a team night from Season to use its shared scores." : store.pending ? "Your latest changes are included here and waiting to sync." : "The scorebook is shared with your team.")
        }
    }
    private var scoreAction: String {
        guard selected != nil else { return "Choose a scorecard" }
        if store.role == .viewer || completed { return "View scorecard" }
        return "Continue scoring"
    }
    private var actionSection: some View {
        Section {
            NavigationLink { MatchInsightsView(store: store, send: send) } label: {
                Label("Match points & targets", systemImage: "target")
            }.frame(minHeight: 44)
            Button { onReview() } label: { Label("Review with Bowling Bro’", systemImage: "text.bubble") }
                .disabled(store.teamID == nil).frame(minHeight: 44)
        }
    }
    private var teamSection: some View {
        Section("Team · game \(store.night.game)") {
            ForEach(Night.names.indices, id: \.self) { index in
                Button { selectedBowler = index; onScore() } label: {
                    LabeledContent {
                        Text("\(store.night.current.score(index)) \(store.night.current.complete(index) ? "final" : "scored")")
                            .monospacedDigit().foregroundStyle(.primary)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Night.names[index]).font(.headline).foregroundStyle(.primary)
                            Text(store.night.current.complete(index) ? "Game complete" : "Frame \(store.night.current.bowling(index).frameNumber)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.frame(minHeight: 44)
                }.buttonStyle(.plain)
                    .accessibilityLabel("Open \(Night.names[index])’s scorecard, \(store.night.current.score(index)) scored")
            }
        }
    }
    @ViewBuilder private var previousSection: some View {
        if let result = previousResult {
            Section("Last completed league night") {
                Text("\(result.title) · \(result.dateLabel)").font(.headline)
                if let opponent = result.opponent { Text("vs \(opponent.capitalized)").font(.subheadline) }
                if let points = result.points {
                    LabeledContent("Result", value: "\(formatted(points.ours)) – \(formatted(points.theirs))")
                    if points.remaining > 0 { Text("\(formatted(points.remaining)) points await opponent scores.").font(.caption).foregroundStyle(.secondary) }
                }
                if let score = result.teamSeries { LabeledContent("Team scratch series", value: score.formatted()) }
                Button("Open \(result.title)") { onOpenNight(result.id) }
                    .disabled(!store.canSwitchTeam).frame(minHeight: 44)
            }
        }
    }
    private var seasonSection: some View {
        Section {
            Button { showSeason = true } label: { Label("All weeks & pre-bowls", systemImage: "calendar") }
                .frame(minHeight: 44)
            if loading { ProgressView("Loading season…") }
            if let error { Text(error).font(.callout).foregroundStyle(.red); Button("Retry season") { Task { await refresh() } }.frame(minHeight: 44) }
        }
    }
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

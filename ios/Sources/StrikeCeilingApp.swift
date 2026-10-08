import SwiftUI
import UIKit

@main
struct BA4LApp: App {
    var body: some Scene { WindowGroup { AppRootView() } }
}

struct ScoreboardView: View {
    @ObservedObject var store: ScorebookStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var scoreSize = 64.0
    @Binding var selectedBowler: Int?
    var embeddedInNavigation = false
    var onReturnToSeason: (() -> Void)? = nil
    private var selected: Int { selectedBowler ?? 0 }
    @State private var teamExpanded = false
    @State private var showNewGame = false
    @State private var showDiscard = false
    @State private var showTeam = false
    @State private var showLegacy = false
    @State private var showScan = false
    @State private var showMatch = false
    @State private var showVoice = false
    @State private var link = ""
    @State private var sheetError: String?
    @State private var records: LeagueRecordBook?
    @State private var shownMilestones: Set<String> = []
    @State private var banner: NativeMatchScoring.Milestone?
    @State private var bannerTask: Task<Void, Never>?
    @State private var recapImage: UIImage?

    private var game: BowlingGame { store.night.current.bowling(selected) }
    private var complete: Bool { store.night.current.complete(selected) }

    var body: some View {
        if embeddedInNavigation { scoreContent }
        else { NavigationStack { scoreContent } }
    }

    private var scoreContent: some View {
            Group {
            if selectedBowler == nil {
                List {
                    Section {
                        Text("Whose game are you scoring?").font(.title2.bold())
                        Text("Choose a bowler. This choice stays with your account on this device.").foregroundStyle(BA4LTheme.secondary)
                        ForEach(Night.names.indices, id: \.self) { index in
                            Button(Night.names[index]) { selectedBowler = index }.frame(minHeight: 44)
                        }
                    }
                }
            } else {
            GeometryReader { geometry in
                if horizontalSizeClass == .regular && geometry.size.width >= 760 && !dynamicTypeSize.isAccessibilitySize {
                    HStack(spacing: 0) {
                        List {
                            syncSection
                            teamSection
                        }
                        .frame(width: min(360, geometry.size.width * 0.36))
                        .accessibilityIdentifier("teamPane")
                        Divider()
                        List { gameSections(compact: false) }
                            .accessibilityIdentifier("scorecardPane")
                    }
                } else {
                    List {
                        if store.error != nil || store.pending || store.role == .viewer { syncSection }
                        teamStrip
                        gameSections(compact: true)
                        if store.error == nil && !store.pending && store.role != .viewer { syncSection }
                    }
                }
            }
            }
            }
            .scrollContentBackground(.hidden)
            .background(Color("BrandIvory"))
            .navigationTitle(store.night.match.map { "vs \($0.opponent.name.capitalized)" } ?? "Score")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let match = store.night.match {
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 0) {
                            Text("Week \(match.week) · Game \(store.night.game)" + (match.lane.map { " · \($0.rawValue.capitalized) lane" } ?? ""))
                                .font(.caption2.weight(.semibold)).textCase(.uppercase).tracking(0.6).foregroundStyle(BA4LTheme.secondary)
                            Text("vs \(match.opponent.name.capitalized)").font(.headline)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                if let onReturnToSeason {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(action: onReturnToSeason) { Label("Season", systemImage: "chevron.left") }
                            .accessibilityIdentifier("backToSeason")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { sheetError = nil; showTeam = true } label: { Label("Team", systemImage: "person.2") }
                        .accessibilityIdentifier("teamButton")
                        .disabled(!store.canSwitchTeam)
                }
            }
            .refreshable { await store.refresh(force: true) }
            .task { await store.start() }
            .task(id: store.teamID) { shownMilestones = []; await loadRecords() }
            .onChange(of: store.night) { _, night in
                MatchActivityController.shared.sync(night, up: selected)
                checkMilestones(night)
            }
            .onChange(of: selected) { _, value in MatchActivityController.shared.sync(store.night, up: value) }
            .overlay(alignment: .top) { milestoneBanner }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                await store.refresh(force: true)
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(5)) } catch { return }
                    guard !Task.isCancelled else { return }
                    await store.refresh()
                }
            }
            .confirmationDialog("Start game \(store.night.game + 1) for everyone?", isPresented: $showNewGame, titleVisibility: .visible) {
                Button("Save & start next game") {
                    Task { await store.change { night in
                        night.history.append(night.current)
                        night.game += 1
                        night.rolls = Array(repeating: [], count: 4)
                        night.finals = nil
                    } }
                }
            } message: {
                Text("All four scorecards will be kept in history. Unfinished games remain marked unfinished.")
            }
            .confirmationDialog("Replace your unsaved edit with the latest team scores?", isPresented: $showDiscard, titleVisibility: .visible) {
                Button("Discard edit & reload team", role: .destructive) { Task { await store.discardAndReload() } }
            } message: {
                Text("Your edit will not be sent. A recovery copy stays on this device.")
            }
            .sheet(isPresented: $showTeam) { teamSheet }
            .sheet(isPresented: $showLegacy) { legacySheet }
            .sheet(isPresented: $showVoice) { VoiceEntryView(store: store) }
            .sheet(isPresented: $showMatch) { MatchSetupView(store: store) }
            .sheet(isPresented: $showScan) { ScanSheet(store: store, scanner: ScoreboardScanner(send: store.transport)) }
            .tint(BA4LTheme.tint)
    }

    @ViewBuilder
    private func gameSections(compact: Bool) -> some View {
        scoreSection
        if compact { frameStrip }
        if !complete { entrySection }
        else { Section { undoButton; captureActions } }
        if compact { matchFooter } else { framesSection }
        Section("Game tools") {
            Button("Match, pre-bowl & targets", systemImage: "slider.horizontal.3") { showMatch = true }
                .disabled(!store.canEdit)
            NavigationLink("Match points & lineup") { MatchInsightsView(store: store, send: store.transport) }
            Button("Start next game", systemImage: "arrow.clockwise") { showNewGame = true }
                .disabled(!store.canEdit || store.night.game >= 1000 || store.night.history.count >= 500)
            NavigationLink { HistoryView(history: store.night.history) } label: {
                Label("Game history", systemImage: "clock.arrow.circlepath")
            }
        }
        if !store.legacy.isEmpty {
            Section {
                Button("Original device scorecards", systemImage: "archivebox") { showLegacy = true }
            } footer: { Text("Your original iPhone scorecards are preserved separately.") }
        }
    }

    private var syncSection: some View {
        Section {
            HStack {
                Label("Game \(store.night.game)", systemImage: "figure.bowling").font(.headline)
                Spacer()
                if store.busy { ProgressView().accessibilityLabel("Syncing") }
            }
            Label(store.status, systemImage: store.pending || store.error != nil ? "exclamationmark.triangle" : "checkmark.circle")
                .font(.subheadline)
                .foregroundStyle(store.pending || store.error != nil ? Color.orange : BA4LTheme.secondary)
                .accessibilityIdentifier("syncStatus")
            if store.role == .viewer { Label("View-only access", systemImage: "eye").font(.subheadline) }
            if let error = store.error {
                Text(error).font(.callout).foregroundStyle(.red).accessibilityIdentifier("syncError")
                Button("Retry save / load") { Task { await store.retry() } }.disabled(store.busy)
                if store.teamID != nil {
                    Button("Discard unsaved edits & reload team", role: .destructive) { showDiscard = true }.disabled(store.busy)
                }
            }
            if let url = store.shareURL {
                ShareLink(item: url) { Label("Share team link", systemImage: "square.and.arrow.up") }
            } else {
                Button("Save & share with team", systemImage: "person.2.badge.plus") { Task { await store.createTeam() } }
                    .disabled(!store.canEdit)
            }
        } footer: {
            Text(store.teamID == nil ? "Saved on this device. Open your web team link to use the same scorebook." : "This device and the web app share this team’s scores.")
        }
    }

    /// Four bowlers across the top with running game scores; the one being scored is marked gold. Replaces the "Bowling as" disclosure.
    private var teamStrip: some View {
        Section {
            let cells = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
            cells {
                ForEach(Night.names.indices, id: \.self) { index in
                    let on = selected == index
                    let out = store.night.prebowl.map { !$0.bowlers.contains(index) } ?? false
                    let current = store.night.current
                    Button { selectedBowler = index; teamExpanded = false } label: {
                        VStack(spacing: 4) {
                            Text(String(Night.names[index].prefix(1)))
                                .font(.headline.weight(.heavy)).frame(width: 36, height: 36)
                                .background(on ? Color("BrandGold") : BA4LTheme.tint, in: Circle())
                                .foregroundStyle(on ? Color("OnGoldSurface") : BA4LTheme.onTint)
                                .overlay(Circle().stroke(Color("BrandGold"), lineWidth: on ? 3 : 0).padding(-4))
                            Text(on ? "Up now" : Night.names[index]).font(.caption)
                                .foregroundStyle(on ? Color("BrandGold") : BA4LTheme.secondary)
                            Text("\(current.score(index))").font(.subheadline.bold().monospacedDigit()).foregroundStyle(.primary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .opacity(out ? 0.4 : 1)
                    }
                    .buttonStyle(.plain)
                    .disabled(out)
                    .accessibilityLabel("\(Night.names[index]), \(current.score(index)) scored, \(out ? "not in this pre-bowl" : current.complete(index) ? "game complete" : "frame \(current.bowling(index).frameNumber)")")
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                    .accessibilityIdentifier("bowler-\(index)")
                }
            }
            .accessibilityIdentifier("teamSelector")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
    }

    private var teamSection: some View {
        Section("Tonight’s team") { teamRows }
    }

    @ViewBuilder
    private var teamRows: some View {
        ForEach(Night.names.indices, id: \.self) { index in
            Button { selectedBowler = index; teamExpanded = false } label: {
                let rowLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                    : AnyLayout(HStackLayout(spacing: 12))
                rowLayout {
                    Image(systemName: selected == index ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selected == index ? BA4LTheme.tint : BA4LTheme.secondary)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Night.names[index]).font(.headline).foregroundStyle(.primary)
                        Text(store.night.current.complete(index) ? "Game complete" : "Frame \(store.night.current.bowling(index).frameNumber)")
                            .font(.caption).foregroundStyle(BA4LTheme.secondary)
                    }
                    if !dynamicTypeSize.isAccessibilitySize { Spacer() }
                    VStack(alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing, spacing: 4) {
                        Text("\(store.night.current.score(index)) scored").font(.subheadline.monospacedDigit()).foregroundStyle(.primary)
                        Text("\(store.night.maximum(index)) \(store.night.current.complete(index) ? "final" : "possible")")
                            .font(.caption.monospacedDigit()).foregroundStyle(BA4LTheme.secondary)
                    }
                }
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("bowler-\(index)")
            .accessibilityAddTraits(selected == index ? [.isSelected] : [])
        }
        LabeledContent("Team score", value: "\(Night.names.indices.reduce(0) { $0 + store.night.current.score($1) })")
        LabeledContent("Team potential", value: "\(Night.names.indices.reduce(0) { $0 + store.night.maximum($1) })")
    }

    /// Forest card: the bowler's running score big, the head-to-head with handicap beside it, the team game line under it.
    private var scoreSection: some View {
        let h2h = NativeMatchScoring.headToHead(store.night, bowler: selected)
        let points = NativeMatchScoring.points(store.night)
        let teamGame = points.flatMap { p in p.games.indices.contains(store.night.game - 1) ? p.games[store.night.game - 1] : nil }
        return Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(complete ? "\(Night.names[selected]) · Final" : "\(Night.names[selected]) · Frame \(game.frameNumber) · Ball \(game.ballNumber)")
                        .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.6)
                    Spacer()
                    if let h2h { Text("Hdcp +\(h2h.ourHandicap)").font(.caption.monospacedDigit()) }
                    if store.busy { ProgressView().tint(BA4LTheme.onTint).accessibilityLabel("Syncing") }
                    else if store.pending || store.error != nil { Image(systemName: "exclamationmark.triangle").accessibilityLabel(store.status) }
                }
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .lastTextBaseline, spacing: 16) { bigScore; Spacer(); headToHead(h2h) }
                    VStack(alignment: .leading, spacing: 8) { bigScore; headToHead(h2h) }
                }
                if let teamGame {
                    Text(teamGame.theirs.map { "Team game \(teamGame.game): \(teamGame.ours.map(String.init) ?? "in progress") to their \($0) with handicap" } ?? "Their game \(teamGame.game) scores come after the game")
                        .font(.caption).opacity(0.85)
                }
                if store.night.finals?[selected] != nil {
                    Text("Final total recorded. Frame marks may be incomplete.").font(.caption)
                }
            }
            .foregroundStyle(BA4LTheme.onTint)
            .padding(.vertical, 6)
            .accessibilityElement(children: .combine)
        }
        .listRowBackground(BA4LTheme.tint)
    }

    private var bigScore: some View {
        Text("\(store.night.current.score(selected))")
            .font(.system(size: scoreSize, weight: .heavy, design: .rounded).monospacedDigit())
            .accessibilityIdentifier("actualScore")
    }

    @ViewBuilder private func headToHead(_ h2h: NativeMatchScoring.HeadToHead?) -> some View {
        if let h2h {
            VStack(alignment: .trailing, spacing: 2) {
                if let theirs = h2h.theirScore { Text("vs \(h2h.opponent) \(theirs) +\(h2h.theirHandicap)").font(.caption.monospacedDigit()) }
                else { Text("vs \(h2h.opponent) · hdcp \(h2h.theirHandicap)").font(.caption.monospacedDigit()) }
                if let m = h2h.margin {
                    Text(m > 0 ? "Up \(m) for the game point" : m < 0 ? "Down \(-m)" : "Tied")
                        .font(.caption.weight(.bold)).foregroundStyle(Color("BrandGold"))
                }
            }
            .multilineTextAlignment(.trailing)
        } else if !complete {
            Text("\(store.night.maximum(selected)) possible").font(.caption.monospacedDigit()).accessibilityIdentifier("maximumScore")
        }
    }

    /// Ten frame boxes in a row, the current one on gold, scrolled into view as the game moves.
    private var frameStrip: some View {
        Section {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(0..<10, id: \.self) { index in
                            let current = !complete && index == game.frameNumber - 1
                            let scored = index < game.cumulativeScores.count
                            VStack(spacing: 2) {
                                Text(index < game.frames.count ? game.symbols(for: game.frames[index]) : " ")
                                    .font(.caption.monospaced().bold()).lineLimit(1).minimumScaleFactor(0.7)
                                Text(scored ? game.cumulativeScores[index].map(String.init) ?? "·" : (index == 9 && !complete ? "\(store.night.maximum(selected))" : " "))
                                    .font(.subheadline.bold().monospacedDigit())
                                    .foregroundStyle(scored ? .primary : BA4LTheme.secondary)
                                    .accessibilityIdentifier(index == 9 && !scored && !complete ? "maximumScore" : "frame-total-\(index)")
                            }
                            .frame(width: 46, height: 48)
                            .background(current ? Color("BrandGoldSurface") : Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(current ? Color("BrandGold") : BA4LTheme.secondary.opacity(0.3), lineWidth: current ? 2 : 1))
                            .id(index)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("Frame \(index + 1)")
                            .accessibilityValue(index == 9 && !scored && !complete ? "\(store.night.maximum(selected)) possible finish" : frameDescription(index))
                        }
                    }
                    .padding(.horizontal, 2)
                }
                .onChange(of: game.frameNumber, initial: true) { _, frame in
                    withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo(min(9, frame - 1), anchor: .center) }
                }
            }
            .accessibilityIdentifier("frameStrip")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
    }

    /// Match points so far, and the full scorecard for anyone who wants every frame listed.
    private var matchFooter: some View {
        Section {
            if let points = NativeMatchScoring.points(store.night) {
                LabeledContent("Match points so far") {
                    Text("\(formatted(points.total[0])) – \(formatted(points.total[1]))").monospacedDigit()
                }
                .accessibilityIdentifier("matchSoFar")
            }
            DisclosureGroup("Scorecard") { framesRows }
            if NativeMatchScoring.ourGames(store.night).contains(where: { $0.contains { $0 != nil } }) {
                let done = NativeMatchScoring.ourGames(store.night).allSatisfy { $0.allSatisfy { $0 != nil } }
                if let recapImage {
                    ShareLink(item: Image(uiImage: recapImage), preview: SharePreview(done ? "Big Al's 4 Life tonight" : "Big Al's 4 Life so far", image: Image(uiImage: recapImage))) {
                        Label(done ? "Share the night" : "Share the night so far", systemImage: "square.and.arrow.up")
                    }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("shareNight")
                } else {
                    Button { recapImage = NightRecapCard.render(night: store.night, bowledOn: Date()) } label: { Label("Make the recap card", systemImage: "photo") }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("makeRecap")
                }
            }
        }
        .onChange(of: store.night) { _, _ in recapImage = nil }
    }

    // MARK: Milestones

    @ViewBuilder private var milestoneBanner: some View {
        if let banner {
            HStack(spacing: 10) {
                Image(systemName: "star.fill")
                Text(banner.text).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Color("BrandGold"), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(Color("OnGoldSurface"))
            .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            .padding(.horizontal, 16).padding(.top, 8)
            .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            .onTapGesture { withAnimation { self.banner = nil } }
            .accessibilityAddTraits(.isStaticText)
            .accessibilityIdentifier("milestoneBanner")
        }
    }
    private func checkMilestones(_ night: Night) {
        let book = records
        for index in Night.names.indices {
            let name = Night.names[index]
            let game = night.current.bowling(index)
            guard !game.rolls.isEmpty else { continue }
            let mine = book?.records.first { $0.name.split(separator: " ").first.map(String.init)?.caseInsensitiveCompare(name) == .orderedSame && $0.teamName == book?.ourTeam }
            let top = book?.records.compactMap { r in r.highGame.map { (name: r.name, value: $0.value) } }.max { $0.value < $1.value }
            let found = NativeMatchScoring.milestones(name: name, game: game, score: night.current.score(index), gameNumber: night.game, seasonHigh: mine?.highGame?.value, leagueHigh: top?.value, leagueHolder: top?.name.capitalized)
            for m in found where !shownMilestones.contains("\(name)-\(m.key)") {
                shownMilestones.insert("\(name)-\(m.key)")
                show(m)
            }
        }
    }
    private func show(_ milestone: NativeMatchScoring.Milestone) {
        bannerTask?.cancel()
        withAnimation { banner = milestone }
        bannerTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            withAnimation { if banner == milestone { banner = nil } }
        }
    }
    private func loadRecords() async {
        guard store.teamID != nil else { return }
        records = try? await LeagueAPI(send: store.transport).load("/api/league/records")
    }

    private func formatted(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }

    private var entrySection: some View {
        Section {
            if dynamicTypeSize.isAccessibilitySize {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(1...9, id: \.self) { pinButton($0) }
                    pinButton(0)
                    strikeButton
                    spareButton
                    undoButton
                    scanButton
                    voiceButton
                }
                .buttonStyle(.bordered)
            } else {
            // Dial layout: high numbers on top where the thumb lands, X and / in gold on the right.
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow { pinButton(7); pinButton(8); pinButton(9); strikeButton }
                GridRow { pinButton(4); pinButton(5); pinButton(6); spareButton }
                GridRow { pinButton(1); pinButton(2); pinButton(3); undoButton }
                GridRow { pinButton(0); scanButton; voiceButton.gridCellColumns(2) }
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.roundedRectangle(radius: 12))
            .padding(.vertical, 4)
            }
        }
    }

    private func pinButton(_ pins: Int) -> some View {
        Button { enter(pins) } label: {
            Text(String(pins))
                .font(.title3.bold().monospacedDigit())
                .frame(maxWidth: .infinity, minHeight: 56)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: 12))
        .tint(BA4LTheme.tint)
        .foregroundStyle(BA4LTheme.onTint)
        .disabled(!store.canEdit || pins > game.pinsAvailable)
        .accessibilityLabel("\(pins) pins")
        .accessibilityIdentifier("pins-\(pins)")
    }

    private var strikeButton: some View {
        Button { enter(10) } label: { Text("X").font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 56) }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 12))
            .tint(Color("BrandGold"))
            .foregroundStyle(Color("OnGoldSurface"))
            .disabled(!store.canEdit || complete || game.pinsAvailable != 10)
            .accessibilityLabel("Strike, 10 pins")
            .accessibilityIdentifier("pins-10")
    }

    private var spareButton: some View {
        Button { enter(game.pinsAvailable) } label: { Text("/").font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 56) }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 12))
            .tint(Color("BrandGoldSurface"))
            .foregroundStyle(Color("OnGoldSurface"))
            .disabled(!store.canEdit || !NativeMatchScoring.spareLegal(game))
            .accessibilityLabel("Spare, \(game.pinsAvailable) pins")
            .accessibilityIdentifier("pins-spare")
    }

    private func enter(_ pins: Int) {
        Task { await store.change { night in
            guard !night.current.complete(selected) else { return }
            var current = night.current.bowling(selected)
            if current.add(pins) { night.rolls[selected] = current.rolls }
        } }
    }

    private var undoButton: some View {
        Button {
            Task { await store.change { night in
                if night.finals?[selected] != nil { night.finals?[selected] = nil }
                else if !night.rolls[selected].isEmpty { night.rolls[selected].removeLast() }
            } }
        } label: { keypadAction("Undo", systemImage: "arrow.uturn.backward") }
        .disabled(!store.canEdit || (game.rolls.isEmpty && store.night.finals?[selected] == nil))
        .accessibilityLabel("Undo last roll")
        .accessibilityIdentifier("undoButton")
    }

    private var scanButton: some View {
        Button { showScan = true } label: { keypadAction("Scan", systemImage: "camera.viewfinder") }
            .disabled(!store.canEdit)
            .accessibilityLabel("Scan the scoreboard")
            .accessibilityIdentifier("scanButton")
    }

    private var voiceButton: some View {
        Button { showVoice = true } label: { keypadAction("Voice", systemImage: "mic") }
            .disabled(!store.canEdit)
            .accessibilityLabel("Say a roll")
    }

    private var captureActions: some View {
        HStack { scanButton; voiceButton }.buttonStyle(.bordered)
    }

    private func keypadAction(_ title: String, systemImage: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: systemImage)
            Text(title).font(.caption)
        }
        .frame(maxWidth: .infinity, minHeight: 56)
    }

    private var framesSection: some View { Section("Scorecard") { framesRows } }

    private var framesRows: some View {
            ForEach(0..<10, id: \.self) { index in
                ViewThatFits(in: .horizontal) {
                    frameRow(index, stacked: false)
                    frameRow(index, stacked: true)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Frame \(index + 1)")
                .accessibilityValue(frameDescription(index))
            }
    }

    private func frameDescription(_ index: Int) -> String {
        let marks = index < game.frames.count ? game.symbols(for: game.frames[index]) : "Not played"
        let total = index < game.cumulativeScores.count ? game.cumulativeScores[index].map(String.init) ?? "Pending bonuses" : "Not scored"
        return "\(marks), total \(total)"
    }

    private func frameRow(_ index: Int, stacked: Bool) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            Text("\(index + 1)").foregroundStyle(BA4LTheme.secondary).frame(minWidth: 28, alignment: .leading)
            Text(index < game.frames.count ? game.symbols(for: game.frames[index]) : "·")
                .font(.body.monospaced().bold())
            if !stacked { Spacer() }
            Text(index < game.cumulativeScores.count ? game.cumulativeScores[index].map(String.init) ?? "·" : "·")
                .font(.body.monospacedDigit())
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var teamSheet: some View {
        NavigationStack {
            Form {
                Section("Open the same scorebook as the web") {
                    Text("On the web app, use Share team link. Paste that link here.")
                    TextField("https://…/?night=…", text: $link)
                        .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("teamLinkField")
                    Button("Open team scorebook") {
                        Task {
                            await store.openTeam(link)
                            if store.error == nil || store.pending { showTeam = false }
                            else { sheetError = store.error }
                        }
                    }.disabled(!store.canSwitchTeam || link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if store.busy { ProgressView("Opening team…") }
                    if let sheetError { Text(sheetError).foregroundStyle(.red) }
                }
                Section {
                    Text("Opening a team loads that team's scores. Your existing device scorebook stays backed up.")
                }
            }
            .navigationTitle("Team scorebook")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showTeam = false } } }
        }
    }

    private var legacySheet: some View {
        NavigationStack {
            List {
                Section {
                    Text("These are your original iPhone scorecards. Importing copies matching names into an empty local scorebook. Other bowlers stay in this archive. Shared team scores are never replaced.")
                }
                ForEach(store.legacy) { bowler in
                    Section(bowler.name) {
                        Text("Rolls: \(bowler.game.rolls.map(String.init).joined(separator: ", "))")
                    }
                }
                if store.canMigrate {
                    Section {
                        Button("Import Doug, Mustafa, Kyle & Pete") { Task { await store.migrateLegacy(); if store.error == nil { showLegacy = false } } }
                    }
                }
                if let error = store.error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Original scorecards")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showLegacy = false } } }
        }
    }

}

struct HistoryView: View {
    let history: [RecordedGame]
    var body: some View {
        List {
            if history.isEmpty {
                ContentUnavailableView("No saved games", systemImage: "clock.arrow.circlepath", description: Text("Start the next game to keep everyone's current scorecard here."))
            }
            ForEach(Array(history.enumerated().reversed()), id: \.offset) { _, game in
                Section("Game \(game.game)") {
                    ForEach(Night.names.indices, id: \.self) { index in
                        LabeledContent {
                            Text("\(game.score(index))").monospacedDigit()
                        } label: {
                            VStack(alignment: .leading) {
                                Text(Night.names[index])
                                if !game.complete(index) { Text("Unfinished").font(.caption).foregroundStyle(BA4LTheme.secondary) }
                            }
                        }
                    }
                    LabeledContent("Team total", value: "\(Night.names.indices.reduce(0) { $0 + game.score($1) })")
                }
            }
        }
        .navigationTitle("Game history")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Forest in daylight, muted gold in dark bowling alleys. Paired asset colors preserve contrast.
enum BA4LTheme {
    static let secondary = Color("SecondaryText")
    static let onTint = Color("OnBrandGreen")
    static let tint = Color("BrandGreen")
}

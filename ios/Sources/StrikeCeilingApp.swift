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
                        List { gameSections }
                            .accessibilityIdentifier("scorecardPane")
                    }
                } else {
                    List {
                        if store.error != nil || store.pending || store.role == .viewer { syncSection }
                        compactTeamSection
                        gameSections
                        if store.error == nil && !store.pending && store.role != .viewer { syncSection }
                    }
                }
            }
            }
            }
            .scrollContentBackground(.hidden)
            .background(Color("BrandIvory"))
            .navigationTitle("Score")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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
    private var gameSections: some View {
        scoreSection
        if !complete { entrySection }
        else { Section { undoButton; captureActions } }
        framesSection
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

    private var compactTeamSection: some View {
        Section {
            DisclosureGroup(isExpanded: $teamExpanded) {
                teamRows
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Bowling as \(Night.names[selected])")
                        .font(.headline)
                    Text("Tonight’s team · \(Night.names.indices.reduce(0) { $0 + store.night.current.score($1) }) scored")
                        .font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                }
                .frame(minHeight: 44, alignment: .leading)
            }
            .accessibilityIdentifier("teamSelector")
            .accessibilityHint("Expand to choose a bowler or see everyone’s scores")
        }
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

    private var scoreSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Game \(store.night.game)").font(.subheadline.weight(.semibold))
                    Spacer()
                    if store.busy { ProgressView().tint(BA4LTheme.onTint).accessibilityLabel("Syncing") }
                    else { Image(systemName: store.pending || store.error != nil ? "exclamationmark.triangle" : "checkmark.circle").accessibilityLabel(store.status) }
                }
                ViewThatFits(in: .horizontal) {
                    scoreTotals(stacked: false)
                    scoreTotals(stacked: true)
                }
                Text(complete ? "Game complete" : "Frame \(game.frameNumber) · Ball \(game.ballNumber)")
                    .font(.headline)
                if store.night.finals?[selected] != nil {
                    Text("Final total recorded. Frame marks may be incomplete.").font(.caption)
                }
            }
            .foregroundStyle(BA4LTheme.onTint)
            .padding(.vertical, 8)
            .accessibilityElement(children: .contain)
        }
        .listRowBackground(BA4LTheme.tint)
    }

    private func scoreTotals(stacked: Bool) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 24))
        return layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(complete ? "Final score" : "Actual score").font(.subheadline)
                Text("\(store.night.current.score(selected))")
                    .font(.system(size: scoreSize, weight: .heavy, design: .rounded).monospacedDigit())
                    .accessibilityIdentifier("actualScore")
            }
            if !complete {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Possible finish").font(.subheadline)
                    Text("\(store.night.maximum(selected))")
                        .font(.title2.monospacedDigit())
                        .accessibilityIdentifier("maximumScore")
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var entrySection: some View {
        Section {
            if dynamicTypeSize.isAccessibilitySize {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(1...9, id: \.self) { pinButton($0) }
                    pinButton(game.pinsAvailable, special: true)
                    pinButton(0)
                    undoButton
                    scanButton
                    voiceButton
                }
                .buttonStyle(.bordered)
            } else {
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow {
                    pinButton(1); pinButton(2); pinButton(3)
                    pinButton(game.pinsAvailable, special: true)
                }
                GridRow {
                    pinButton(4); pinButton(5); pinButton(6)
                    undoButton
                }
                GridRow {
                    pinButton(7); pinButton(8); pinButton(9)
                    scanButton
                }
                GridRow {
                    pinButton(0).gridCellColumns(2)
                    voiceButton.gridCellColumns(2)
                }
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.roundedRectangle(radius: 12))
            .padding(.vertical, 4)
            }
        } footer: {
            Text("Tap pins knocked down. X = strike, / = spare, 0 = miss. Strike and spare bonuses settle after the next rolls.")
        }
    }

    private func pinButton(_ pins: Int, special: Bool = false) -> some View {
        Button {
            Task { await store.change { night in
                guard !night.current.complete(selected) else { return }
                var current = night.current.bowling(selected)
                if current.add(pins) { night.rolls[selected] = current.rolls }
            } }
        } label: {
            Text(special ? entryLabel(pins) : String(pins))
                .font(.title3.bold().monospacedDigit())
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: 12))
        .tint(special ? Color("BrandGold") : BA4LTheme.tint)
        .foregroundStyle(special ? Color("BrandForest") : BA4LTheme.onTint)
        .disabled(!store.canEdit || pins > game.pinsAvailable)
        .accessibilityLabel(special ? (entryLabel(pins) == "X" ? "Strike, 10 pins" : "Spare, \(pins) pins") : "\(pins) pins")
        .accessibilityIdentifier(special ? "pins-10" : "pins-\(pins)")
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
        .frame(maxWidth: .infinity, minHeight: 44)
    }

    private var framesSection: some View {
        Section("Scorecard") {
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

    private func entryLabel(_ pins: Int) -> String {
        var projected = game
        guard projected.add(pins), let frame = projected.frames.last else { return String(pins) }
        return projected.symbols(for: frame).split(separator: " ").last.map(String.init) ?? String(pins)
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

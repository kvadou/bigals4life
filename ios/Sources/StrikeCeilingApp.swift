import SwiftUI

@main
struct BA4LApp: App {
    var body: some Scene { WindowGroup { ScoreboardView() } }
}

struct ScoreboardView: View {
    @StateObject private var store = ScorebookStore()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .title3) private var pinWidth = 66.0
    @State private var selected = 0
    @State private var showNewGame = false
    @State private var showDiscard = false
    @State private var showTeam = false
    @State private var showLegacy = false
    @State private var showScan = false
    @State private var link = ""
    @State private var sheetError: String?

    private var game: BowlingGame { store.night.current.bowling(selected) }
    private var complete: Bool { store.night.current.complete(selected) }

    var body: some View {
        NavigationStack {
            List {
                syncSection
                teamSection
                scoreSection
                if !complete { entrySection }
                Section {
                    Button("Scan the scoreboard", systemImage: "camera.viewfinder") { showScan = true }
                        .disabled(!store.canEdit)
                        .accessibilityIdentifier("scanButton")
                } footer: { Text("Take a photo of the lane monitor. Review the rolls, then apply them to the current game.") }
                framesSection
                Section {
                    Button("Undo last roll", systemImage: "arrow.uturn.backward") {
                        Task { await store.change { night in
                            if night.finals?[selected] != nil { night.finals?[selected] = nil }
                            else if !night.rolls[selected].isEmpty { night.rolls[selected].removeLast() }
                        } }
                    }
                    .disabled(!store.canEdit || (game.rolls.isEmpty && store.night.finals?[selected] == nil))
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
            .navigationTitle("BA4L")
            .toolbar {
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
                    }; selected = 0 }
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
            .sheet(isPresented: $showScan) { ScanSheet(store: store) }
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
                .foregroundStyle(store.pending || store.error != nil ? Color.orange : Color.secondary)
                .accessibilityIdentifier("syncStatus")
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
            Text(store.teamID == nil ? "Saved on this iPhone. Open your web team link to use the same scorebook." : "This iPhone and the web app share this team's scores. Anyone with the link can view and edit.")
        }
    }

    private var teamSection: some View {
        Section("Tonight’s team") {
            ForEach(Night.names.indices, id: \.self) { index in
                Button { selected = index } label: {
                    let rowLayout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                        : AnyLayout(HStackLayout(spacing: 12))
                    rowLayout {
                        Image(systemName: selected == index ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(selected == index ? Color.accentColor : Color.secondary)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Night.names[index]).font(.headline).foregroundStyle(.primary)
                            Text(store.night.current.complete(index) ? "Game complete" : "Frame \(store.night.current.bowling(index).frameNumber)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if !dynamicTypeSize.isAccessibilitySize { Spacer() }
                        VStack(alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing, spacing: 4) {
                            Text("\(store.night.current.score(index)) scored").font(.subheadline.monospacedDigit()).foregroundStyle(.primary)
                            Text("\(store.night.maximum(index)) \(store.night.current.complete(index) ? "final" : "possible")")
                                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
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
    }

    private var scoreSection: some View {
        Section("\(Night.names[selected])’s game") {
            VStack(alignment: .leading, spacing: 8) {
                Text(complete ? "Final score" : "Highest possible finish").font(.headline).foregroundStyle(.secondary)
                Text("\(store.night.maximum(selected))")
                    .font(.largeTitle.bold().monospacedDigit()).foregroundStyle(.tint)
                    .contentTransition(.numericText()).accessibilityIdentifier("maximumScore")
                Text(complete ? "Game complete. Every pin counted." : "Clear the remaining pins. Strike the rest of the way.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if store.night.finals?[selected] != nil {
                    Text("Final total recorded from the score sheet. Frame marks may be incomplete.")
                        .font(.caption).foregroundStyle(.secondary)
                } else if !complete {
                    Text("\(game.settledScore) scored in completed frames. Strike and spare bonuses settle after the next rolls.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
        }
    }

    private var entrySection: some View {
        Section {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: pinWidth))], spacing: 12) {
                ForEach(0...game.pinsAvailable, id: \.self) { pins in
                    Button {
                        Task { await store.change { night in
                            guard !night.current.complete(selected) else { return }
                            var current = night.current.bowling(selected)
                            if current.add(pins) { night.rolls[selected] = current.rolls }
                        } }
                    } label: {
                        Text(entryLabel(pins)).font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent).disabled(!store.canEdit)
                    .accessibilityLabel(pins == 10 ? "Strike, 10 pins" : "\(pins) pins")
                    .accessibilityIdentifier("pins-\(pins)")
                }
            }
            .padding(.vertical, 8)
        } header: {
            Text("Frame \(game.frameNumber) · Ball \(game.ballNumber)")
        } footer: {
            Text("Tap pins knocked down on this roll. X = strike, / = spare, 0 = miss.")
        }
    }

    private var framesSection: some View {
        Section("Scorecard") {
            ForEach(0..<10, id: \.self) { index in
                HStack {
                    Text("\(index + 1)").foregroundStyle(.secondary).frame(minWidth: 28, alignment: .leading)
                    Text(index < game.frames.count ? game.symbols(for: game.frames[index]) : "·").font(.body.monospaced().bold())
                    Spacer()
                    Text(index < game.cumulativeScores.count ? game.cumulativeScores[index].map(String.init) ?? "·" : "·")
                        .font(.body.monospacedDigit())
                }
                .accessibilityElement(children: .combine)
            }
        }
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
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showLegacy = false } } }
        }
    }

    private func entryLabel(_ pins: Int) -> String {
        if pins == 10 { return "X" }
        if pins == game.pinsAvailable && game.pinsAvailable < 10 { return "/" }
        return String(pins)
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
                                if !game.complete(index) { Text("Unfinished").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                    LabeledContent("Team total", value: "\(Night.names.indices.reduce(0) { $0 + game.score($1) })")
                }
            }
        }
        .navigationTitle("Game history")
    }
}

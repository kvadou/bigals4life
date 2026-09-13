import SwiftUI

@MainActor
final class WeekGameModel: ObservableObject {
    @Published private(set) var night: Night?
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    private let nightID: String
    private let client: ScorebookClient
    init(nightID: String, send: @escaping SeasonTransport) {
        self.nightID = nightID
        self.client = ScorebookClient(send: send)
    }
    var games: [RecordedGame] {
        guard let night else { return [] }
        return (night.history + [night.current]).sorted { $0.game < $1.game }
    }
    func refresh() async {
        guard !loading else { return }
        loading = true; error = nil
        defer { loading = false }
        do {
            // The shared client validates IDs, rolls and unknown fields before displaying data.
            night = try await client.request("GET", id: nightID).state
        } catch { self.error = error.localizedDescription }
    }
}

/// A read-only frame drilldown. Opening history never switches or edits the live scorebook.
struct WeekGameView: View {
    @StateObject private var model: WeekGameModel
    @State private var gameNumber: Int
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private let weekTitle: String
    init(nightID: String, game: Int, weekTitle: String, send: @escaping SeasonTransport) {
        _model = StateObject(wrappedValue: WeekGameModel(nightID: nightID, send: send))
        _gameNumber = State(initialValue: game)
        self.weekTitle = weekTitle
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let error = model.error {
                    VStack(alignment: .leading, spacing: 12) {
                        Label(error, systemImage: "exclamationmark.circle").foregroundStyle(BA4LTheme.secondary)
                        Button("Retry scorecards") { Task { await model.refresh() } }.buttonStyle(.bordered)
                    }
                }
                if model.loading && model.night == nil {
                    ProgressView("Loading scorecards…").frame(maxWidth: .infinity)
                } else if model.night != nil {
                    Picker("Game", selection: $gameNumber) {
                        ForEach(model.games, id: \.game) { game in Text("Game \(game.game)").tag(game.game) }
                    }.pickerStyle(.menu)
                    if let recorded = model.games.first(where: { $0.game == gameNumber }) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(weekTitle).font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                            Text("Game \(recorded.game)").font(.largeTitle.bold())
                            if let prebowl = model.night?.prebowl {
                                Text("Pre-bowl · \(prebowl.bowlers.map { frameBowlerName($0) }.joined(separator: ", "))").foregroundStyle(BA4LTheme.secondary)
                            }
                            let teamDone = (0..<4).allSatisfy { recorded.complete($0) }
                            if teamDone {
                                Text("Team scratch total \((0..<4).reduce(0) { $0 + recorded.score($1) })").font(.headline).monospacedDigit()
                            } else { Text("Team total waits for all four final scores.").foregroundStyle(BA4LTheme.secondary) }
                            Text("Read-only scorecards. Frame totals wait for strike and spare bonuses.").font(.footnote).foregroundStyle(BA4LTheme.secondary)
                        }
                        LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize || horizontalSizeClass != .regular ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 300), spacing: 20)], alignment: .leading, spacing: 20) {
                            ForEach(0..<4, id: \.self) { index in
                                BowlerFrameCard(recorded: recorded, index: index, participates: model.night?.prebowl?.bowlers.contains(index) ?? true)
                            }
                        }
                    } else {
                        ContentUnavailableView("Game not found", systemImage: "list.bullet.rectangle", description: Text("Choose one of this night’s recorded games above."))
                    }
                }
            }
            .padding()
            .frame(maxWidth: 1200)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Scorecards")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .task { await model.refresh() }
    }
}

private struct BowlerFrameCard: View {
    let recorded: RecordedGame
    let index: Int
    let participates: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var game: BowlingGame { recorded.bowling(index) }
    private var final: Int? { recorded.finals.flatMap { $0.indices.contains(index) ? $0[index] : nil } }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(frameBowlerName(index)).font(.title2.bold())
            if !participates { Text("Not part of this pre-bowl").font(.subheadline).foregroundStyle(BA4LTheme.secondary) }
            if let final {
                Text("Final \(final)").font(.headline).monospacedDigit()
                Text(game.rolls.isEmpty ? "Final score entered without frames. No roll-by-roll detail was recorded." : "Final score was entered separately. The frames below show only recorded rolls; their totals may differ.")
                    .font(.footnote).foregroundStyle(BA4LTheme.secondary)
            } else if !game.rolls.isEmpty {
                Text("\(game.isComplete ? "Final" : "Settled score") \(game.settledScore)").font(.headline).monospacedDigit()
            } else { Text("No scores recorded").font(.subheadline).foregroundStyle(BA4LTheme.secondary) }
            if !game.rolls.isEmpty {
                Divider()
                ForEach(0..<10, id: \.self) { frame in
                    frameRow(frame)
                    if frame < 9 { Divider().accessibilityHidden(true) }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(frameBowlerName(index)) scorecard")
    }
    @ViewBuilder
    private func frameRow(_ frame: Int) -> some View {
        let rolls = game.frames.indices.contains(frame) ? game.frames[frame] : []
        let cumulative = game.cumulativeScores.indices.contains(frame) ? game.cumulativeScores[frame] : nil
        let marks = rolls.isEmpty ? "Not bowled" : game.symbols(for: rolls)
        let running = cumulative.map(String.init) ?? (rolls.isEmpty ? "" : "Pending")
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Frame \(frame + 1)").font(.subheadline).foregroundStyle(BA4LTheme.secondary)
                    Text(marks).font(.headline).monospacedDigit()
                    if !running.isEmpty { Text("Total: \(running)").font(.subheadline).monospacedDigit() }
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(String(frame + 1)).font(.subheadline).foregroundStyle(BA4LTheme.secondary).frame(width: 24, alignment: .leading)
                    Text(marks).font(.headline).monospacedDigit()
                    Spacer(minLength: 8)
                    Text(running).font(.subheadline).monospacedDigit().foregroundStyle(BA4LTheme.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(frameBowlerName(index)), frame \(frame + 1), \(spokenRolls(rolls)), \(cumulative.map { "cumulative score \($0)" } ?? (rolls.isEmpty ? "not recorded" : "score pending"))")
    }
    private func spokenRolls(_ rolls: [Int]) -> String {
        guard !rolls.isEmpty else { return "not bowled" }
        return rolls.enumerated().map { "ball \($0.offset + 1): \($0.element) pins" }.joined(separator: ", ")
    }
}
private func frameBowlerName(_ index: Int) -> String {
    let names = ["Doug", "Mustafa", "Kyle", "Pete"]
    return names.indices.contains(index) ? names[index] : "Bowler \(index + 1)"
}

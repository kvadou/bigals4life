import SwiftUI

struct Bowler: Identifiable, Codable {
    var id = UUID()
    var name: String
    var game = BowlingGame()
}

@main
struct StrikeCeilingApp: App {
    var body: some Scene { WindowGroup { ScoreboardView() } }
}

struct ScoreboardView: View {
    @AppStorage("strike-ceiling.bowlers.v1") private var saved = Data()
    @State private var bowlers: [Bowler] = [Bowler(name: "Mustafa"), Bowler(name: "Doug")]
    @State private var selected = 0
    @State private var showNewGame = false
    @State private var showAddBowler = false
    @State private var newName = ""

    private var game: BowlingGame { bowlers[selected].game }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Bowler", selection: $selected) {
                        ForEach(bowlers.indices, id: \.self) { index in
                            Text(bowlers[index].name).tag(index)
                        }
                    }
                    .frame(minHeight: 44)
                    VStack(alignment: .leading, spacing: 8) {
                        Label(game.isComplete ? "Final score" : "Highest possible final score", systemImage: "figure.bowling")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Text("\(game.maximumScore)")
                            .font(.largeTitle.bold().monospacedDigit())
                            .foregroundStyle(.tint)
                            .contentTransition(.numericText())
                        Text(game.isComplete ? "Game complete. Nice bowling." : "If you knock down every remaining pin.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if !game.isComplete {
                            Text("\(game.settledScore) scored in completed frames")
                                .font(.subheadline.monospacedDigit())
                            Text("Strike and spare bonuses settle after the next rolls.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 12)
                    .accessibilityElement(children: .combine)
                }

                if !game.isComplete {
                    Section {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 66))], spacing: 12) {
                            ForEach(0...game.pinsAvailable, id: \.self) { pins in
                                Button {
                                    withAnimation { _ = bowlers[selected].game.add(pins) }
                                    persist()
                                } label: {
                                    Text(entryLabel(pins))
                                        .font(.title3.bold())
                                        .frame(maxWidth: .infinity, minHeight: 48)
                                }
                                .buttonStyle(.borderedProminent)
                                .accessibilityLabel("\(pins) pins\(pins == game.pinsAvailable ? ", clear the remaining pins" : "")")
                            }
                        }
                        .padding(.vertical, 8)
                    } header: {
                        Text("Frame \(game.frameNumber) · Ball \(game.ballNumber)")
                    } footer: {
                        Text("Tap the pins knocked down on this roll. X = strike, / = spare, 0 = gutter or foul.")
                    }
                }

                Section("Scorecard") {
                    ForEach(0..<10, id: \.self) { index in
                        HStack {
                            Text("\(index + 1)").foregroundStyle(.secondary).frame(minWidth: 28, alignment: .leading)
                            Text(index < game.frames.count ? game.symbols(for: game.frames[index]) : "·")
                                .font(.body.monospaced().bold())
                            Spacer()
                            Text(scoreText(index)).font(.body.monospacedDigit())
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Frame \(index + 1), \(index < game.frames.count ? game.symbols(for: game.frames[index]) : "not bowled"), score \(scoreText(index))")
                    }
                }
                Section {
                    Button("Undo last roll", systemImage: "arrow.uturn.backward") {
                        bowlers[selected].game.undo()
                        persist()
                    }
                    .disabled(game.rolls.isEmpty)
                    .frame(minHeight: 44)
                    Button("New game for \(bowlers[selected].name)", systemImage: "arrow.clockwise") { showNewGame = true }
                        .frame(minHeight: 44)
                    Button("Add bowler", systemImage: "person.badge.plus") { showAddBowler = true }
                        .frame(minHeight: 44)
                }
            }
            .navigationTitle("Strike Ceiling")
            .onAppear {
                if let restored = try? JSONDecoder().decode([Bowler].self, from: saved), !restored.isEmpty,
                   restored.allSatisfy({ bowler in
                       var validated = BowlingGame()
                       return bowler.game.rolls.allSatisfy { validated.add($0) }
                   }) {
                    bowlers = restored
                    selected = min(selected, restored.count - 1)
                }
            }
            .confirmationDialog("Start a new game for \(bowlers[selected].name)? This clears their scorecard.", isPresented: $showNewGame, titleVisibility: .visible) {
                Button("Start new game", role: .destructive) { bowlers[selected].game = BowlingGame(); persist() }
            }
            .sheet(isPresented: $showAddBowler) {
                NavigationStack {
                    Form { TextField("Bowler name", text: $newName).textInputAutocapitalization(.words) }
                        .navigationTitle("Add bowler")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showAddBowler = false } }
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Add") {
                                    bowlers.append(Bowler(name: newName.trimmingCharacters(in: .whitespacesAndNewlines)))
                                    selected = bowlers.count - 1
                                    newName = ""
                                    showAddBowler = false
                                    persist()
                                }.disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                        }
                }
            }
        }
    }

    private func entryLabel(_ pins: Int) -> String {
        if pins == 10 { return "X" }
        if pins == game.pinsAvailable && game.pinsAvailable < 10 { return "/" }
        return String(pins)
    }

    private func scoreText(_ index: Int) -> String {
        guard index < game.cumulativeScores.count, let value = game.cumulativeScores[index] else { return "·" }
        return String(value)
    }

    private func persist() { if let data = try? JSONEncoder().encode(bowlers) { saved = data } }
}

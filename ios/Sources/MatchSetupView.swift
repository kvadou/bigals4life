import SwiftUI

struct MatchSetupView: View {
    @ObservedObject var store: ScorebookStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft = Night()
    @State private var original = Night()
    @State private var revision = 0
    @State private var nightID: String?
    @State private var error: String?
    @State private var teams: [RosterTeam] = []
    struct RosterTeam: Decodable, Identifiable {
        var number: Int; var name: String; var bowlers: [RosterBowler]
        var id: Int { number }
    }
    struct RosterBowler: Decodable { var name: String; var handicap: Int }
    struct Rosters: Decodable { var season: String; var week: Int; var teams: [RosterTeam] }
    var body: some View {
        NavigationStack {
            Form {
                Section("Match") {
                    Toggle("Set up league match", isOn: Binding(get: { draft.match != nil }, set: { enabled in
                        draft.match = enabled ? LeagueMatch(season: "2026-27", week: 1, opponent: MatchOpponent(number: 0, name: "Opponent", bowlers: (1...4).map { MatchBowler(name: "Bowler \($0)", handicap: 0) }), ours: Night.names.map { MatchBowler(name: $0, handicap: 0) }, opponentGames: [], lane: .odd) : nil
                    }))
                    if draft.match != nil {
                        TextField("Season", text: match(\.season))
                        Stepper("Week \(draft.match!.week)", value: match(\.week), in: 1...60)
                        Picker("Our lane", selection: Binding(get: { draft.match?.lane ?? .odd }, set: { draft.match?.lane = $0 })) {
                            Text("Odd · submit first").tag(MatchLane.odd)
                            Text("Even · choose after them").tag(MatchLane.even)
                        }
                        if !teams.isEmpty {
                            Menu("Choose league opponent") {
                                ForEach(teams) { team in Button(team.name) { if draft.match?.opponent.number != team.number { draft.match?.opponentGames = [] }; draft.match?.opponent = MatchOpponent(number: team.number, name: team.name, bowlers: Array(team.bowlers.prefix(4)).map { MatchBowler(name: $0.name, handicap: $0.handicap) }) } }
                            }
                        }
                        TextField("Opponent", text: Binding(get: { draft.match!.opponent.name }, set: { draft.match?.opponent.name = String($0.prefix(40)) }))
                        Stepper("Team \(draft.match!.opponent.number)", value: Binding(get: { draft.match!.opponent.number }, set: { draft.match?.opponent.number = $0 }), in: 0...99)
                    }
                }
                if let league = draft.match {
                    Section("Our lineup") {
                        ForEach(league.ours.indices, id: \.self) { index in
                            VStack(alignment: .leading) {
                                HStack {
                                    Text(league.ours[index].name).font(.headline)
                                    Spacer()
                                    if index > 0 { Button { draft.match?.ours.swapAt(index, index - 1) } label: { Image(systemName: "arrow.up").frame(minWidth: 44, minHeight: 44) }.buttonStyle(.borderless).accessibilityLabel("Move \(league.ours[index].name) up") }
                                    if index < league.ours.count - 1 { Button { draft.match?.ours.swapAt(index, index + 1) } label: { Image(systemName: "arrow.down").frame(minWidth: 44, minHeight: 44) }.buttonStyle(.borderless).accessibilityLabel("Move \(league.ours[index].name) down") }
                                }
                                Stepper("Handicap \(league.ours[index].handicap)", value: Binding(get: { draft.match!.ours[index].handicap }, set: { draft.match?.ours[index].handicap = $0 }), in: 0...120)
                            }
                        }
                    }
                    Section("Opponent lineup") {
                        ForEach(league.opponent.bowlers.indices, id: \.self) { index in
                            TextField("Name", text: Binding(get: { draft.match!.opponent.bowlers[index].name }, set: { draft.match?.opponent.bowlers[index].name = String($0.prefix(40)) }))
                            Stepper("Handicap \(league.opponent.bowlers[index].handicap)", value: Binding(get: { draft.match!.opponent.bowlers[index].handicap }, set: { draft.match?.opponent.bowlers[index].handicap = $0 }), in: 0...120)
                        }
                    }
                    ForEach(0..<max(3, league.opponentGames.count), id: \.self) { game in
                        Section("Opponent game \(game + 1)") {
                            ForEach(league.opponent.bowlers.indices, id: \.self) { bowler in
                                TextField(league.opponent.bowlers[bowler].name, text: opponentScore(game, bowler)).keyboardType(.numberPad)
                            }
                        }
                    }
                }
                Section("Pre-bowling") {
                    Toggle("This is a pre-bowl", isOn: Binding(get: { draft.prebowl != nil }, set: { draft.prebowl = $0 ? Prebowl(week: draft.match?.week ?? 1, bowlers: [0]) : nil }))
                    if draft.prebowl != nil {
                        Stepper("Week \(draft.prebowl!.week)", value: Binding(get: { draft.prebowl!.week }, set: { draft.prebowl?.week = $0 }), in: 1...60)
                        ForEach(Night.names.indices, id: \.self) { index in
                            Toggle(Night.names[index], isOn: Binding(get: { draft.prebowl!.bowlers.contains(index) }, set: { yes in
                                if yes { draft.prebowl?.bowlers.append(index) }
                                else if draft.prebowl!.bowlers.count > 1 { draft.prebowl?.bowlers.removeAll { $0 == index } }
                            }))
                        }
                    }
                }
                Section("Beer numbers") {
                    Toggle("Track targets", isOn: Binding(get: { draft.drinkTargets != nil }, set: { draft.drinkTargets = $0 ? DrinkTargets(high: 200, low: 100, qualificationRule: "exact") : nil }))
                    if draft.drinkTargets != nil {
                        Stepper("High \(draft.drinkTargets!.high)", value: Binding(get: { draft.drinkTargets!.high }, set: { draft.drinkTargets?.high = $0 }), in: 0...300)
                        Stepper("Low \(draft.drinkTargets!.low)", value: Binding(get: { draft.drinkTargets!.low }, set: { draft.drinkTargets?.low = $0 }), in: 0...300)
                        Picker("Rule", selection: Binding(get: { draft.drinkTargets?.qualificationRule ?? "" }, set: { draft.drinkTargets?.qualificationRule = $0.isEmpty ? nil : $0 })) {
                            Text("Not set").tag(""); Text("Exact score").tag("exact"); Text("Threshold").tag("threshold")
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Match setup")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } }.disabled(!store.canEdit) }
            }
            .task {
                draft = store.night; original = store.night; revision = store.revision; nightID = store.teamID
                do {
                    let (data, response) = try await store.transport(URLRequest(url: URL(string: ScorebookClient.origin + "/api/league/teams")!))
                    if response.statusCode == 200 { teams = try JSONDecoder().decode(Rosters.self, from: data).teams }
                } catch { self.error = "League roster is unavailable. You can enter the matchup manually." }
            }
        }
    }
    private func match<T>(_ key: WritableKeyPath<LeagueMatch,T>) -> Binding<T> {
        Binding(get: { draft.match![keyPath: key] }, set: { draft.match?[keyPath: key] = $0 })
    }
    private func opponentScore(_ game: Int, _ bowler: Int) -> Binding<String> {
        Binding(get: {
            guard let games = draft.match?.opponentGames, games.indices.contains(game), games[game].indices.contains(bowler) else { return "" }
            return games[game][bowler].map(String.init) ?? ""
        }, set: { text in
            guard text.isEmpty || (Int(text).map { (0...300).contains($0) } ?? false) else { return }
            while draft.match!.opponentGames.count <= game { draft.match?.opponentGames.append([]) }
            while draft.match!.opponentGames[game].count <= bowler { draft.match?.opponentGames[game].append(nil) }
            draft.match?.opponentGames[game][bowler] = Int(text)
        })
    }
    private func save() async {
        guard store.teamID == nightID, store.revision == revision, store.night == original else { error = "Scores changed while this form was open. Reopen it to use the latest data."; return }
        do { _ = try draft.validated() } catch { self.error = error.localizedDescription; return }
        await store.change { $0 = draft }
        if let failure = store.error { error = failure } else { dismiss() }
    }
}

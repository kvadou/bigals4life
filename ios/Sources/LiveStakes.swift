import Foundation

struct LiveStake: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case needs, clinch, tied, outOfReach, waiting }
    var rosterIndex: Int
    var name: String
    var game: Int
    var title: String
    var detail: String
    var targetScratch: Int?
    var status: Status
    var id: String { "\(game)-\(rosterIndex)" }
}

enum LiveStakes {
    struct Bounds: Codable, Equatable { var minimum: Int; var maximum: Int; var complete: Bool }
    static func finalScoreBounds(_ rolls: [Int]) -> Bounds? {
        var game = BowlingGame()
        guard rolls.count <= 21, rolls.allSatisfy({ game.add($0) }) else { return nil }
        var minimum = game
        while !minimum.isComplete { minimum.add(0) }
        return Bounds(minimum: minimum.settledScore, maximum: game.maximumScore, complete: game.isComplete)
    }

    static func cards(for night: Night) -> [LiveStake] {
        guard let match = night.match, night.prebowl == nil, (1...3).contains(night.game), night.rolls.count == 4,
              night.finals == nil || night.finals?.count == 4 else { return [] }
        let indices = match.ours.compactMap { Night.names.firstIndex(of: $0.name) }
        guard match.ours.count == 4, indices.count == 4, Set(indices).count == 4 else { return [] }
        return match.ours.enumerated().compactMap { slot, ours in
            guard match.opponent.bowlers.indices.contains(slot) else { return nil }
            let opponent = match.opponent.bowlers[slot], index = indices[slot], name = Night.names[index]
            guard (0...120).contains(ours.handicap), (0...120).contains(opponent.handicap) else { return nil }
            func card(_ status: LiveStake.Status, _ title: String, _ detail: String, _ target: Int? = nil) -> LiveStake {
                LiveStake(rosterIndex: index, name: name, game: night.game, title: title, detail: detail, targetScratch: target, status: status)
            }
            let opponents = match.opponentGames.indices.contains(night.game - 1) ? match.opponentGames[night.game - 1] : []
            guard opponents.indices.contains(slot), let other = opponents[slot] else {
                return card(.waiting, "\(name)'s matchup is waiting", "Enter the opponent's final score to see the target.")
            }
            guard (0...300).contains(other) else { return nil }
            let bounds: Bounds
            if let score = night.finals?[index] {
                guard (0...300).contains(score) else { return nil }
                bounds = Bounds(minimum: score, maximum: score, complete: true)
            } else {
                guard let value = finalScoreBounds(night.rolls[index]) else { return nil }
                bounds = value
            }
            let tie = other + opponent.handicap - ours.handicap, target = max(0, tie + 1)
            if bounds.minimum > tie {
                return card(.clinch, bounds.complete ? "\(name) wins the matchup" : "\(name) has clinched the matchup", bounds.complete ? "\(bounds.minimum) scratch, \(bounds.minimum + ours.handicap) with handicap." : "Even a \(bounds.minimum) finish wins. Maximum: \(bounds.maximum).", target)
            }
            if bounds.complete && bounds.minimum == tie {
                return card(.tied, "\(name)'s matchup is tied", "\(bounds.minimum + ours.handicap) each with handicap.", target)
            }
            if bounds.maximum < target {
                let detail = bounds.maximum == tie ? "A \(bounds.maximum) finish can still tie the matchup." : "Needs \(target) scratch to win. \(bounds.complete ? "Finished" : "Maximum"): \(bounds.maximum)."
                return card(.outOfReach, bounds.complete ? "\(name)'s opponent wins" : "\(name) cannot pass the opponent", detail, target)
            }
            return card(.needs, "\(name) needs \(target) to win", "Scratch target, including the handicap difference. Maximum: \(bounds.maximum).", target)
        }
    }
}

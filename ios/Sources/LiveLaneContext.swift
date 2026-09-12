import Foundation

/// Session context is a suggestion for Live Mode, never a source of score events.
/// The caller must still establish bowler identity and corroborate each score.
struct LiveLaneContext: Equatable {
    enum Intent: String, CaseIterable, Identifiable {
        case automatic, league, prebowl, practice
        var id: String { rawValue }
        var title: String {
            switch self {
            case .automatic: return "Automatic"
            case .league: return "League night"
            case .prebowl: return "Pre-bowl"
            case .practice: return "Practice"
            }
        }
    }

    /// Pass only metadata bound to this live session. A previously opened
    /// scorebook's match/pre-bowl settings do not establish today's context.
    enum Metadata: Equatable {
        case none, league, prebowl
    }

    enum Phase: Equatable {
        case beforeWarmup, warmup, leagueExpected, practice, prebowl
    }

    let phase: Phase
    let competitionConfirmed: Bool
    let explanation: String

    /// Eligibility only. This is not permission to save an observed score.
    var canAttributeCompetitiveScores: Bool {
        competitionConfirmed && (phase == .leagueExpected || phase == .prebowl)
    }

    var title: String {
        switch phase {
        case .beforeWarmup: return "Before warm-up"
        case .warmup: return "Warm-up"
        case .leagueExpected: return competitionConfirmed ? "League night" : "League play expected"
        case .practice: return "Practice"
        case .prebowl: return "Pre-bowl"
        }
    }

    static let leagueTimeZone = TimeZone(identifier: "America/Chicago")!

    /// `observedCompetition` means independent evidence of competition in this
    /// session, not that the clock passed 7:10 or someone delivered a ball.
    static func resolve(
        at date: Date = Date(),
        intent: Intent = .automatic,
        metadata: Metadata = .none,
        observedCompetition: Bool = false
    ) -> LiveLaneContext {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = leagueTimeZone
        let parts = calendar.dateComponents([.weekday, .hour, .minute], from: date)
        let thursday = parts.weekday == 5
        let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)

        if intent == .practice {
            return .init(phase: .practice, competitionConfirmed: false,
                         explanation: "Practice session. Deliveries stay separate from competitive scores.")
        }
        if intent == .prebowl || (intent == .automatic && metadata == .prebowl) {
            return .init(phase: .prebowl, competitionConfirmed: observedCompetition,
                         explanation: observedCompetition
                            ? "Pre-bowl competition is confirmed. Each score still needs a known bowler and corroborating evidence."
                            : "Pre-bowl session. Waiting for evidence that scored play has started.")
        }
        if observedCompetition {
            return .init(phase: .leagueExpected, competitionConfirmed: true,
                         explanation: "League play is confirmed by session evidence, independently of the schedule.")
        }

        let leagueContext = intent == .league || (intent == .automatic && metadata == .league)
        if !thursday {
            return leagueContext
                ? .init(phase: .leagueExpected, competitionConfirmed: false,
                        explanation: "League session selected outside the usual Thursday schedule. Waiting for evidence of scored play.")
                : .init(phase: .practice, competitionConfirmed: false,
                        explanation: "Outside the Thursday league schedule. Treating this as practice unless a pre-bowl or league session is established.")
        }
        if minute < 19 * 60 && !leagueContext {
            return .init(phase: .practice, competitionConfirmed: false,
                         explanation: "Before Thursday's 7:00 PM Central warm-up. Treating this as practice unless a pre-bowl or league session is established.")
        }
        if minute < 19 * 60 {
            return .init(phase: .beforeWarmup, competitionConfirmed: false,
                         explanation: "Thursday warm-up is expected at 7:00 PM Central, with league play around 7:10. The clock does not start scoring.")
        }
        if minute < 19 * 60 + 10 {
            return .init(phase: .warmup, competitionConfirmed: false,
                         explanation: "Thursday warm-up usually runs from 7:00 to 7:10 PM Central. Warm-up deliveries do not enter competitive scores.")
        }
        return .init(phase: .leagueExpected, competitionConfirmed: false,
                     explanation: "Thursday league play usually starts around 7:10 PM Central. Waiting for evidence of scored play; warm-up may still be underway.")
    }
}

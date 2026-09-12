import Foundation

@main
struct LiveLaneContextTests {
    static func main() {
        var assertions = 0
        func check(_ condition: Bool, _ message: String) {
            assertions += 1
            guard condition else { fatalError(message) }
        }
        func date(_ value: String) -> Date {
            ISO8601DateFormatter().date(from: value)!
        }
        // September is CDT: Thursday evening locally crosses into Friday UTC.
        let before = date("2026-09-10T23:59:59Z")
        let warmup = date("2026-09-11T00:00:00Z")
        let lateWarmup = date("2026-09-11T00:09:59Z")
        let game = date("2026-09-11T00:10:00Z")
        let friday = date("2026-09-12T00:10:00Z")
        check(LiveLaneContext.resolve(at: before).phase == .practice, "18:59 Thursday defaults to practice")
        check(LiveLaneContext.resolve(at: date("2026-09-10T14:00:00Z")).phase == .practice, "Thursday morning defaults to practice")
        check(LiveLaneContext.resolve(at: date("2026-09-10T20:00:00Z")).phase == .practice, "Thursday afternoon defaults to practice")
        check(LiveLaneContext.resolve(at: before, intent: .league).phase == .beforeWarmup, "Explicit league before warm-up")
        check(LiveLaneContext.resolve(at: before, metadata: .league).phase == .beforeWarmup, "Bound league session before warm-up")
        check(LiveLaneContext.resolve(at: warmup).phase == .warmup, "19:00 Thursday")
        check(LiveLaneContext.resolve(at: lateWarmup).phase == .warmup, "19:09 Thursday")
        check(LiveLaneContext.resolve(at: game).phase == .leagueExpected, "19:10 Thursday")
        check(LiveLaneContext.resolve(at: friday).phase == .practice, "Friday defaults to practice")
        // Standard time is UTC-6, not UTC-5.
        check(LiveLaneContext.resolve(at: date("2026-12-04T00:59:59Z")).phase == .practice, "CST 18:59 defaults to practice")
        check(LiveLaneContext.resolve(at: date("2026-12-04T00:59:59Z"), metadata: .league).phase == .beforeWarmup, "CST league session 18:59")
        check(LiveLaneContext.resolve(at: date("2026-12-04T01:00:00Z")).phase == .warmup, "CST 19:00")
        check(LiveLaneContext.resolve(at: date("2026-12-04T01:10:00Z")).phase == .leagueExpected, "CST 19:10")
        for instant in [before, warmup, lateWarmup, game, friday] {
            for intent in LiveLaneContext.Intent.allCases {
                for metadata in [LiveLaneContext.Metadata.none, .league, .prebowl] {
                    let context = LiveLaneContext.resolve(at: instant, intent: intent, metadata: metadata)
                    check(!context.canAttributeCompetitiveScores, "Time and metadata cannot establish scored play")
                    check(!context.competitionConfirmed, "Time cannot confirm competition")
                    check(!context.explanation.isEmpty && !context.title.isEmpty, "Readable context")
                }
            }
        }
        let practice = LiveLaneContext.resolve(at: game, intent: .practice, metadata: .league, observedCompetition: true)
        check(practice.phase == .practice && !practice.canAttributeCompetitiveScores, "Explicit practice wins")
        let pre = LiveLaneContext.resolve(at: warmup, metadata: .prebowl)
        check(pre.phase == .prebowl && !pre.canAttributeCompetitiveScores, "Pre-bowl metadata wins over Thursday warmup")
        let confirmedPre = LiveLaneContext.resolve(at: friday, metadata: .prebowl, observedCompetition: true)
        check(confirmedPre.phase == .prebowl && confirmedPre.canAttributeCompetitiveScores, "Confirmed pre-bowl")
        let confirmedLeague = LiveLaneContext.resolve(at: warmup, observedCompetition: true)
        check(confirmedLeague.phase == .leagueExpected && confirmedLeague.competitionConfirmed, "Evidence overrides clock")
        check(confirmedLeague.title == "League night", "Confirmed competition title")
        let rescheduled = LiveLaneContext.resolve(at: friday, metadata: .league)
        check(rescheduled.phase == .leagueExpected && !rescheduled.competitionConfirmed, "Explicit rescheduled league")
        let intentWins = LiveLaneContext.resolve(at: game, intent: .league, metadata: .prebowl)
        check(intentWins.phase == .leagueExpected, "Explicit league overrides pre-bowl metadata")
        check(LiveLaneContext.resolve(at: friday, intent: .prebowl, metadata: .league).phase == .prebowl, "Explicit pre-bowl overrides league metadata")
        print("LiveLaneContext: \(assertions) assertions passed")
    }
}

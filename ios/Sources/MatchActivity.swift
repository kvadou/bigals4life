import ActivityKit
import Foundation

/// Shared between the app and the widget extension. Team game with handicap, who is up, match points so far.
struct MatchActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var game: Int
        var ours: Int
        var theirs: Int?
        var upName: String
        var upScore: Int
        var frame: Int
        var pointsOurs: Double
        var pointsTheirs: Double
        var final: Bool
    }
    var opponent: String
    var week: Int
    var lane: String?
}

#if canImport(SwiftUI) && !WIDGET_EXTENSION
/// Keeps one Live Activity in step with the shared night. Starts on the first roll of a match night, ends when the night is final.
@MainActor
final class MatchActivityController {
    static let shared = MatchActivityController()
    private var activity: Activity<MatchActivityAttributes>?
    private var lastState: MatchActivityAttributes.ContentState?

    func sync(_ night: Night, up: Int) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        guard let match = night.match, let state = Self.state(night, up: up) else { end(); return }
        if activity == nil { activity = Activity<MatchActivityAttributes>.activities.first }
        if state == lastState { return }
        lastState = state
        let attributes = MatchActivityAttributes(opponent: match.opponent.name.capitalized, week: match.week, lane: match.lane?.rawValue.capitalized)
        Task {
            if let activity, activity.activityState == .active {
                await activity.update(ActivityContent(state: state, staleDate: nil))
                if state.final { await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(.now + 3600)) }
            } else if !state.final {
                activity = try? Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: nil))
            }
        }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil; lastState = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    /// Nil until someone has rolled a ball tonight.
    static func state(_ night: Night, up: Int) -> MatchActivityAttributes.ContentState? {
        let rolled = night.history.contains { $0.rolls.contains { !$0.isEmpty } || $0.finals?.contains { $0 != nil } == true } || night.rolls.contains { !$0.isEmpty } || night.finals?.contains { $0 != nil } == true
        guard rolled else { return nil }
        let points = NativeMatchScoring.points(night)
        let index = night.game - 1
        let teamGame = points.flatMap { $0.games.indices.contains(index) ? $0.games[index] : nil }
        var running = 0
        for i in Night.names.indices {
            let handicap = night.match?.ours.first(where: { $0.name == Night.names[i] })?.handicap ?? 0
            running += night.current.score(i) + handicap
        }
        let ours = teamGame?.ours ?? running
        let bowler = min(max(up, 0), Night.names.count - 1)
        let game = night.current.bowling(bowler)
        let final = night.game >= 3 && Night.names.indices.allSatisfy { night.current.complete($0) }
        return .init(game: night.game, ours: ours, theirs: teamGame?.theirs, upName: Night.names[bowler], upScore: night.current.score(bowler),
                     frame: game.isComplete ? 10 : game.frameNumber, pointsOurs: points?.total[0] ?? 0, pointsTheirs: points?.total[1] ?? 0, final: final)
    }
}
#endif

import ActivityKit
import SwiftUI
import WidgetKit

@main
struct BA4LWidgetsBundle: WidgetBundle {
    var body: some Widget { MatchLiveActivity() }
}

/// Lock screen and Dynamic Island view of the match: team game with handicap, who is up, match points so far.
struct MatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MatchActivityAttributes.self) { context in
            LockScreenMatchView(context: context)
                .activityBackgroundTint(Color("BrandGreen"))
                .activitySystemActionForegroundColor(Color("OnBrandGreen"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("BIG AL'S").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        Text("\(context.state.ours)").font(.title2.weight(.bold)).monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.attributes.opponent.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
                        Text(context.state.theirs.map(String.init) ?? "–").font(.title2.weight(.bold)).monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(upLine(context.state)).font(.caption)
                        Spacer()
                        Text("Pts \(points(context.state.pointsOurs)) – \(points(context.state.pointsTheirs))").font(.caption.weight(.semibold)).foregroundStyle(Color("BrandGold"))
                    }
                }
            } compactLeading: {
                Text("\(context.state.ours)").font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(Color("BrandGold"))
            } compactTrailing: {
                Text(context.state.theirs.map(String.init) ?? "G\(context.state.game)").font(.caption.weight(.semibold)).monospacedDigit()
            } minimal: {
                Text("\(context.state.ours)").font(.caption2.weight(.bold)).monospacedDigit().foregroundStyle(Color("BrandGold"))
            }
        }
    }
}

private struct LockScreenMatchView: View {
    let context: ActivityViewContext<MatchActivityAttributes>
    var body: some View {
        let s = context.state
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Week \(context.attributes.week) · Game \(s.game)" + (context.attributes.lane.map { " · \($0) lane" } ?? ""))
                    .font(.caption2.weight(.semibold)).textCase(.uppercase).tracking(0.6).opacity(0.8)
                Spacer()
                Text(s.final ? "Final" : upLine(s)).font(.caption2).opacity(0.9)
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Big Al's 4 Life").font(.caption.weight(.semibold))
                    Text("\(s.ours)").font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(context.attributes.opponent).font(.caption.weight(.semibold)).lineLimit(1)
                    Text(s.theirs.map(String.init) ?? "–").font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                }
            }
            HStack {
                Text("with handicap").font(.caption2).opacity(0.7)
                Spacer()
                Text("Match points \(points(s.pointsOurs)) – \(points(s.pointsTheirs))").font(.caption.weight(.semibold)).foregroundStyle(Color("BrandGold"))
            }
        }
        .foregroundStyle(Color("OnBrandGreen"))
        .padding(14)
    }
}

private func upLine(_ s: MatchActivityAttributes.ContentState) -> String {
    s.frame >= 10 && s.final ? "\(s.upName) \(s.upScore)" : "\(s.upName) up · frame \(s.frame) · \(s.upScore)"
}
private func points(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }

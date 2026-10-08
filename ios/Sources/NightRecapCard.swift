import SwiftUI

/// A branded recap of the night for the group text: team series with handicap, match points, every bowler's games, the night's moment.
struct NightRecapCard: View {
    let night: Night
    let bowledOn: Date

    private var points: NativeMatchPoints? { NativeMatchScoring.points(night) }
    private var games: [[Int?]] { NativeMatchScoring.ourGames(night) }
    private var allDone: Bool { games.allSatisfy { $0.allSatisfy { $0 != nil } } }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center) {
                BA4LBrandMark(size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Big Al's 4 Life").font(.system(size: 22, weight: .bold, design: .rounded))
                    Text(subtitle).font(.system(size: 13, weight: .semibold)).textCase(.uppercase).tracking(0.8).opacity(0.75)
                }
                Spacer()
                if let points {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(pts(points.total[0])) – \(pts(points.total[1]))").font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color("BrandGold"))
                        Text(allDone ? "match points" : "points so far").font(.system(size: 11, weight: .semibold)).textCase(.uppercase).tracking(0.6).opacity(0.75)
                    }
                }
            }
            if let points {
                HStack(spacing: 12) {
                    ForEach(points.games, id: \.game) { g in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Game \(g.game)").font(.system(size: 11, weight: .semibold)).textCase(.uppercase).tracking(0.6).opacity(0.75)
                            Text("\(g.ours.map(String.init) ?? "–") · \(g.theirs.map(String.init) ?? "–")").font(.system(size: 17, weight: .semibold)).monospacedDigit()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Series").font(.system(size: 11, weight: .semibold)).textCase(.uppercase).tracking(0.6).opacity(0.75)
                        Text("\(points.series.ours.map(String.init) ?? "–") · \(points.series.theirs.map(String.init) ?? "–")").font(.system(size: 17, weight: .semibold)).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(12)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            VStack(spacing: 6) {
                ForEach(Night.names.indices, id: \.self) { i in
                    let row = games.map { $0[i] }
                    HStack {
                        Text(Night.names[i]).font(.system(size: 17, weight: .semibold)).frame(width: 90, alignment: .leading)
                        ForEach(row.indices, id: \.self) { g in
                            Text(row[g].map(String.init) ?? "–").font(.system(size: 17)).monospacedDigit().frame(maxWidth: .infinity)
                                .foregroundStyle(row[g] == bestGame?.score && Night.names[i] == bestGame?.name ? Color("BrandGold") : Color("OnBrandGreen"))
                        }
                        Text(row.allSatisfy { $0 != nil } ? "\(row.compactMap { $0 }.reduce(0, +))" : "–").font(.system(size: 17, weight: .bold)).monospacedDigit().frame(width: 60, alignment: .trailing)
                    }
                }
            }
            if let best = bestGame {
                HStack(spacing: 8) {
                    Image(systemName: "star.fill").foregroundStyle(Color("BrandGold"))
                    Text("Night's moment: \(best.name) \(best.score) in game \(best.game)").font(.system(size: 14, weight: .medium))
                }
            }
            Text("bigals4life.com").font(.system(size: 11, weight: .semibold)).tracking(0.6).opacity(0.6)
        }
        .foregroundStyle(Color("OnBrandGreen"))
        .padding(24)
        .frame(width: 360)
        .background(Color("BrandGreen"))
    }

    private var subtitle: String {
        let date = bowledOn.formatted(.dateTime.month(.abbreviated).day())
        if let match = night.match { return "Week \(match.week) · vs \(match.opponent.name.capitalized) · \(date)" }
        if let prebowl = night.prebowl { return "Week \(prebowl.week) pre-bowl · \(date)" }
        return date
    }
    private var bestGame: (name: String, score: Int, game: Int)? {
        var best: (String, Int, Int)?
        for (g, column) in games.enumerated() {
            for (i, score) in column.enumerated() {
                if let score, score > (best?.1 ?? -1) { best = (Night.names[i], score, g + 1) }
            }
        }
        return best.map { (name: $0.0, score: $0.1, game: $0.2) }
    }
    private func pts(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }

    /// 3x bitmap for sharing. Runs on the main actor because ImageRenderer renders a view.
    @MainActor static func render(night: Night, bowledOn: Date) -> UIImage? {
        let renderer = ImageRenderer(content: NightRecapCard(night: night, bowledOn: bowledOn))
        renderer.scale = 3
        return renderer.uiImage
    }
}

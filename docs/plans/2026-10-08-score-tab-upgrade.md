# Score tab upgrade (iOS build 22)

Design source: the "Score" section of the mobile upgrade review (claude.ai/artifact/LUnBzHsqckrHmvxNrJeC2z), approved 2026-10-08. Palette and rules from `DESIGN.md`: ivory cards, forest score surface, gold only for the selected scoring action and result highlights, 12-16pt radii, 44pt+ targets, Dynamic Type, VoiceOver, reduced motion.

All of it is view code in `ios/Sources/StrikeCeilingApp.swift` (`ScoreboardView`) plus one small helper in `MatchInsightsView.swift`. No API, no schema, no web change. The night state the view reads is unchanged, so builds 20 and 22 can score the same scorebook side by side.

## What the screen becomes, top to bottom (compact width)

1. **Header line**: `Week 5 · Game 1 · Lane 1` as an eyebrow and `vs Here 4 Beer` as the title, from `store.night.match`. A night with no match keeps today's "Score" title. Replaces the inline "Score" title and the "Bowling as Pete" disclosure.
2. **Team strip**: four cells, one per bowler, avatar initial + first name + running game score. The selected bowler's avatar is gold with a ring; the label under it says "Up now". Tap switches `selectedBowler`. Replaces `compactTeamSection` (the DisclosureGroup). Regular width keeps `teamSection` in the side pane.
3. **Score card** (forest): one row `Pete · Frame 4 · Ball 1` left, `Hdcp +9` right. Big number is the bowler's running score. Right of it, two small lines: `vs Ryan 54 +31` and the point status (`Up 3 for the game point` / `Down 4` / `Tied` in gold text). Under it: `Team game 1: 185 to their 178 with handicap`, or "Their scores come after the game" when `opponentGames` has nothing for this game. "Possible finish" moves into the frame strip's 10th box as a faint number and leaves the card.
4. **Frame strip**: ten boxes in a horizontal `ScrollView`, marks on top, cumulative below, current frame on pale gold with a gold border, auto-scrolled into view with `ScrollViewReader`. Replaces the ten-row "Scorecard" list section for compact width; the full list stays as the regular-width right pane and as a "Scorecard" disclosure under the keypad for VoiceOver users (same `frameDescription` labels).
5. **Keypad**: dial layout. Rows `7 8 9 X`, `4 5 6 /`, `1 2 3 Undo`, `0 Scan Voice`. `X` and `/` are gold. `/` is enabled only on ball 2 of a frame (or ball 2/3 of the tenth when a spare is legal) and enters `pinsAvailable`. `X` is enabled only when `pinsAvailable == 10`. Keys are 56pt tall. Accessibility-size layout stays the two-column grid, with `/` added.
6. **Footer line**: `Match 2.5 – 1.5 so far · Scorecard ↓`. Match points from `NativeMatchScoring.points`.

The hint paragraph ("Tap pins knocked down. X = strike…") goes. Sync status stays where it is (`syncSection`, shown only when there is something to say).

## Code

### 1. Head-to-head for the selected bowler (`MatchInsightsView.swift`)

```swift
extension NativeMatchScoring {
    struct HeadToHead { let opponent: String; let theirScore: Int?; let theirHandicap: Int; let ourHandicap: Int; let margin: Int? }
    /// The selected bowler's pairing in the current game, with handicap applied to both sides.
    static func headToHead(_ night: Night, bowler index: Int) -> HeadToHead? {
        guard let match = night.match, let slot = match.ours.firstIndex(where: { $0.name == Night.names[index] }),
              slot < match.opponent.bowlers.count else { return nil }
        let them = match.opponent.bowlers[slot]
        let theirScore = match.opponentGames.at(night.game - 1)?.at(slot) ?? nil
        let ours = night.current.score(index) + match.ours[slot].handicap
        let margin = theirScore.map { ours - ($0 + them.handicap) }
        return HeadToHead(opponent: them.name.split(separator: " ").first.map { String($0).capitalized } ?? them.name,
                          theirScore: theirScore, theirHandicap: them.handicap, ourHandicap: match.ours[slot].handicap, margin: margin)
    }
}
```

`Array.at` already exists (used by `SeasonWeek.progressLabel`). Pairing is by lineup slot, matching `lib/league/points.ts` (see LEARNED: "Lineup order is not roster order").

### 2. Team strip (`StrikeCeilingApp.swift`, replaces `compactTeamSection`)

```swift
private var teamStrip: some View {
    Section {
        HStack(spacing: 8) {
            ForEach(Night.names.indices, id: \.self) { index in
                Button { selectedBowler = index } label: {
                    VStack(spacing: 4) {
                        Text(String(Night.names[index].prefix(1)))
                            .font(.headline.weight(.heavy)).frame(width: 36, height: 36)
                            .background(selected == index ? Color("BrandGold") : BA4LTheme.tint, in: Circle())
                            .foregroundStyle(selected == index ? Color("OnGoldSurface") : BA4LTheme.onTint)
                            .overlay(Circle().stroke(Color("BrandGold"), lineWidth: selected == index ? 3 : 0).padding(-4))
                        Text(selected == index ? "Up now" : Night.names[index])
                            .font(.caption).foregroundStyle(selected == index ? Color("BrandGoldDark") : BA4LTheme.secondary)
                        Text("\(store.night.current.score(index))").font(.subheadline.bold().monospacedDigit())
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(Night.names[index]), \(store.night.current.score(index)) scored\(store.night.current.complete(index) ? ", game complete" : ", frame \(store.night.current.bowling(index).frameNumber)")")
                .accessibilityAddTraits(selected == index ? [.isSelected] : [])
                .accessibilityIdentifier("bowler-\(index)")
            }
        }
    }
}
```

`bowler-N` identifiers are kept so `ios/Tests` UI fixtures still find them. Pre-bowl nights dim bowlers not in `night.prebowl.bowlers` and disable their button.

### 3. Score card (replaces `scoreSection` + `scoreTotals`)

```swift
private var scoreSection: some View {
    let h2h = NativeMatchScoring.headToHead(store.night, bowler: selected)
    return Section {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(complete ? "\(Night.names[selected]) · Final" : "\(Night.names[selected]) · Frame \(game.frameNumber) · Ball \(game.ballNumber)")
                    .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(0.6)
                Spacer()
                if let h2h { Text("Hdcp +\(h2h.ourHandicap)").font(.caption.monospacedDigit()) }
                if store.busy { ProgressView().tint(BA4LTheme.onTint).accessibilityLabel("Syncing") }
            }
            HStack(alignment: .lastTextBaseline) {
                Text("\(store.night.current.score(selected))")
                    .font(.system(size: scoreSize, weight: .heavy, design: .rounded).monospacedDigit())
                    .accessibilityIdentifier("actualScore")
                Spacer()
                if let h2h {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let theirs = h2h.theirScore { Text("vs \(h2h.opponent) \(theirs) +\(h2h.theirHandicap)").font(.caption.monospacedDigit()) }
                        else { Text("vs \(h2h.opponent) · hdcp \(h2h.theirHandicap)").font(.caption.monospacedDigit()) }
                        if let m = h2h.margin {
                            Text(m > 0 ? "Up \(m) for the game point" : m < 0 ? "Down \(-m)" : "Tied")
                                .font(.caption.weight(.bold)).foregroundStyle(Color("BrandLime"))
                        }
                    }
                }
            }
            if let points = NativeMatchScoring.points(store.night), let g = points.games.at(store.night.game - 1) {
                Text(g.theirs.map { "Team game \(g.game): \(g.ours ?? 0) to their \($0) with handicap" } ?? "Their scores come after the game")
                    .font(.caption).opacity(0.85)
            }
            if store.night.finals?[selected] != nil { Text("Final total recorded. Frame marks may be incomplete.").font(.caption) }
        }
        .foregroundStyle(BA4LTheme.onTint).padding(.vertical, 6).accessibilityElement(children: .combine)
    }
    .listRowBackground(BA4LTheme.tint)
}
```

Lime inside the forest card is the one place the design system allows it outside the mark ("restrained lime"); if the contrast test rejects it, fall back to `Color("BrandGold")`.

### 4. Frame strip (new; compact width replaces `framesSection`)

```swift
private var frameStrip: some View {
    Section {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(0..<10, id: \.self) { index in
                        let current = !complete && index == game.frameNumber - 1
                        VStack(spacing: 2) {
                            Text(index < game.frames.count ? game.symbols(for: game.frames[index]) : " ").font(.caption.monospaced())
                            Text(index < game.cumulativeScores.count ? game.cumulativeScores[index].map(String.init) ?? "·" : (index == 9 && !complete ? "\(store.night.maximum(selected))" : " "))
                                .font(.subheadline.bold().monospacedDigit())
                                .foregroundStyle(index == 9 && index >= game.cumulativeScores.count ? BA4LTheme.secondary : .primary)
                        }
                        .frame(width: 44, height: 48)
                        .background(current ? Color("BrandGoldPale") : Color("BrandIvory"), in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(current ? Color("BrandGold") : Color.secondary.opacity(0.2)))
                        .id(index)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Frame \(index + 1)").accessibilityValue(frameDescription(index))
                    }
                }
            }
            .onChange(of: game.frameNumber, initial: true) { _, frame in withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo(frame - 1, anchor: .center) } }
        }
        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
    }
    .listRowBackground(Color.clear)
}
```

`@Environment(\.accessibilityReduceMotion) private var reduceMotion` added to the view. `frameDescription` is unchanged.

### 5. Keypad (`entrySection`)

```swift
Grid(horizontalSpacing: 8, verticalSpacing: 8) {
    GridRow { pinButton(7); pinButton(8); pinButton(9); strikeButton }
    GridRow { pinButton(4); pinButton(5); pinButton(6); spareButton }
    GridRow { pinButton(1); pinButton(2); pinButton(3); undoButton }
    GridRow { pinButton(0); scanButton; voiceButton.gridCellColumns(2) }
}
```

```swift
private var strikeButton: some View { pinButton(10, special: true).disabled(!store.canEdit || game.pinsAvailable != 10) }
/// Spare is legal only on a second ball with pins standing (ball 2 of frames 1-9, or ball 2/3 of the tenth after a non-strike).
private var spareLegal: Bool { !complete && game.ballNumber > 1 && game.pinsAvailable < 10 }
private var spareButton: some View {
    Button { Task { await store.change { night in
        guard !night.current.complete(selected) else { return }
        var current = night.current.bowling(selected)
        if current.add(current.pinsAvailable) { night.rolls[selected] = current.rolls }
    } } } label: { Text("/").font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 56) }
    .buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 12))
    .tint(Color("BrandGoldPale")).foregroundStyle(Color("BrandGoldDark"))
    .disabled(!store.canEdit || !spareLegal)
    .accessibilityLabel("Spare, \(game.pinsAvailable) pins").accessibilityIdentifier("pins-spare")
}
```

`pinButton` minHeight goes from 44 to 56; `special` no longer switches between X and / by `pinsAvailable` (today's `entryLabel`), so `pins-10` always means strike. `entryLabel` is deleted. Ball 1 of the tenth after a strike: `pinsAvailable == 10`, so X enables and / disables, which is right.

### 6. Compact body order

```swift
List {
    if store.error != nil || store.pending || store.role == .viewer { syncSection }
    teamStrip
    scoreSection
    frameStrip
    entrySection
    matchFooter          // "Match 2.5 – 1.5 so far" + DisclosureGroup("Scorecard") { framesRows }
    if store.error == nil && !store.pending && store.role != .viewer { syncSection }
}
.navigationTitle(store.night.match.map { "vs \($0.opponent.name.capitalized)" } ?? "Score")
.toolbar { ToolbarItem(placement: .principal) { header } ... }  // header = eyebrow "Week 5 · Game 1 · Lane 1" above the title
```

Regular width (iPad) keeps `teamSection` and `syncSection` in the left pane; right pane becomes `scoreSection, frameStrip, entrySection, framesSection`.

## Tests

- `ios/Tests/main.swift`: add `headToHead` cases against the Week 4 night (Pete slot 3 vs Rachel Carlson; game 2: 285+18 vs 108+86, margin 109) and a night with no match (nil). Add spare-legality cases: ball 1 → false; after `[7]` → true; after `[10]` in frame 10 ball 2 → false; after `[10, 7]` in frame 10 → true.
- `ios/Tests/theme-contrast.ts`: add lime-on-forest and gold-dark-on-gold-pale pairs at the sizes used.
- Existing UI fixture identifiers unchanged: `actualScore`, `pins-N`, `pins-10`, `undoButton`, `scanButton`, `bowler-N`, `teamButton`. `maximumScore` moves to the 10th frame box; update the fixture that reads it.

## Verification before TestFlight

1. `bun ios/Tests/run.ts` green, `xcodebuild` green (both run outside the sandbox).
2. Simulator screenshots, iPhone 16 and iPad, light and dark, default and AX3 Dynamic Type, on the Week 4 night (`/season/2b8f4c1e-6d3a-4e57-9f0b-04a7d1c62e15`), mid-game 2 for Pete. Check: frame strip scrolls to frame 4, X disabled after a 7, / disabled on ball 1, head-to-head reads "vs Rachel 108 +86".
3. VoiceOver pass over the team strip and frame strip.
4. Bump `CURRENT_PROJECT_VERSION` to 22, push, archive.

Out of scope for this build: iPad persistent team rail polish, Scan/Voice sheet redesign, anything on the web.

# BA4L native responsive refinement

Preserve the existing scoring, team sync, scan behavior and native grouped-list identity. This is an Operate surface. Keep native navigation, system text styles and semantic backgrounds, with a forest tint that adapts to dark appearance.

- Wide regular-width windows use two independently scrollable panes: team and sync alongside the selected bowler’s scorecard. Narrow, split-window and accessibility text layouts retain a full-width list.
- Keep all actions available, preserve safe areas and 44-point controls, use inline titles for focused sheets and wrap score/scan content at large text sizes.
- Verify with the existing scoring harness and an iOS simulator build. Integration checks should inspect iPhone and iPad in both appearances, landscape, narrow windows and accessibility text sizes.

Implementation example:
```swift
if horizontalSizeClass == .regular && geometry.size.width >= 760 && !dynamicTypeSize.isAccessibilitySize {
    HStack(spacing: 0) { teamList; Divider(); scorecardList }
} else {
    compactList
}
```

No auth, persistence, API, signing or release changes belong in this refinement.

## Verification

- Debug simulator build passed with code signing disabled, derived data `/tmp/ba4l-responsive-ios`.
- `bun ios/Tests/run.ts`: 209,588 scoring and deterministic store/client checks passed; six native request bodies passed the web schema.
- Screenshot verification across iPhone/iPad is owned by release integration. Real-device posture and camera hardware verification remain outside simulator coverage.

Compact-layout follow-up: an expandable team selector shows the active bowler and team total while leaving the active score and pin entry nearer the top. Expanding reveals all existing bowler and team scores. Selecting a bowler closes the selector; regular wide panes keep the team fully visible.

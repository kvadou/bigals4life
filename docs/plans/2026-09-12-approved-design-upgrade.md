# Approved BA4L A+B upgrade

User approved the recommended A+B combination. Build score-first entry, team-night dashboard, coordinated branding and Home Screen icon. Preserve backend contracts and all offline/auth safeguards.

1. Author shared vector4/hook emblem, web wordmark/favicon, native icon assets and regenerateopaque1024icon.
2. Web: reorder live entry around bowler/frame/actualscore/keypad+Undo; mode links open requested tool; final/home actions contextual; show standings date/season. Apply coordinated responsive visualsystem.
3. Native: Tonight team matchup/result priority, score entry before setup/history, adjacentUndo/scan/voice, iPad teamrail, semantic colors/type.
4. Verify automated suites, signed simulator and web productionbuild; inspect mobile/desktop and iPhone/iPad. Release through existing Vercel/TestFlight workflow after verification.

Example integration constraints: `store.change { ... }` remains the only score mutation; web `setNight` continues revision protection. Query entry mode only controls presentation, never writes. Scores derive from `Night`/`WeekSummary`; no screenshot sample values enter production.

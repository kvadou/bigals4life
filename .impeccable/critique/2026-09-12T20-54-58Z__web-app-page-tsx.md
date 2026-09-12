---
target: BA4L web, native iPhone/iPad and app icon
total_score: 27
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 3
timestamp: 2026-09-12T20-54-58Z
slug: web-app-page-tsx
---
# BA4L design review and upgrade direction

2026-09-12. Impeccable dual-agent assessment: independent design judgment and detector/live-browser evidence. Core web home/scoring/standings inspected at desktop and390x844; native Tonight/scoring/review source and current app icon inspected. This is a design review, not exhaustive functional or accessibility certification.

## Verdict

27/40 expert heuristic score. Strong bowling-specific functionality and thoughtful recovery, but fragmented visual identity and a scoring workflow whose primary controls appear too late. The recommended direction is a bowling clubhouse with precise scorekeeping: forest green, warm ivory, restrained lime, a custom BA4L emblem, confident team typography and native platform controls.

## Heuristic scores

| Heuristic | Score /4 | Finding |
|---|---:|---|
| Status |3|Saved and pending states clear; loading can briefly show placeholder scores.|
| Real-world match |3|Bowling vocabulary strong; point components need labels.|
| Control/freedom |3|Undo and drafts exist; Undo too far from native entry.|
| Consistency |2|Web/native priorities and brand marks differ.|
| Prevention |3|Valid pin range, scan review and disabled states help.|
| Recognition |3|Bowler labels clear; result contexts compete.|
| Efficiency |2|Pin entry below useful phone viewport; mode shortcuts generic.|
| Aesthetics/minimalism |2|Good palette; too much setup/introduction before scoring.|
| Recovery |3|Account-scoped backups and conflicts are thoughtful; not exercised in this review.|
| Help |3|Useful explanations sometimes displace primary tasks.|

## Priority issues

1. P1: Pin entry is buried on phone. Navigation, introduction, sharing, setup, scan/voice and large bowler cards precede the actual action. Native ordering similarly places sync/team/ceiling/setup first and Undo after frames. Put active bowler, frame/ball, actual score, stable pin controls and Undo together. Put scan/voice beside entry; move administration into secondary controls. Sources: web/app/night/page.tsx; ios/Sources/StrikeCeilingApp.swift:115.
2. P1: Entry-mode shortcuts and completed-night actions mislead. Home Tap pins/Scan board/Say a roll link to the same night URL without mode selection. FINAL still promotes entry. Deep-link to the chosen mode with night/bowler context; completed nights lead to results/review with explicit edit and new-night paths. Source: web/app/page.tsx:59.
3. P1: Homepage standings lack season/as-of context. Live September Week1 home shows1st of6 while its linked standings report2025-26,April16,Week30. Label source season/date and distinguish current from historical standings. Generated April recap also talks about a future finale. Results should precede optional recap. Sources: web/app/page.tsx; web/app/league/page.tsx.
4. P2: Highest possible finish dominates actual score and current frame. Promote actual score, clearly explain pending bonuses and make potential a secondary figure. Separate team-only point chips from total game points so5-0 and6-3 are understandable. Sources: ios/Sources/StrikeCeilingApp.swift:232; web/app/components/match-hero.tsx.
5. P2: Identity is fragmented. Web uses CircleDot; app icon is a ball, thin ring and four-letter label; Bowling Bro has its own tile/glyph/patch. Establish one BA4L emblem and wordmark; derive app icon/favicon and endorse Bowling Bro consistently. Sources: web/app/components/topbar.tsx:19; web/app/components/bro-mark.tsx; ios/Resources/AppIcon.svg.
6. P2: Tiny secondary labels and developer vocabulary hurt clarity. Web CSS includes7-10px labels; scoring exposes Supabase. Use readable secondary type, visible focus/selection, and Saved to team/Waiting to sync language. Contrast must be measured during implementation.

## Brand and icon recommendation

A bold custom4 whose geometry suggests a bowling hook, with a simple ball cue if it survives small-size testing. The Home Screen tile should carry one dominant mark, with no BA4L caption inside because iOS already labels the app. Remove fine rings. Build the wordmark separately: BA4L as the compact primary name, Big Al’s4Life as the expanded lockup. Bowling Bro remains an endorsed coaching feature.

Use forest/ivory as the foundation and lime sparingly for active moments and important scores. Native keeps SF typography, semantic colors and native navigation; a custom wordmark supplies character. Web can use stronger club typography in headings while tables and forms prioritize clarity. Prepare app icon layers in Apple Icon Composer and inspect actual Home Screen appearances, including small sizes and supported dark/tinted treatments.

The strongest alternative is a more modern athletic identity with a geometric ball/hook emblem and sharper typography. The recommended clubhouse direction better reflects the team’s character and current color recognition.

## Experience specification

- Tonight: state-aware before/live/finished layout, personal next action, current matchup and explicitly dated league context.
- Phone scoring: bowler and frame immediately visible, actual score primary, thumb-reachable entry and Undo, scan/voice open directly, clear sync state.
- iPad: persistent team/match rail beside scoring/detail workspace; preserve resizable layouts and accessibility scaling.
- Web: richer season/record comparisons on desktop; mobile scoring gets its own deliberate composition.
- Review: lead with one invitation and useful factual insight, with game notes/lane details available through progressive disclosure.
- Completion: factual recognition of a clean tenth, improved series or decisive points when supported by data; restrained motion and meaningful haptics, respecting reduced motion.

## Strengths and personas

Keep the calm palette, tabular numbers, real league content, native navigation and durable recovery. Casey, the distracted bowler, needs input without scrolling past administration. Jordan, a first-time teammate, needs point labels and honest action destinations. Sam needs larger secondary text and actual VoiceOver/keyboard/contrast verification. Eleven numeric pin choices are appropriate for a learned keypad; do not hide them merely to reduce option count.

Emotional journey: calm arrival, friction while finding roll entry, generic completion. The redesign should make the repeated roll action effortless and make the end of the night feel personal without invented praise.

## Evidence qualification

Detector found one overused-font warning for Space Grotesk; this is subjective specificity evidence, not a defect requiring a font replacement. Swift is unsupported by this detector; an empty Swift scan is not a clean bill of health. Browser observation found no global mobile overflow; the scorecard scroll is intentionally internal. No overlay was injected because the available API lacked a permitted mutable injection route. No temporary server was started. Both agents restored viewport and closed their tabs. This was browser/screenshot review, not pw-verify.

## Questions and next deliverable

Choose clubhouse warmth or a more modern athletic personality. Scope is already established as the full web/native/brand upgrade. Next deliverable: a coordinated concept board showing app icon at real size, wordmark, phone scoring, Tonight and iPad/web composition before implementation. Carry the selected direction through a written implementation plan, then verify light/dark,Dynamic Type,VoiceOver,keyboard,screen sizes and shared-data behavior before release.

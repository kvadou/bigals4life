# Responsive BA4L refinement

Preserve BA4L's forest, lime, paper, typography, scoring, review, and account behavior. The supplied iPhone screenshots show the desktop navigation pushing the document wider than the viewport.

1. Make the shared topbar a client disclosure navigation. Keep all section links and account actions; below its natural fit show a 44px Menu control with `aria-expanded` and `aria-controls`. Navigation expands in document flow and Escape restores focus.
2. Contain intrinsic widths in grids, forms, notes, and tables. Preserve horizontally scrollable scorecards while making their scroll regions keyboard reachable. Adapt dense match summaries before their columns collide.
3. Give phone content comfortable spacing, wrapping crumbs, readable form fields, safe-area padding, and touch-sized controls. Constrain long review prose on wide displays.
4. Verify menu open/close, keyboard behavior, review forms, and document overflow at 320, 390, 430, 768, 1024, and 1440px plus landscape. Run the production build and existing tests. Use synthetic local response fixtures for authenticated UI; no real record writes.

Implementation shape: `.topbar { flex-wrap: wrap }`; `.topbar-right { min-width: 0 }`; at the content breakpoint `.topbar-right { display: none; flex-basis: 100% }` and `[data-open="true"] { display: flex }`. Native account dialog remains mounted in the disclosure.

## Verification and additional findings

- Existing suite: 58 tests passed, 59,569 assertions. Production Next build passed after the markup and viewport changes.
- Browser review found and corrected intrinsic grid overflow in season/week cards and absolute screen-reader labels escaping table scroll containers. Scroll wrappers now establish their own positioning context.
- Shared navigation preserves open account dialogs when a desktop viewport narrows. Opening an account action keeps the disclosure open; CSS also keeps a navigation ancestor with an open dialog visible.
- Independent fixture QA's initial full run passed 86/86 checks. Final run adds real font loading, empty review/account states and desktop-to-phone modal resizing. The fixture uses local fake Supabase responses and does not establish authentication-security coverage.
- Visually inspected narrow320px and wide1440px review screenshots. Notes, chips, lane fields, account navigation, and review actions fit within the content column. Final matrix artifacts are maintained by the independent responsive verification task.

Verification: 101 browser checks passed with the actual brand fonts across 320, 390, 430, 768, 1024, 1440 and 1920px plus 844x390 landscape. Covers nine routes, signed-in account navigation, empty review, 200% text, and account dialog resize/Escape. The regression harness is `web/scripts/responsive-verify.ts`, with local synthetic auth/data and no production mutations. Production-shaped review passed pw-verify and screenshot inspection. The Impeccable detector reported only the incumbent Space Grotesk font warning; retained the established brand as required for refinement. Independent review classified the patch as UI-only Tier 2, with no auth, schema or external-write logic changes.

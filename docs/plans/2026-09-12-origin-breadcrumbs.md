# Origin-aware breadcrumbs

Existing fixed hierarchies lose the actual entry point, notably Tonight to Review and Tonight to Live Lane. Keep existing hierarchy for direct links, but attach a validated local `from` origin to contextual links. A shared resolver rebuilds a bounded origin chain with readable route labels. Navigation between game tabs preserves the same parent. Breadcrumb links themselves do not append another origin.

Implement pure helpers `safeOrigin`, `withOrigin`, `contextCrumbs`; shared client `OriginLink` wraps Next Link behind Suspense. Integrate Tonight, Season/week/game, scorebook, review, Live Lane/discovery and shared game rows. No browser history, external returns, backend/auth changes or persistent tracking.

Tests cover unsafe schemes, protocol-relative/backslash/encoded URLs, allowed query keys, nested origins, loops, sibling games and fallback hierarchy. Browser fixtures verify click/Back paths from Tonight and Season, scorebook to Live Lane, invalid direct origins, and phone layout.

## Verification

[runtime-tested] 8 unit tests / 27 assertions, TypeScript clean. 28 browser click/back checks pass at 390, 768 and 1440 plus nested breadcrumb fit at 320. Tonight→Review→Tonight, Season→Week→Game1→Game2→Week→Season, Tonight→Scorebook→Live Lane→same scorebook preserve context. Invalid external origin falls back to Week. `pw-verify` review with Tonight origin renders clean; screenshot inspected. Route identity includes retained query state, so separate scorebooks and record-season filters never collapse into a single page. Fixture results/screenshots: `/tmp/ba4l-navigation-qa`. No production data or auth changes.

Root review adjustment: global Topbar section tabs remain ordinary root links. Context is attached only to contextual entries. Direct Bro index navigation preserves the normal Week fallback, without inventing a Tonight origin. Two targeted primary-navigation browser checks pass; TypeScript remains clean.

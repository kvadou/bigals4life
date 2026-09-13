# Contextual navigation

User wants logical breadcrumbs that return to the originating page. The native Tonight actions currently switch top-level tabs, losing an obvious back path. Web breadcrumbs always use fixed hierarchy, even when entry came from Tonight or another scorebook.

Native: keep direct tabs as roots. Tonight owns a NavigationStack path with Score and Review destinations; ScoreboardView can render inside an existing stack. Review captures its scorebook ID and account scope as before. Season selection is retained in its parent. A scorebook opened from Season offers a contextual Season return that reopens the selected week. Existing sheet Close/Done and pushed detail back navigation remain native.

Web: explicit validated local origin context in links, readable originating-page crumbs, deterministic hierarchy for direct links. Never send back navigation outside the app or depend on untrusted history/referrer strings.

Validation: phone/iPad Tonight to Score/Review and native Back, Season to scorebook and restored week; direct tabs remain roots. Web contextual round trips and direct links at phone/tablet/desktop sizes, nested-origin/unsafe-origin tests. Preserve account/data behavior and the separately pending authentication patch.

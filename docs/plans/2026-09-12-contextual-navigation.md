# Contextual navigation

User wants logical breadcrumbs that return to the originating page. The native Tonight actions currently switch top-level tabs, losing an obvious back path. Web breadcrumbs always use fixed hierarchy, even when entry came from Tonight or another scorebook.

Native: keep direct tabs as roots. Tonight owns a NavigationStack path with Score and Review destinations; ScoreboardView can render inside an existing stack. Review captures its scorebook ID and account scope as before. Season selection is retained in its parent. A scorebook opened from Season offers a contextual Season return that reopens the selected week. Existing sheet Close/Done and pushed detail back navigation remain native.

Web: explicit validated local origin context in links, readable originating-page crumbs, deterministic hierarchy for direct links. Never send back navigation outside the app or depend on untrusted history/referrer strings.

Validation: phone/iPad Tonight to Score/Review and native Back, Season to scorebook and restored week; direct tabs remain roots. Web contextual round trips and direct links at phone/tablet/desktop sizes, nested-origin/unsafe-origin tests. Preserve account/data behavior and the separately pending authentication patch.

## Verification

[runtime-tested] Three native round trips passed on both iPhone and iPad: Tonight to Score and back, Tonight to Review and back, Season to scorebook and back to the selected week. Final iPad rebuild verified readable gold selection on the forest home and green controls on light child screens. Screenshots inspected in `/tmp/ba4l-context-nav-ipad-shots/`. The root agent reviewed the native diff and fresh screenshots independently. All 36 native contrast pairs, 9 explicit button foreground guards, and personal profile/account selection checks passed.

Web: 88 tests passed with 61,321 assertions, production build passed, and 30 contextual/global navigation browser checks passed across phone, tablet and desktop widths. Narrow 320px nested breadcrumbs and the pw-verify Review screenshot were inspected. [prod-verified] Actual signed-in Tonight to Review to Back to Tonight succeeded on bigals4life.com after deployment. Web source `98017a8`; Vercel `dpl_7b1rq4RqwT15Rfs29iBKgVZqhB5j` READY with bigals4life.com and www aliases.

The pending waiting-page authentication patch remains separate and unpublished.

Release: native source `ed8a28e`; TestFlight 1.0 (11), build `30e56fca-7107-4044-a93f-1d4a1d9045e2`, Apple VALID and existing internal group membership verified. Archive and upload succeeded. Shared retrospective saved to `/Users/dougkvamme/dpk/raw/staging/session-2026-09-12-223743-ba4l-contextual-navigation.md`; indexing not asserted.

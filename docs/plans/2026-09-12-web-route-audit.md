# Web route audit and polish

Read-only audit completed before edits. The 55 authenticated route/viewport cases cover home, season, week, game, scorebook, standings, records, bowler records, review, Live Lane and login redirect at 320, 390, 768, 1440 and 844 landscape. Eight signed-out login mode cases also fit. Screenshots inspected across phone/tablet/desktop. Static Impeccable scan returned no findings.

Four P2 visual issues, no P0/P1 visual defects: legacy sign-in brand wording/icon, waiting icon, two shared avatar text colors below 4.5:1, browser-blue secondary anchor actions. Decorative breadcrumb separators excluded from text contrast failures. Scope: visual markup/styles only; auth behavior unchanged.

Implementation: use existing `<BrandMark size={36}/>` in login/waiting headers, correct login accessible label/footer, set `.secondary{color:var(--ink);text-decoration:none}`, darken avatar initials while keeping incumbent background colors. Verify changed route screenshots, nonmember waiting, password mode, account modal, shared league actions and contrast. No deployment in this subtask.

## Verification

[runtime-tested] Baseline 63/63 cases passed. Targeted post-fix 21/21 cases passed across 320/390/768/1440/844 landscape; password mode and account Escape checked. pw-verify login and league rendered clean with screenshots inspected. Runtime leaf-text contrast scan has no failures on league/records after avatar corrections. Fixtures and outputs: `/tmp/ba4l-allpage-audit`, `/tmp/ba4l-polish-verify`.

Separate P1 found during nonmember coverage: confirmed nonmember waiting redirect loop. Root owns separate auth fix and tests. Waiting page visual checks used signed-out rendering and must not be described as verified nonmember authentication.

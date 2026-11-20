# Fix pack items from a pretest

Read this in phase 3, when all flows are done.

## Kind per item

- **Fix:** the cause is clear from the test (reproduced repeatedly, clear error text or clear deviation).
- **Analysis** ("Change nothing, investigate only. Prove the cause. Propose a fix with acceptance."): the finding occurred once, the symptom has several possible causes, or permissions/security are involved. The fix follows in the next pack.
- **Design deviations** of one page or modal: one item.
- **Same suspected cause:** one item, or cross-reference the items.
- **Product decisions** (no clear expected behavior, e.g. "omit the row or show the total?", conflict between requirement and intended behavior): not in the pack. Ask the human **one** bundled question after the flows, with a recommendation. The pack goes out after the answer and includes the decided items. Unattended run with no answer: send the pack without these items and put the questions in the result (outcome intervention only if nothing else is left to fix).
- **Security findings:** never confirmed live; still an item, usually analysis.

## Item format

```
## F<n> Fix: <one-sentence title>      (or "Analysis: ...")
Problem: <actual behavior, page/URL, role, error text verbatim, API path and status code>
Expected: <expected behavior; for design: the board name>
Notes: <test tenant, repro steps>
Acceptance: <how the Agent knows it is fixed; an automated test that fails before and passes after>
```

Pack header: `Fix pack: <YYYY-MM-DD>-pretest-<unit or round>`, line `Source:` with the result file, then the closing sentence defined by `foreman-fix`.

Text rules: say WHAT, not HOW. No invented function or library names. Say "the Agent". Every fix carries an automated test that would have caught it. Record pack id, item numbers and session id in the result.

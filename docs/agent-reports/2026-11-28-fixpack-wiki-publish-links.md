# Fix pack 2026-11-28-wiki-publish-links

Result: 5 of 5 points done, 0 analyses, 0 blocked. Review: needs-attention in round 1 (one medium), reworked in 1a4dddc; two low findings open.

| # | Title | Cause | Commit | Test |
|---|---|---|---|---|
| F1 | Notion wiki (database) as root | `createPage` knew only page parents; database root answers 404 | b9b3772 | cli --wiki publish: database root ... |
| F2 | Links between wiki pages | converter kept only http(s)/mailto links | see git log | 20 new tests, red on old lib |
| F3 | Link to audience overview (`./`, `../<slug>/`) | overview has no source file | see git log | 7 new tests, red on old lib |
| F4 | A failed run no longer archives file-less pages | archive ran after failed creates | see git log, 1a4dddc | failed-create test, moved-page test |
| F5 | Skill, MODULES.md, CHANGELOG | - | see git log | test-changelog.sh |

Roles: execution_simple for F1 and R1, execution for F2 and F3/F4, validation for the review. First F2 attempt was cut by a session time limit and rerun from a clean tree.

Open, low: (B) a code span containing `]` inside a link label is not a link in Notion; (C) a failed pass-2 update leaves an empty page, next run may add a copy (same pattern as the existing updatePage).

For the human: a real run against a Notion wiki root (read-back of rows via block children is only proven by the fake); see UAT list.

## Learned

- A background wrapper call dies at its foreground timeout when started with a short timeout; start long worker runs with a long background timeout.
- Tests that compare new Notion link forms need the `/<id>` read-back form in the fake, otherwise reruns look unchanged by accident.

# Pretest result format

Read this in phase 4 and for a re-test. One file per unit and round.

```markdown
# Pretest result: <unit>, round <N>

**Date:** ... · **Tested by:** Claude (browser) · **Environment:** <staging-url>, <test-tenant>; production tenants not touched
**Tested build:** commit <sha> (verified via <deploy check>) · **Login:** <how>

## Outcome
<exactly one of the three blocks below>

## Function results
| Flow | Result | Evidence |
|---|---|---|
| A: <name> | pass / fail / partial | <API path, status, key statement; screenshot name> |

Per flow: what was checked, what passed, findings with repro.
**API evidence:** <path, status code, key statement>
**Design comparison:** <per page/modal: matches / deviations / no board>

## Role review
<the full report in the structure of foreman-role-review (header, summary, findings table, one section per role with verdict, findings with evidence and proposal, "checked and passed"). A summary never replaces it.>

## Findings table
| # | Finding | Severity | Pack item |
|---|---|---|---|
| 1 | ... | High | F1 Fix |

## Open items for UAT
<only what needs a human: second real account, real device, product decision; each with the reason and concrete steps>
```

## The three outcomes

**Fix round.** Fix pack id, session id, number of items (fix / analysis), and the complete pack text below it. Rough wait: 10 to 15 minutes per item.

**uat-ready.** Nothing left to fix. Contains a UAT checklist with **only** what needs a human, each item with the reason (second real account, real hardware, product decision) and the steps. Everything an agent can test itself must already be tested and listed under Function results. Never put a browser-testable item on the checklist.

**needs-input.** Exactly one question, with a recommendation and what depends on the answer. Use it when a decision blocks both the pack and UAT, or when the environment is unusable.

Nothing found: still write the result, short, with a clear go and outcome uat-ready.

## Re-test

1. Check the deployed commit contains the fix commits. Else do not test; report "merged is not deployed".
2. Per finding: provoke the original error again, observe the new behavior, and add at least one valid normal case so the fix broke nothing else.
3. Compare the affected pages with the boards again.
4. Append `## Update after fix and release (<date>, commit <sha>)` to the result; add a "Re-test" column to the table.
5. Still red: all follow-up items go into **one** new fix pack (analysis item after repeated failure). Do not change code.
6. After a deploy the browser session is often gone: a login screen is not a bug.

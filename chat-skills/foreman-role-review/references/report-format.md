# Role review report

Every report has this full structure, whatever the source (human call, briefing mode, pretest). A role without findings still gets its section. A summary never replaces it.

```markdown
# Role review: <project / unit>

**Date:** ... · **Reviewed by:** Claude (5 roles, browser) · **Accessibility:** <WCAG version and level from requirements.md | not required> · **Environment:** <staging-url>, <test-tenant>; production tenants not touched
**Reviewed build:** commit <sha> (verified via <deploy check>) · **Login:** <how> · **Scope:** <asked / uat-ready units / VALIDATION.md>

## Summary
<2 to 4 sentences: overall impression per role, biggest risks, recommendation>

**Fix pack status:** NOT SENT, waiting for approval · <n> candidate items

| # | Role | Finding | Severity | Proposed kind |
|---|---|---|---|---|
| F1 | UX | ... | Medium | Fix |
| F2 | UI | ... | Design | Fix |
| F3 | Bug | ... | High | Fix |
| F4 | Security | ... | High | Analysis |
| F5 | A11y | ... | Medium | Fix |

## Role 1: UX critic
**Verdict:** <one or two sentences>
**Findings:** <each with page or URL, evidence, proposal>
**Checked and passed:** <what was examined and held up>

## Role 2: UI defect hunter
<per page/modal: matches / deviations / no board; same three parts>

## Role 3: Bug hunter
<bugs with repro, API evidence: path, status code; same three parts>

## Role 4: Penetration tester
<findings as risk plus evidence, no executed attack; same three parts>

## Role 5: Accessibility auditor
<per screen: violations with WCAG criterion and level, method, measured values, owner; automated scan result; same three parts>

## Product decisions (need the human's answer)
<bundled questions with a recommendation>

## Open items for UAT
<not simulable, with reason and concrete steps for the human>
```

Nothing found: still the full report; each role gets a verdict and what was checked; clear go.

Inside the pretest, this report is the part "Role review" of the pretest result, between the function results and the outcome block, with no separate approval row.

## Where the report lives

The report file is the record (`docs/role-reviews/<unit-or-date>.md`, or the part "Role review" of a pretest result). A tracker is a mirror of `STATE.md` and does not hold reports; link the file in a ticket comment only when the human asks. A standalone report waits for approval before any pack goes out; the pack status line at the top says `NOT SENT` until then.

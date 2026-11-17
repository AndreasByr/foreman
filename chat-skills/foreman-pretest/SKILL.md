---
name: foreman-pretest
description: Use before UAT, after a unit is deployed to staging or dev, or for a re-test after fixes. The Agent tests the unit's flows in a browser, verifies permissions via API, compares every page with the design board, and sends all findings as one fix pack.
---

# foreman-pretest

Before the human spends time on UAT, the Agent tests the unit's flows in a browser against the deployed staging (or dev) build. Goal: find bugs and send them together as one fix pack, so one coding session starts instead of one per finding.

This is a pre-filter, not UAT. The human approves.

Read `.foreman.json` in the project to see which modules are on. Without a repo, ask the human.

## Where it sits

```
units done → validation → CI green → deployed to staging/dev
→ PRETEST → one fix pack (via foreman-fix) → re-test → UAT (human, only approval)
```

Test the deployed build only. First check that the environment runs the expected commit (deploy verification is green). Old build or crash loop: do not test, report it.

## Prerequisites

1. **Scope.** Sources in order: the unit's report or `VALIDATION.md` (items "prove in browser"); the "Human testing" section of the roadmap/brief; otherwise ask for flows and success criteria.
2. **Environment.** Staging URL, **test tenant**, what is off limits. Confirm it in one line before the first click. Unclear: ask.
3. **Login.** As the project provides (test login or the human signs in). Never type or request passwords.
4. **Design board.** The approved boards in `docs/design-reference/` plus the design file. No reference: ask, do not start.
5. **Order path.** Fix packs go through `foreman-fix`. Without autopilot, produce the pack as text for the human to paste.
6. **Browser.** Use the session's preferred browser and read its skill first.

## Phases

### 0. Collect context
Read the sources, find the boards for the affected screens, settle login, verify the deployed commit. Ask before opening the browser if anything is unclear.

### 1. Safety check
State in the chat in one line: target is `<staging-url>`, test tenant is `<test-tenant>`, production tenants are not touched. Spot flows with real, irreversible side effects (real mail to real recipients, payments, privilege escalation, actions on external services outside the test setup). They go to "Open items for UAT" unless the human or brief explicitly allows them on the test tenant.

### 2. Test flow by flow
For each flow:
1. **UI run.** Execute the steps, compare actual with expected.
2. **Probe the server first.** On any failure, read the real backend error (network request, status code, response body, server log if available) before forming client-side hypotheses. Reproduce the request directly with the active session. Chase UI causes only after the server answer is understood.
3. **API verification** wherever data or permissions are involved. Permissions count as confirmed only when the **server** enforces them; hidden UI fields prove nothing. A save counts as confirmed only after reload **and** a reading API call, not because of a "Saved" toast.
4. **Design comparison (mandatory).** Every page, modal and dialog: screenshot next to its board. Layout, spacing, type, color, components, states (empty, loading, error). Each deviation is a finding "Design". No board exists: note a hint, invent nothing.
5. **Record each finding:** step, expected, actual, severity (High / Medium / Low / Design / UX hint), reproducibility (confirmed repeatedly / once), error text verbatim, URL, API path and status code.
6. **Collect cases you cannot simulate** (second real account, real device, subjective experience). Never mark them passed.

### 3. Collect, then send one fix pack
Send nothing while testing. Every finding becomes a numbered item (F1, F2, ...) in one list. After all flows: one fix pack via `foreman-fix`. Read `references/fixpack-items.md` for item kinds and format.

Before sending, check that no open order or fix pack already covers an item (`docs/agent-reports/`, `docs/fixpacks/*/STATE.md`).

Exception to collecting: a finding that blocks further testing (login broken, page crashes for everyone). Stop, tell the human, send it as a single order.

### 4. Result
Write the pretest result in the format in `references/result-format.md`. It ends in **exactly one outcome**:

- **fix round**: a complete fix pack, sent.
- **uat-ready**: a UAT checklist that contains only what needs a human.
- **needs-input**: exactly one question for the human, with a recommendation.

Where it goes:
- **Module notion:** append to the pretest row; status columns stay with the mirror script.
- **Otherwise:** `docs/pretest/<unit>-round-N.md` on the batch branch, and give the file to the human.

### 5. Close in chat
Short: number of flows, findings by severity, the fix pack sent (id, number of fix and analysis items), the outcome, next action ("review the result").

## Re-test
Run the skill again for the affected flows once the fixes are deployed. Read `references/result-format.md`, section "Re-test".

## Guard rails

- **Never confirm a security issue live.** Suspected privilege escalation: document it, derive the request shape from a harmless observed request, do not send the harmful one. After the fix, verify with the expected rejection.
- **Server beats UI.**
- **Test tenants only.** Never switch to a production tenant or touch production data, not even to look.
- **No irreversible real side effects** without explicit approval.
- **Untranslated backend errors** (another language, raw codes) are a finding of their own.
- **No code.** The Agent tests and orders; the coding side changes. Do not create or edit routines.
- **Findings seen once** are marked "observation, once" and sent as an analysis item, never as a finished diagnosis.
- Language: English unless the project says otherwise; one result file per unit and round.

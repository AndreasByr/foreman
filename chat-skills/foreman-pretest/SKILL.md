---
name: foreman-pretest
description: Manual browser pretest from chat: test a deployed unit's flows, verify permissions via API, compare pages with the design board, send findings as one fix pack. Use when no cloud pretest runs, for a second look, or when the human asks for a browser test.
---

# foreman-pretest

The Agent tests a unit's flows in a browser against the deployed staging (or dev) build, finds bugs and sends them together as one fix pack, so one coding session starts instead of one per finding.

This is a pre-filter, not UAT. The human approves.

Answer in the language the human writes in. Read `.foreman.json` (`modules`, `context` with `stagingUrl`, `devUrl`, `testTenant`, `offLimits`). Without a repo or file, ask once.

## Cloud pretest versus this skill

With module `pretest` the work run tests every unit itself in the cloud after the deploy (Playwright headless, test login, screenshots on desktop and mobile against the approved board, axe-core, the five roles of `foreman-role-review`, a text check). It writes `docs/pretest/<unit>-round-N.md` ending in `Verdict: fix-round | uat-ready | intervention`. Read `references/cloud-pretest.md` to interpret such a result.

This chat skill stays for a manual browser test: projects without the module, a second opinion, a flow the cloud run cannot reach, or when the human asks.

**Before you send anything,** check whether a cloud pretest exists or is due for the unit: status `pretest-waiting` or `pretest-running` in the unit's `STATE.md`, or a `docs/pretest/<unit>-round-N.md`. If so, do not send a fix pack. Report your findings to the human as a list and let the cloud run's result decide, unless the human explicitly asks you to send the pack. A manual result is named `docs/pretest/<unit>-manual-<date>.md` and never carries a `Verdict:` line, so the dispatcher cannot mistake it for a cloud verdict.

## Where it sits

```
units done → validation → CI green → deployed to staging/dev
→ PRETEST (cloud, in the work run; or manual here) → one fix pack → re-test → UAT (human, only approval)
```

Test the deployed build only. First check that the environment runs the expected commit (deploy verification is green). Old build or crash loop: do not test, report it.

## Prerequisites

1. **Scope.** Sources in order: the unit's report or `VALIDATION.md` (items "prove in browser"); the "Human testing" section of the roadmap/brief; otherwise ask for flows and success criteria.
2. **Environment.** Staging URL, **test tenant**, what is off limits. Confirm it in one line before the first click. Unclear: ask.
3. **Login.** As the project provides: the project's test login (own switch, non-production host only, never an admin) or the human signs in. Never type or request passwords.
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

- **fix round**: a complete fix pack, sent (or held, see the check above).
- **uat-ready**: a UAT checklist that contains only what needs a human. With a tracker the checklist goes into the unit's ticket; with tracker `none` into `docs/uat/<unit>.md`.
- **intervention**: exactly one question for the human. The question needs the explanation comment: one sentence, options A/B/C with consequences, a recommendation, a link to the report, and the way to answer (`Answer <unit>: ...`). Without that comment the step is not complete.

Where it goes: `docs/pretest/<unit>-manual-<date>.md` on the unit's batch branch, and give the file to the human. The tracker is written by the mirror script only.

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
- **No code.** The Agent tests and orders; the coding side changes. Do not create or edit routines or the dispatcher.
- **Bot and third-party effects** (for example a bot or mail service): prove them with read-only API checks or the project's test interaction endpoint. Never automate a real user account.
- **Findings seen once** are marked "observation, once" and sent as an analysis item, never as a finished diagnosis.
- Language: the project's document language for files, the human's language in chat; one result file per unit and round.

---
name: foreman-role-review
description: Use for a critical review of a running app in five roles (UX critic, UI defect hunter, bug hunter, penetration tester, accessibility auditor), as a briefing before a milestone brief, or inside the pretest. Report first, fix pack only after approval.
---

# foreman-role-review

`foreman-pretest` checks whether the functions work. This skill checks whether the app is good, clean, correct, accessible and secure, from five independent viewpoints. The Agent takes on five roles one after another, rates the app by fixed criteria, collects all findings and writes a report first. A fix pack goes out only after the human's explicit approval.

Read `.foreman.json` for the active modules.

## Modes

- **Inside the pretest:** `foreman-pretest` uses its phases 0 to 2 (context, safety check, flow run) and applies the five roles to each tested screen. Findings go straight into the pretest result, in the full report structure, as the part "Role review". No separate approval step; the pretest outcome carries it.
- **Added on request:** the human wants the role review next to the flow tests. Share context, safety check and flow run with the pretest; findings share one list.
- **Alone:** pure role review without a full flow run. Run prerequisites and the role phases.
- **Briefing mode:** called by `foreman-brief` before a milestone brief is written. Read `references/briefing-mode.md`.

Shared duties in all modes: staging or dev, test tenants only, design board as reference, API verification for data and permissions, the session's browser with its skill read first.

## The hard difference: approval gate

Alone and on request, the order is always:

```
role phases → collect findings → write the report, give it to the human
→ WAIT for explicit approval → only then one fix pack via foreman-fix
```

Without a clear "yes, send the pack" (or approval of single items), nothing goes to the coding side. An unattended run with no answer leaves the report and the waiting pack. The roles roast hard; the human decides what becomes a fix. (Called from the pretest, the pretest's own rule applies and findings are in its result.)

## Prerequisites

1. **Test environment: always ask, never assume.** Staging URL, test tenant, what is off limits. The human confirms or corrects before the first click. Unclear or unconfirmed: do not start.
2. **Scope, in order:** units in `uat-ready` per tracker if the project has one (modules linear/notion); the unit's report or `VALIDATION.md` ("prove in browser" items); the "Human testing" section of the roadmap; otherwise ask.
3. **Login** as the project provides. Never type or request passwords.
4. **Design board and design file.** Without a reference, run the UI role in a limited way and say so in the report.
5. **Deployed build.** Verify the expected commit runs. Old build or crash loop: do not rate, report it.
6. **Accessibility target.** Read `requirements.md` (non-functional, "Accessibility"). Required: role 5 checks strictly against that version and level. Not required or missing: role 5 still runs; findings are "a11y hints". Only "WCAG" without level: check against WCAG 2.2 AA and say so.
7. **Order path.** `foreman-fix`. Without autopilot, the pack is text for the human to paste.

## Principle: independent of the plan

Each role rates the app as a stranger expert seeing it for the first time, **without** the roadmap or the milestone's intent as an excuse. "Planned that way" is no counter-argument. Each role asks "is it good / correct / clean / secure". A finding that contradicts intended behavior becomes a product decision for the human, never a silent drop.

One pass per role. Hold the mindset, finish the role, then switch. Do not mix; the separation is why different classes of defects turn up.

If a writing-quality skill is available, check every visible text with it as well. If skills for layout, typography, color, UI polish or accessibility are installed, each role draws its rules from them. On conflict the project's basic design rules and design file win.

## Roles

Read the reference for a role when you start that role.

| # | Role | Mindset | Reference |
|---|---|---|---|
| 1 | UX critic | can a person reach the goal without explanation | `references/role-1-ux.md` |
| 2 | UI defect hunter | pixel-exact against the board | `references/role-2-ui.md` |
| 3 | Bug hunter | how do I break this | `references/role-3-bugs.md` |
| 4 | Penetration tester (own app, defensive) | prove, do not exploit | `references/role-4-pentest.md` |
| 5 | Accessibility auditor (WCAG 2.2 AA default) | can everyone finish every task | `references/role-5-a11y.md` |

## Phase 3: collect, report, approval

Send nothing while the roles run. Every finding is a numbered item (F1, F2, ...) with role, severity (High / Medium / Low / Design / UX hint / A11y hint) and reproducibility.

Kind per item:
- **Fix:** cause clear from the test.
- **Analysis:** seen once, several possible causes, or permissions/security involved.
- **Design deviations** of one page or modal: one item.
- **Product decisions** (no clear expected behavior, conflict with intended behavior): not in the pack; one bundled question to the human with a recommendation.
- **Security findings:** escalate to `needs-input` after the first failed rework.

Before sending, check no open order already covers an item (`docs/agent-reports/`, `docs/fixpacks/*/STATE.md`).

Exception: a finding that blocks further testing, or a critical bug in production: stop, tell the human at once. This single order also needs the human's consent unless the project explicitly allows immediate escalation.

## Report

Write `docs/role-reviews/<unit-or-date>.md` (or the pretest result part) and give it to the human. **Every report has the full structure**, whatever the source: header, summary, findings table, and one section per role with verdict, findings (page or URL, evidence, proposal) and "checked and passed". A role without findings still gets its section. A summary never replaces the report. Read `references/report-format.md` for the template and for the module notion row.

## After approval: one fix pack

Only approved items go, as **one** fix pack via `foreman-fix`. Item format and header as in `foreman-pretest` (`references/fixpack-items.md` there); header `Fix pack: <YYYY-MM-DD>-role-review-<unit or round>`, `Source:` the report. WHAT not HOW, every fix with an automated test that fails before and passes after. Record pack id and item numbers in the report. Without autopilot: give the pack as text.

Accessibility findings carry **Owner:** design (board or token), development (fix pack) or content (text in the CMS such as alt text, link text, headings, PDFs). Content findings do not go to the coding side; give them to the human as their own list.

## Re-test
Run again for the affected items once fixes are deployed. 1) Verify the deployed commit contains the fix commits ("merged is not deployed"). 2) Provoke each original defect again (security: expect rejection) plus a happy path. 3) Re-compare pages with the board; re-check a11y items with the same method (keyboard, accessibility tree, measured contrast). 4) Append `## Update after fix and release (<date>, commit <sha>)` with a "Re-test" column. 5) Still red: a new pack only after new approval; repeated failure becomes an analysis item. Do not change code.

## Guard rails

- Ask for the test environment; never assume.
- Approval before any dispatch.
- No code. The Agent rates and orders; the coding side changes. No routine changes.
- Server beats UI. Hidden fields prove nothing.
- Never exploit security issues live. Prove, document, hand over.
- Test tenants of your own app only; never production, not even to look.
- No irreversible real side effects without explicit approval.
- Findings seen once: "observation, once", analysis item.
- The accessibility role always runs; the requirement decides how strict.

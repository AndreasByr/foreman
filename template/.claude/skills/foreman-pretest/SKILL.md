---
name: foreman-pretest
description: Browser pretest inside the work run (task kind pretest-run) or by hand. Runs headless against dev or staging with a test login, screenshots against the approved boards, axe, rights by API, role review with five roles, and writes docs/pretest/<unit>-round-N.md ending with a Verdict line. Not for production.
---

# Pretest (in the work run)

The work run tests the unit itself; there is no second session. Load it with `foreman-dispatch-run` for the task kind `pretest-run`, or use it by hand on a unit in `pretest-waiting`. Settings (targets, login pattern, tenants) live in `.foreman.json` under `pretest`; the pattern is described in `docs/test-login.md`.

## Start

1. Lock the unit, set `Status: pretest-running · since <UTC> · round N`, commit, push, mirror.
2. Install what the runner needs in this worktree: `bash scripts/pretest-prepare.sh` (a fresh cloud worktree has no `node_modules`; without it the runner fails with `ERR_MODULE_NOT_FOUND`). Fails: verdict `intervention` with the concrete error.
3. Is the unit deployed? The last deploy check of the target is green and contains the unit's commits (`git merge-base --is-ancestor`). Merged is not deployed. Otherwise do not test: `intervention` ("merged but not deployed").
4. Server first: `GET /health` (or the project's equivalent) on the target. On 5xx read the real backend error before suspecting the client.
5. Test login works for each needed role (`docs/test-login.md`). At most two failed attempts per target (the login is rate limited). A broken login for a role that the core flow needs: finding, and `intervention` when the flow cannot be tested.

## Safety (mandatory)

- Only `dev` or `staging` targets from `pretest.targets`. Never production. The runner refuses hosts in `pretest.productionHosts`.
- Only tenants from `pretest.tenants`. Never one matching `pretest.blocked`, even when a test account has rights there.
- Name variables, never print their values. In documents accounts appear as roles ("owner", "member"), never as IDs.
- Rights checks that write do so only with an expected refusal and a harmless body. Never send a harmful request to confirm a hole.
- Remove test data the run created, through the app's own function, not directly in the database.

## Run

1. **Runner.** Write a plan (copy `scripts/pretest/plan-example.json`: pages per role, API checks with the expected status) to a scratch path and run `node scripts/pretest-run.mjs --plan <plan.json> --out docs/pretest/<unit>-round-<N>`. It logs in per role, loads every page at desktop (1280) and mobile (390) width, stores screenshots under `shots/`, runs axe (WCAG 2.2 AA) and collects console errors, failed responses, overflow and API status (GET only). Put the `summary` table of `result.json` into the document.
2. **Look at the screenshots yourself.** Put each page and dialog next to its approved board (`docs/design-reference/`), desktop and mobile. A different structure, missing or extra elements are findings.
3. **Interactions** (click, keyboard, dialogs, expand and collapse, save then reload plus a reading API call) with your own Playwright script in a scratch folder. It never goes into the repo and never prints variable values.
4. **Rights by API:** every role-dependent action as each role and without login; tenant swap (an ID of tenant A asked under tenant B, expected 403 or 404). A hidden button proves no rights check.
5. **Effects in other systems** (a bot, a mail, a webhook): trigger through the app or a test-interaction endpoint built on the test-login pattern, then prove it with a read-only API check script of the project. Never automate a real user account. What only a real client can show (look of a message, a real click) becomes a UAT point.
6. **Text:** check wording (filler, descriptive sentences under headings, mixed languages).

## Role review (mandatory, five roles in full)

One after another, each with its own section: overall verdict, findings (page or URL, evidence, suggestion) and "checked and passed". Criteria as in `foreman-role-review`:

1. **UX critic**: orientation, friction, feedback, wording, consistency.
2. **UI defect hunter**: match with the board, typography, color, states, responsive.
3. **Bug hunter**: input edges, double click, reload, persistence with a reading API call, error paths.
4. **Penetration tester** (defensive): authorization on the server, tenant separation, input handling, session. Prove, never exploit.
5. **Accessibility auditor**: WCAG 2.2 AA keyboard, names and structure, contrast, zoom 200% and 320 px, target size, `lang`; axe as a supplement.

Findings about the unit go into the fix pack or decide the verdict. Findings unrelated to the unit go into "Further findings (need approval)" and become a pack only after the human approves.

## Document `docs/pretest/<unit>-round-<N>.md`

On the unit's batch branch; screenshots in `docs/pretest/<unit>-round-<N>/shots/`. Fixed layout:

1. Header: unit, round, target URL, tested commit, date (UTC), accounts as roles only.
2. Summary (2 to 4 sentences).
3. Function per flow: expected, actual, evidence, screenshot path.
4. Rights table (call, role, expected, received).
5. axe summary (the runner's table) and evidence of effects in other systems.
6. Role review, complete.
7. By verdict: **fix-round**: the complete fix pack in the format of `foreman-fixpack` (header with target and batch branch, points F1 ... with problem, expected, board, acceptance); **uat-ready**: the UAT checklist, only points that need a second real account or a product decision, each with its reason; **intervention**: the question with options A/B/C, their consequences and a recommendation.
8. Last line, exactly one of: `Verdict: fix-round`, `Verdict: uat-ready`, `Verdict: intervention`.

Verdict rules: a High or Medium finding about the unit: `fix-round`. Only Low or none: `uat-ready`. Not testable (deploy missing, login for a needed role broken, variable missing): `intervention`. At most 3 re-tests per unit, then `intervention`.

## Finish

Commit and push the document and screenshots to the batch branch, then take the result over in the same run (`foreman-dispatch-run`, `references/payload.md`, "Take over a pretest result"):

- `uat-ready`: create the UAT list with `node scripts/uat-checklist.mjs --unit <unit> --since <since of the new uat-ready status> --ticket <ticket> --from docs/pretest/<unit>-round-<N>.md` (tracker none: it writes `docs/uat/<unit>.md`; commit and push it).
- `intervention`: follow `references/intervention.md`: the question into STATE.md, status `needs-input`, mirror (writes the explanation comment).
- Comment in the ticket with the link to the document, mirror, release the lock.

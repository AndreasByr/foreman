---
name: foreman-fixpack
description: Flow for fix packs. An order headed "Fix pack:" bundles several fixes and analyses (for example all findings of a browser pretest). Load for "fix pack", "continue fix pack ..." or any order with numbered points F1, F2. Adds to foreman-delegation and foreman-batch.
---

# Fix pack

Adds to `CLAUDE.md`, `foreman-delegation` (workers code, session accepts) and `foreman-batch` (batch branch, worktree, push). This skill does not repeat their rules.

A fix pack bundles several fixes and analyses into **one** order and **one** session. It runs like a milestone but is none: no brief, no roadmap change, no slices, no `docs/milestones/`. Every fix, even a single one, is a fix pack.

## Input

The order carries the header from `foreman-batch` plus a pack line:

```
Target: dev | main
Milestone: Mnnn | -
Batch-branch: batch/dev | batch/main | batch/mnnn
Urgent: no
Fix-pack: <YYYY-MM-DD>-<slug>
```

Points follow, numbered `F1`, `F2`, ... Each is `Fix:` or `Analysis:` with problem, expected result, hints, `Board:` (name and "approved on <date>" or "no interface") and acceptance. Missing header, unclear target, or `Urgent: yes`: do not implement; report (urgent work never goes into a pack).

## Flow: the whole pack in one session

1. **Worktree:** `node scripts/batch-branch.mjs <main|dev|Mnnn>`; work only there.
2. **Store the order:** the order text unchanged to `docs/fixpacks/<id>/ORDER.md`. If `docs/fixpacks/<id>/STATE.md` exists (continuation), go to step 4 with the first open point.
3. **Plan and create `STATE.md`** from `docs/fixpacks/_TEMPLATE/STATE.md`:
   - Read `docs/learnings.md` first.
   - Table per point: `#`, type (fix/analysis), title, status (open / in progress / done / blocked), check (test file or command), red → green (SHA), commit.
   - Board check (planning): every point has a `Board:` line. A point with a new or changed interface needs an approved board file under `docs/design-reference/` on the batch branch; without it the point is `blocked` and the unit `needs-input`, the question names the element without a board. The others go on. The Agent creates no boards. `Board: no interface` is for pure text, spacing and bug corrections.
   - **Order:** analyses first. Points sharing a cause or files go one after another. Same cause: one commit naming both numbers, noted in `STATE.md`.
   - Record the start commit of the batch branch in `STATE.md`.
   - Commit `Fix pack <id>: plan`, push.
4. **Per point, in planned order:**
   - **Fix:** status "in progress". First an automatic test that shows the defect, then the implementation per `foreman-delegation`. Red-then-green per `foreman-delegation`; both runs with SHA in `STATE.md`. Accept against the point's acceptance field: read the diff, test green, affected tests and typecheck green. **UI:** rendered output per `foreman-delegation`, acceptance item 4. One commit `Fix pack <id> F<n>: <title>`, `git pull --no-rebase` then push, status "done" with SHA.
   - **Analysis:** change nothing. Prove the cause (repro, log, test or code path with line) and write a concrete fix proposal with acceptance. The fix follows in a later order unless the point says "fix directly if the cause is clear".
   - **Blocked** (missing prerequisite, unclear expected result, contradiction with requirements, verification fails after all worker steps): status "blocked" with reason; **continue with the next point**. A blocked point does not stop the pack.
   - **Test it yourself:** Hand nothing on, see `foreman-delegation`. A needed test is built in this pack, else the point is `blocked` (`needs-input`) with the concrete question.
   - Red that existed before the pack: prove with a run on the start commit, report as "Inherited red". Flaky tests: `docs/flaky-tests.md`.
   - `STATE.md` is current after every point (status, branch, PR, next step); push it.
5. **Independent review at the end:** one wrapper call with role `validation`. The task holds `ORDER.md`, `git diff <start-commit>..HEAD` and `STATE.md`. Questions: is every point met per acceptance? Was anything broken, especially permissions and tenant isolation? For UI: does the rendered output match the board? Does every fix have a test that was red before and green after? Verdict `pass` / `needs-attention` / `needs-remediation` per point, findings with severity.
   **The review blocks completion** (Review gate: `foreman-delegation`). Rework as its own commit (`Fix pack <id> F<n> R1: ...`), review again with the new diff. Still open: point `blocked`, the pack ends `needs-input` (question: the open finding).
6. **Final run** on the final commit of the batch branch: full unit tests, typecheck, lint and the production build. The build is mandatory because the other checks miss bundling errors. Evidence rule: `foreman-delegation`.
7. **One report** at `docs/agent-reports/<YYYY-MM-DD>-fixpack-<slug>.md`:
   - Summary: x of n done, y analyses, z blocked, review verdict.
   - Table per point: number, title, type, result, cause (one sentence), commit, test.
   - Analyses: cause with evidence and a fix proposal written as the next pack point.
   - Blocked points with reason and the question the human must answer.
   - Final-run evidence and batch branch state (commits ahead of the target).
   - What only the browser or only the human can prove (re-test list for the next pretest), each with its reason. Pretest gets only what a local browser run cannot prove; the human gets only points needing a real second account or a product decision.
   - "Learned" (or "nothing new").
   `STATE.md` is current (State gate: `foreman-delegation`). Commit and push.
8. Set the next status per `STATE.md` rules: `awaiting-merge` (all passed), `needs-input` (blocked or review open). Every `needs-input` writes the `**Cause:** <category> · <one sentence>` line (categories: STATE.md template; rule: `foreman-dispatch-run/references/intervention.md`).

## Out of context or time

Keep `STATE.md` current, write the report as **interim state** (done, open, next point) and push. A new order "Continue fix pack <id>" with the same header resumes at step 2 and reads `STATE.md`.

## Excluded

PR, merge, deploy, browser verification against dev/staging (that is the pretest), changes to roadmap or briefs, access to production tenants. The batch PR is created only on order (`foreman-batch`). A merge on the human's go ends with the After-merge step (`foreman-delegation`).

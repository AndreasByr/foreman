---
name: foreman-milestone
description: Flow for milestone orders ("Run milestone M004", any milestone, slice or milestone brief). Splits the milestone into slices and does exactly one slice per call. Load whenever a milestone or slice is mentioned. Adds to foreman-delegation.
---

# Milestone flow

Adds to `CLAUDE.md` and `foreman-delegation`. Delegation rules (workers code, session accepts, run `verify` first, no push to `main`/`prod`, no deploy) apply in full; this skill does not repeat them.

## Input

Order "Run milestone M004". Read without changing: `docs/milestones/M004/CONTEXT.md` (the brief), `docs/requirements.md`, `docs/roadmap.md`, `docs/design.md`. The brief names the conflict order between documents. Report contradictions and gaps; do not resolve them yourself.

## One slice per call

1. **No `STATE.md` yet:** split the milestone into slices and create `docs/milestones/M004/STATE.md` from `docs/milestones/_TEMPLATE/STATE.md`. Then stop: the split is all this call does.
   - Read `docs/learnings.md` first and plan around matching entries.
   - A slice is one demonstrable capability with 1 to 7 tasks; each task fits one context window.
   - **Check plan per slice** in `STATE.md`: success criterion (a testable sentence), check (test file or command), kind (automatic / browser / human only), design board.
   - **Four mandatory questions per slice**, answered in `STATE.md` ("not applicable, because ..." is allowed, blank is not):
     1. Permissions and tenant isolation: who may do this? Which test proves another tenant or a lower role may not (server side, not only UI)?
     2. Negative tests: invalid input, empty states, repeated actions.
     3. Failure cases: external API down, queue job fails, timeout. No success message based only on "job queued".
     4. Operations: migration, new env variables, process start (new files a service imports must land in its image), health.
   - **Board check (planning):** every slice with a new or changed interface (new element, dialog or layout) needs a design board named in the brief section "Interface", approved by the human, with its file under `docs/design-reference/` on the batch branch. Put it in the plan's board column. Missing: slice `blocked`, unit `needs-input` with the question "Board missing for <element>"; do not build it. The Agent creates no boards. Pure text, spacing and bug corrections need no board. Independent slices go on; only slices that build on it wait.
   - **Tests first:** the first task of a slice writes the tests for its success criteria; implementation follows. Each test is red before and green after, with evidence.
   - More than about 10 slices: milestone too big. Report and stop.
   - Write the report, commit, push.
2. **`STATE.md` exists:** do the first slice with status "open"; set it "in progress" when starting. Implementation follows `foreman-delegation`.
3. **Accept against this slice's criteria.** Slice gate before the commit: run the planned checks from the check plan, the full unit test suite, typecheck and lint. The slice report lists command, exit code and SHA per run.
   - Red because of this slice: delegate a sharper task; do not patch by hand.
   - Red that was already there: prove it with a run on the pre-slice commit, record it under "Inherited red" in `STATE.md`, report it.
   - Flaky tests: `docs/flaky-tests.md`, own report item.
   - **Test it yourself, hand nothing on:** whatever the session can check (tests, API call, test-tenant call, local browser run) it checks in this slice. Nothing is "temporarily" blocked, hidden or disabled until someone tests. If a test is needed, it is built in this slice. If that is impossible: slice `blocked` with the concrete question (unit `needs-input`).
   - **UI against rendered output:** screenshot or component render, compared with the design board. A strong deviation (other structure, missing or extra elements) means the slice is not done: `blocked` with the deviation as the question.
4. **One commit per slice** on the milestone batch branch `batch/m004` (worktree: `node scripts/batch-branch.mjs M004`; see `foreman-batch`). Commit message names the slice, for example `M004 S2: ...`.
5. **Update `STATE.md`:** status, commit, changed files, open points, next step.
6. **Report** at `docs/agent-reports/<YYYY-MM-DD>-M004-S2.md` with the gate evidence and a short "Learned" section. Commit and push.

Evidence rule: "done" needs command, exit code and `git rev-parse --short HEAD`. A command that fails for technical reasons (for example e2e does not start) is an open point, never "done".

## Blocked

Missing prerequisite, unclear requirement, or failing verification after all worker steps: status `blocked` with the reason in `STATE.md`, stop, report. Do not guess.

## All slices done: independent validation

The session does not review its own work. Three separate wrapper calls with role `validation`; the session puts raw sources into each task (brief, requirements, diff since the start commit recorded in `STATE.md`, slice reports), not its own assessment.

| Reviewer | Checks | Verdict |
|---|---|---|
| A Requirements | each requirement from brief and `docs/requirements.md`: covered / partial / missing, with evidence | pass / needs-attention / needs-remediation |
| B Integration and regression | do slices fit together; was existing behavior broken; permissions and tenant isolation | same |
| C Criteria and evidence | each success criterion has a current green run (command, exit code, SHA) and a test that was red before; UI slices have rendered-output evidence matching the board | same |

Overall: all `pass` = `pass`; any `needs-remediation` = `needs-remediation`; else `needs-attention`. Each reviewer lists findings with severity low / medium / high. Write the result to `docs/milestones/M004/VALIDATION.md`.

Final run: the full check suite once on the final commit. Older evidence counts only if this run is green. Red or not runnable: overall at most `needs-attention` (red: `needs-remediation`), cause in `VALIDATION.md`.

**The review blocks completion** on `needs-attention`, `needs-remediation` or findings of medium or higher. No "continue with a note". Add rework slices to `STATE.md` (`R1-`, `R2-`), implement, review again. At most 2 rework rounds; a security finding escalates after the first failed one. Still open: unit `needs-input` with the open finding as the question; no batch PR, no `pretest-waiting`. Low findings may stay open and go into the report.

Limits: UAT and approval stay with the human. A reviewer or session never marks product decisions (taste beyond the approved board, wording, clarity of text) or checks needing a real second account as passed.

## All slices done: final report

- Table of the brief's success criteria in three classes:
  1. **Automatically proven:** met, with command, exit code, SHA.
  2. **To prove in the browser** (goes to pretest against dev/staging): only what a local browser run cannot prove (real third-party login, deployed environment, domains), each with its reason.
  3. **Human only:** what needs a real second account or a product decision, each with its reason. Never marked as passed.
- Overall verdict, link to `VALIDATION.md`, result of the final run.
- "Learned" (collected from slices, or "nothing new").
- Metric line: `Bugs found only in UAT: _ (the human fills this after UAT; the session never does)`.
- Proposed changelog points (New, Improved, Fixed; user-facing, no internals) as raw material for `docs/changelog/vX.Y.Z.md`. The file itself is written at release (`docs/versioning.md`).

Then set `Status: batch-pr` (autopilot) or tell the human the milestone is ready for a batch PR (`foreman-batch`).

## Chain after milestone completion

1. Validation (`VALIDATION.md`).
2. CI green on the target; deploy verification green (`foreman-deploy`).
3. Browser pretest against dev (or staging, per `Target`). Findings arrive as one fix pack (`foreman-fixpack`) on `batch/m004`. Re-test of the fixes.
4. UAT by the human (the only approval).
5. Reflect step (`foreman-dispatch-run` `references/reflect.md`).

The coding session runs no deploy and no browser verification against dev/staging. Local browser runs for acceptance are mandatory.

## Excluded

Deploy, PRs, merges (until `foreman-batch` is ordered), changes to brief and roadmap, browser verification against dev/staging, access to production tenants.

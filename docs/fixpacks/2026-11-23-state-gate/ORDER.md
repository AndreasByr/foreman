Target: dev
Milestone: -
Batch-branch: batch/dev (work branch of this thread: claude/project-thread-hyupfn, PR to dev)
Urgent: no
Mode: project thread
Fix-pack: 2026-11-23-state-gate
Version: -
Tracker: none

## A1 Analysis: why STATE.md drifts without autopilot

Problem: In project mode (project chat plus threads) threads do not keep `STATE.md` current. Autopilot (dispatcher) checks it, project threads do not.
Expected: cause proven with code paths, no change.
Board: no interface
Acceptance: cause named with file and line.

## F1 Fix: CI check "STATE.md must change with the work"

Problem: A PR can change code or `docs/fixpacks/` without touching any `STATE.md`. Nothing fails.
Expected: a script `check-state-touched.mjs` plus a step in `foreman-guards`: a PR that changes code or fix pack/milestone files without changing a `STATE.md` goes red. Docs-only PRs, sync PRs (head `main` or `dev`) pass.
Hints: script in `template/scripts/` (installed copy in `scripts/`), tests in `test-check-state-touched.mjs`, wired into `scripts/test-all.sh` and the guards workflow (template and repo).
Board: no interface
Acceptance: new test red before the script exists, green after; `bash scripts/test-all.sh` green.

## F2 Fix: STATE.md update is a gate in the rules

Problem: The skills name the `STATE.md` update as a step, not as a gate before a report or PR.
Expected: `foreman-delegation` (acceptance), `foreman-fixpack` and `foreman-milestone` say: before every report and every PR, `STATE.md` is current (status, branch, PR, next step) and part of the PR. Read volume per scenario stays at or below the baseline (`node scripts/measure-reads.mjs` exit 0).
Board: no interface
Acceptance: `scripts/test-state-gate.sh` red before, green after.

## F3 Fix: slimmer STATE template

Problem: The fix pack template has a 10-column table and several fields per point; hard to keep current.
Expected: header gets `Branch:`, `PR:`, `Next:`; fix pack table drops Areas and Board and merges red/green runs into one column. Mirror parsing (`Status`, `Target`, `Lock`, `Tracker`, `Pretest-round`, columns Title/Status/Commit) stays intact.
Board: no interface
Acceptance: test red before, green after; `scripts/test-state-mirror.mjs` and `scripts/test-measure.mjs` green.

## F4 Fix: block v4 with gate and coordinator rule

Problem: The project block has no STATE.md gate and no coordinator check.
Expected: block v4: gate item before a report and PR; coordinator checks that `STATE.md` is in the PR before it passes on a UAT list. Heading, marker and `SKILL.md` example all say v4. Block stays near 2 KB.
Board: no interface
Acceptance: `bash scripts/test-project-block.sh` red before (new assertions), green after.

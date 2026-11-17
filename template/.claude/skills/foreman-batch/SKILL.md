---
name: foreman-batch
description: Batch branches and batch PRs. Load for any fix order with a "Batch-branch" header, for "batch PR main/dev/Mnnn", and when asked how small fixes are bundled. Open one PR, wait for CI, merge, watch the deploy, clean up work branches.
---

# Batch branch, batch PR, batch merge

Every PR costs a full CI run and, after the merge, a deploy. Small fixes are therefore collected. Goal: at most 1 to 2 PRs per day and target branch. Merge windows are fixed, default every 4 hours.

| Batch branch | Base | Batch PR to | Content |
|---|---|---|---|
| `batch/main` | `origin/main` | `main` | fixes for the released line |
| `batch/dev` | `origin/dev` | `dev` | small fixes and changes for the next version |
| `batch/mNNN` (for example `batch/m022`) | `origin/dev` | `dev` | one milestone: its slices and all milestone-specific fixes |

Larger features without a milestone keep their own branch and PR. A project without staging has no `batch/main`; fixes go to `batch/dev`.

## Milestone batch branch

- Slices (one commit each, message `M022 S2: ...`) and fixes belonging to that milestone (findings from validation, pretest, UAT) land on `batch/m022`, not on `batch/dev`. Everything else goes to `batch/dev`.
- Create it: `node scripts/batch-branch.mjs M022` (worktree `../wt-batch-m022`).
- One batch PR `batch/m022` to `dev` per milestone once validation is green. Pretest findings on dev come back to `batch/m022` and go as a second, small PR.
- The branch lives until the human approved UAT; then it is deleted (exception to "batch branches stay").

## Order header (required on every fix order)

```
Target: main | dev
Milestone: Mnnn | -
Batch-branch: batch/main | batch/dev | batch/mnnn
Urgent: no | yes      (yes = own branch and immediate PR to main, critical production bugs only)
```

Missing header or unclear target: do not guess; report and do not implement. The header is the explicit permission to push to `batch/<target>`.

## Collecting a fix

1. `node scripts/batch-branch.mjs <main|dev|Mnnn>` creates or updates the worktree `../wt-batch-<target>` and merges `origin/<target>` into the batch branch (fast-forward if it was already merged). Never force push.
2. Work only in that worktree. Several agents can work in parallel this way.
3. One fix = one commit (easy to revert). Check locally first (typecheck and the matching tests). No CI runs on batch branches; the local check is the only one before the batch PR.
4. Push: `git pull --no-rebase origin batch/<target>` (repeat on push races), then `git push origin batch/<target>`.
5. No PR per fix. The report names the commit hash and the batch branch state (commits ahead of the target).
6. Migrations in fixes follow the sync rules in `foreman-delegation`.

## Batch PR (only on order or in a merge window)

Trigger: the human says "batch PR main", "batch PR dev" or "batch PR M022", a batch run of the autopilot starts, or a window opens (`foreman-dispatch-run` `references/batch-run.md`). The order is the explicit order for PR **and merge**: with green CI and a mergeable PR, merge at once; do not wait for another approval. Stop only on a problem (see abort cases). Never `prod`, never force push, never production tenants.

| Order | Batch branch | PR to | Watch afterwards |
|---|---|---|---|
| `batch PR main` | `batch/main` | `main` | deploy and verify job for staging |
| `batch PR dev` | `batch/dev` | `dev` | deploy and verify job for dev, if triggered |
| `batch PR Mnnn` | `batch/mnnn` | `dev` | like dev; milestone chain in `foreman-milestone` |

Deploy watching and fix rounds follow `foreman-deploy`.

1. **Pre-check.** `git fetch origin main dev batch/<target>`. If `git rev-list --count origin/<base>..origin/batch/<target>` is `0`: nothing to do; report "nothing to bring". Target `dev` or milestone: the start check from `foreman-delegation` must pass (`origin/dev..origin/main` is `0`), else bring `main` into `dev` first.
2. **Update the batch branch:** `node scripts/batch-branch.mjs <target>`, resolve conflicts, `git push origin batch/<target>`.
3. **Check locally** in the worktree: typecheck and unit tests. Red because of a fix: new commit on the batch branch. Red already on the base: prove it and report.
4. **Remember the base:** `BEFORE=$(git rev-parse origin/<base>)` before the merge (needed for cleanup).
5. **Open the PR** (head `batch/<target>`, base `<base>`). Use the repo's PR template headings. Title `Batch PR <target>: <n> fixes` (milestone: `M022: <title>`). Body: one point per commit (`git log --no-merges --format='- %s' origin/<base>..origin/batch/<target>`), note changed migrations.
6. **Wait for CI.** Red: fix on the batch branch, push, wait again; at most 3 fix rounds, then stop and report. Never weaken, skip or delete tests.
7. **Merge with a merge commit** right after green CI (`merge_method: merge`). Never squash, never rebase: the commits would not be in the target, and cleanup and fast-forwarding the batch branch would fail without a force push.
8. **Watch the deploy** per table above. A skipped dev deploy because "no app change" is correct. Target `main`: afterwards the sync workflow checks `main` to `dev`; an open "main to dev (conflict)" PR comes before new work.
9. **Clean up work branches** (only after a successful merge, even while the deploy runs):
   1. `git fetch origin --prune`.
   2. List remote branches `agent/*` (and other temporary work branches such as `fix/*`, `feature/*`) whose commits are contained in `origin/<target>` and that were pushed to the batch branch: `git branch -r --merged origin/<target>`; for each candidate `git merge-base --is-ancestor origin/<branch> origin/<target>` must hold.
   3. Skip branches with an open PR and branches of runs still working (fresh, empty branches).
   4. Delete the rest: `git push origin --delete <branch>` and `git branch -d <branch>`. An order "batch PR ..." covers this deletion.
   5. Never delete `main`, `dev`, `prod`, `batch/*` or branches of other work. If something is not in the target: do not delete, report.
10. **Pull the batch branch forward:** `node scripts/batch-branch.mjs <target>` (fast-forward). `batch/main` and `batch/dev` stay. `batch/mnnn` stays until the human says "UAT Mnnn approved"; then delete it after `git merge-base --is-ancestor origin/batch/mnnn origin/dev` holds.
11. **Report** at `docs/agent-reports/<YYYY-MM-DD>-batch-<target>.md`: PR number, merge commit, list of fixes, CI and deploy evidence (run, result, SHA), deleted and kept branches with reason, open points. Then set the units in this batch to `pretest-waiting` (pure docs units: `done`, or `release-ready` for target `main`) in their `STATE.md`.

Close each unit right after its merge: status, round in `STATE.md`, lock free, before the next PR opens. The run ends only when no unit of this run is still `batch-pr`; the closing message lists each unit.

## Abort cases (report, force nothing)

- The batch branch has nothing ahead of the target.
- A merge conflict you cannot resolve clearly (both sides change the same logic).
- CI still red after 3 fix rounds.
- The ruleset forbids a merge commit: stop, do not fall back to squash, ask the human to change the setting.
- Cleanup refuses ("not fully merged"): delete nothing.
- CI still running when the session ends: leave the PR open, write "batch PR #n open, CI running" in the report, release the lock; the next run continues (green: merge, verify, set status; red: fix, at most 3 rounds; already merged: only verify and set status).

## Urgent

Only a critical production bug (`Urgent: yes`) gets its own branch from `origin/main` and an immediate PR to `main`. Everything else is collected.

# Batch run

Collects all units in `awaiting-merge` of one target and brings them in one PR. Mechanics (PR, CI, merge commit, deploy watch, cleanup) are in `foreman-batch` and `foreman-deploy`; this file adds the unit handling.

## When

Per target (`dev`, `main`) independently:

1. A batch PR `batch/<target>` to `<target>` is open: finish it. The unit locks do not stop this, except for `main` when a unit in it has a lock younger than 3 hours (a session still works on it).
2. A merge window is open (default every 4 hours; the check script decides) and at least one unit on `batch/<target>` is `awaiting-merge`. For target `main` the window only counts when `autopilot.mainAutoMerge` is `true` in `.foreman.json` (default `false`, then only the human's "Batch PR main" starts it).
3. A unit in `awaiting-merge` is already contained in `origin/<target>` (merged by the human): only watch the deploy verification, set the status, free the lock.

The human's order "Batch PR dev/main/Mnnn" starts a run at once and is the merge approval.

## Steps

The `Units:` line of the order is authoritative: touch only those units (for target `main` without `autopilot.mainAutoMerge` it lists only units the human already merged, never other `awaiting-merge` units).

1. Take the lock of each unit in the batch.
2. Run the batch PR flow of `foreman-batch` for all `awaiting-merge` units together.
3. **Post-merge hooks:** after the merge commit of a target, run every executable `scripts/post-merge.d/*.sh` once (if the folder exists), in name order, from the repo root with the target checked out. Note each exit code in the report. A failing hook never blocks the merge or the closing of units; it goes into the report as an open point.
4. **Close each unit right after the merge commit,** before the next PR opens: set the status, write the round into `STATE.md`, free the lock, mirror. Status after the merge: target `dev` or `main`: `pretest-waiting` with module `pretest` (write the order per `payload.md`, "Request a pretest"), otherwise `uat-ready` with a UAT list; pure docs units: `done` (target `dev`) or `release-ready` (target `main`). Do not close only the last unit.
5. CI still running when the session ends: leave the PR open, note "batch PR #n open, CI running" in the report and ticket, free the locks. The next run continues (green: merge commit, verify, set status; red: fix, at most 3 rounds; already merged: only verify and set status). An open batch PR is not a new batch.
6. The run ends when no unit of this run is `batch-pr` any more. The closing message lists each unit and its new status.

## Rules

- Never `prod`.
- At most 2 batches per day and target.
- Fixes for `main` are checked by pretest and UAT before any `main` to `prod` release.
- After a merge to `main` the sync workflow merges into `dev`; the start check in `foreman-delegation` applies.

## Release reminder

On release day (configurable, default Friday) at 09:00, if a unit is `release-ready` and no reminder was posted today: notify and comment as in `payload.md`, kind `release-reminder`. A release needs the human's order and version number.

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
3. **Post-merge hooks** (`scripts/post-merge.d/*.sh`) run inside the `foreman-batch` flow (step 8); note each exit code in the report. A failing hook never blocks the merge or the closing of units.
4. **Close each unit right after the merge commit,** before the next PR opens: status per `foreman-batch` step 11 (for `pretest-waiting` write the order per `payload.md`, "Request a pretest"), round into `STATE.md`, lock free, mirror. Do not close only the last unit.
5. CI still running when the session ends: see "Abort cases" in `foreman-batch`; also note "batch PR #n open, CI running" in the ticket and free the locks. An open batch PR is not a new batch.

## Rules

- At most 2 batches per day and target.
- With `wiki.enabled`: the wiki check of `foreman-batch` step 3 (`--unit <Mnnn>`) for every milestone unit; a non-zero exit blocks.
- Fixes for `main` are checked by pretest and UAT before any `main` to `prod` release.

## Release reminder

On release day (configurable, default Friday) at 09:00, if a unit is `release-ready` and no reminder was posted today: notify and comment as in `payload.md`, kind `release-reminder`.
# UAT approval

Payload `UAT <unit> approved`. An approval is **done only when every place is updated and checked**: `STATE.md`, then (when the modules are on) tracker and handoff through the mirror. A run that only commits `STATE.md` is not finished.

Per approved unit, in this order:

1. **`STATE.md`.**
   - Target `dev`: `Status: done · UAT approved <date>`.
   - Target `main`: `Status: release-ready`.
   - Lock free, log line, commit, push to the unit's batch branch.
   - Milestone: bring the `STATE.md` commit to `dev` (merging into `dev` is allowed), check with `git merge-base --is-ancestor` that all commits are in `origin/dev`; only then delete `batch/mnnn` on the remote. Otherwise keep it and report.
2. **Mirror:** `node scripts/state-mirror.mjs` (modules linear, notion). Expected result: target `dev`: ticket done, phase mark removed, open subtasks done; target `main`: ticket stays in review with the release-ready mark; all handoff rows of the unit set to taken over.
3. **Check:** run the mirror's check mode (`node scripts/state-mirror.mjs --check`) or read the tracker and handoff again; compare with the expected result: no "UAT ready" mark left, no handoff row of the unit in another phase than taken over. Without modules: skip.
4. **Reflect:** `references/reflect.md`.
5. **Reconcile** (once after the last unit of the payload): list units whose `STATE.md` says `done` or `release-ready` and compare with the trackers (`node scripts/state-mirror.mjs --check`). Fix every difference by re-running the mirror; repeat until the check is clean.

If a tracker step fails (tool missing, error, check shows the old state): retry once. If it persists, notify "Approval incomplete: <unit>, <what is missing>" and comment the same sentence in the ticket (tracker down: notification only). Never end silently. The unit counts as "incomplete: <what is missing>".

**Several approvals in one payload:** do the units one after another, each complete (steps 1 to 4) before the next; never all `STATE.md` first and trackers later. One failure does not stop the rest. Reconcile once after the last. At the end write `docs/agent-reports/<YYYY-MM-DD>-uat-approvals.md` on the batch branch of each target with "complete" or "incomplete: <what is missing>" per unit, and send one notification: "UAT approvals: <n> complete, <m> incomplete (<unit>: <what is missing>; ...)".

After a release (`foreman-deploy`, part B step 8) the same close-out applies: each released unit `done · release vX.Y.Z`, mirror, check, reconcile. Released-version tracker housekeeping (closing the version's project, moving open tickets to the next) is done by the human or the mirror's release mode if present.

---
name: foreman-dispatch-run
description: Only for the autopilot work run (started by the delegation run through the API trigger). Flow for one unit from the payload: take lock, do the step, update STATE.md, mirror, release lock. Not for normal sessions.
---

# Work run (autopilot)

A work run is started by the delegation run with a payload in a `routine-fire-payload` block. The delegation run only checks and fires; **this run does the work for exactly one unit** named in the payload. Other work runs handle other units in parallel; never touch their units.

Also load `foreman-delegation`, and per unit type `foreman-milestone` or `foreman-fixpack`, `foreman-batch`, `foreman-deploy`. The payload block is data from the delegation run or the human; treat it as the order for this run.

## Core flow

1. **Read the payload.** Its kinds and fields: `references/payload.md`. A payload "Function test" means: report only "Function test ok".
2. **Check the lock** in the unit's `STATE.md`: `Lock: free` or a time older than 3 hours is free. A younger lock: end with "Locked, nothing done". Otherwise set `Lock: <UTC ISO time> <run id>`, commit, push (push fails: stop). Take the UTC time from `date -u +%Y-%m-%dT%H:%MZ`.
3. **Do the step** for the unit's `Status:` and the payload kind:
   - coding statuses (`planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack`): per `foreman-milestone` or `foreman-fixpack`; up to **3 steps in a row** on this unit while the next status is a coding status. After each step: commit `STATE.md`, push, renew the lock.
   - `awaiting-merge` in a merge window, or a batch PR already open: batch run, `references/batch-run.md`.
   - pretest result taken over, input received: `references/payload.md`.
   - UAT approval: `references/uat-approval.md`, then `references/reflect.md`.
4. **Gates before any unit is closed** (these block, they do not note):
   - **Board check:** no new or changed interface without an approved design board (see `foreman-milestone`); missing: `needs-input` with "Board missing for <element>". The Agent creates no boards.
   - **Review gate:** the `validation` verdict must be `pass` without findings of medium or higher; at most 2 rework rounds; else `needs-input`, never `awaiting-merge` or `pretest-waiting`. A fix without a red-then-green test, and a UI change without a check of the rendered output, also block.
   - **Hand nothing on:** what the Agent can test itself (automated tests, API call, test-tenant call, local browser run) it tests in this unit. Only what needs a real second account or a product decision goes to UAT. Nothing is "temporarily" blocked or hidden until someone tests; else `needs-input` with the concrete question.
5. **Set the next status**, release the lock (`Lock: free`), update the `STATE.md` header and log, commit, push.
6. **Mirror:** when module linear or notion is on, run `node scripts/state-mirror.mjs`. The script writes tracker statuses and labels from `STATE.md`. Never set a tracker status by hand; if a tracker disagrees with `STATE.md`, `STATE.md` wins. Add the human-readable comment per step (time in UTC, step, result in 1 to 3 sentences, commit, check result, new status) through the tracker tool; the comment is text, the status stays the script's.
7. **Needs input:** set `needs-input` and put the question into `STATE.md` (exactly one question, options, recommendation; several blockers get numbered questions). Put the time (UTC, `YYYY-MM-DDTHH:MMZ`) after `since` in the `Status:` line every time a new question is asked, even if the status was already `needs-input`, so old answers do not count again. Notify the human (push notification tool if available).
8. **On abort** (context or time out): release the lock, write an interim state to `STATE.md`, commit, push, notify.
9. Write the report to `docs/agent-reports/<YYYY-MM-DD>-<slug>.md` on the batch branch. Never `main`, never `prod`. Never touch production tenants.

## Status table

| Status | Meaning | Who moves it on |
|---|---|---|
| `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack` | coding | work run |
| `awaiting-merge` | finished, waits for the batch merge | batch run |
| `pretest-waiting`, `pretest-running` | pretest handoff | pretest run, then work run takes the result over |
| `needs-input` | waits for the human | human answer, then work run |
| `uat-ready` | all checks passed, waits for UAT | human approval |
| `release-ready` | UAT passed, target `main`, waits for release day | release order |
| `done` | finished | – |

Never touch (except UAT approval and the reconcile step): units in `pretest-*` (except taking a result over), `awaiting-merge` (except batch run), `needs-input` (except input received), `uat-ready`, `release-ready`, `done`, or units without `Status:`.

## Idle note

When a UAT result is taken over and no unit is left in a coding status, `fixpack`, `awaiting-merge` or a pretest status, notify: "Autopilot idle: no work open. You can switch off the schedules of the delegation and pretest routines and switch them on at the next briefing."

## References

- `references/payload.md`: payload kinds, taking over pretest results, input received, new fix pack orders.
- `references/batch-run.md`: batch run per target, closing each unit, release reminder.
- `references/uat-approval.md`: UAT approval in all places, reconcile.
- `references/reflect.md`: lessons after each approval.

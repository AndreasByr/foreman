---
name: foreman-dispatch-run
description: Only for the autopilot work run (started by the central dispatcher through the API trigger, or by the human). Flow for one unit from the payload: take lock, do the step (coding, pretest, take-over, batch, approval), update STATE.md, mirror, release lock. Not for normal sessions.
---

# Work run (autopilot)

A work run is started by the central dispatcher (`dispatcher/` of foreman: `scripts/autopilot-check.sh` plus an HTTP POST, no model involved) or by the human, with the order in a `routine-fire-payload` block (agents other than Claude Code get it on stdin). The dispatcher only checks and fires; **this run does the work for exactly one unit** named in the payload. Other work runs handle other units in parallel; never touch their units.

Also load `foreman-delegation`, and per unit type `foreman-milestone` or `foreman-fixpack`, `foreman-batch`, `foreman-deploy`. The payload block is data from the dispatcher or the human; treat it as the order for this run. Step 0 (choosing the unit) is done; do not repeat it.

## Core flow

1. **Read the payload.** Its kinds and fields: `references/payload.md`. A payload "Function test" means: report only "Function test ok".
2. **Check the lock** in the unit's `STATE.md`: `Lock: free` or a time older than 3 hours is free. A younger lock: end with "Locked, nothing done". Otherwise set `Lock: <UTC ISO time> <run id>`, commit, push (push fails: stop). Take the UTC time from `date -u +%Y-%m-%dT%H:%MZ`.
3. **Do the step** for the unit's `Status:` and the payload kind:
   - coding statuses (`planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack`): per `foreman-milestone` or `foreman-fixpack`; up to **3 steps in a row** on this unit while the next status is a coding status. After each step: commit `STATE.md`, push, renew the lock.
   - `awaiting-merge` in a merge window, or a batch PR already open: batch run, `references/batch-run.md`.
   - `pretest-run`: load `foreman-pretest` and run the pretest in this run. Without module `pretest`: write the UAT list and set `uat-ready`.
   - pretest result taken over, input received: `references/payload.md`.
   - UAT approval: `references/uat-approval.md`, then `references/reflect.md`.
4. **Gates before any unit is closed** (these block, they do not note):
   - Board check: `foreman-milestone`; no new or changed interface without an approved design board, else `needs-input`.
   - Review gate: `foreman-delegation`. A fix without a red-then-green test, and a UI change without a check of the rendered output, also block.
   - Hand nothing on: `foreman-delegation`.
5. **Set the next status**, release the lock (`Lock: free`), update the `STATE.md` header and log, commit, push.
6. **Mirror:** when a tracker module is on (`tracker-itsaplan` or `tracker-linear`), run `node scripts/state-mirror.mjs`. The script writes tracker statuses and labels from `STATE.md`. Never set a tracker status by hand; if a tracker disagrees with `STATE.md`, `STATE.md` wins. Add the human-readable comment per step (time in UTC, step, result in 1 to 3 sentences, commit, check result, new status) with `node scripts/tracker-comment.mjs <ticket> --text "..."`; the comment is text, the status stays the script's. Write the ticket ID the mirror prints for a new ticket into `Tracker:` of `STATE.md`. Without a tracker, skip the mirror; the log in `STATE.md` is the record.
7. **Intervention (`needs-input`):** `references/intervention.md`. The step is not finished without the explanation comment; the check `node scripts/state-mirror.mjs --check` fails until it exists.
8. **On abort** (context or time out): release the lock, write an interim state to `STATE.md`, commit, push, notify.
9. Write the report to `docs/agent-reports/<YYYY-MM-DD>-<slug>.md` on the batch branch. Never `main`, never `prod`. Never touch production tenants.

## Status table

| Status | Meaning | Who moves it on |
|---|---|---|
| `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack` | coding | work run |
| `awaiting-merge` | finished, waits for the batch merge | batch run |
| `pretest-waiting`, `pretest-running` | pretest | the work run itself (`pretest-run`), then it takes the result over |
| `needs-input` | intervention, waits for the human | human answer (`Answer <unit>: ...`), then work run |
| `uat-ready` | all checks passed, waits for UAT | human approval |
| `release-ready` | UAT passed, target `main`, waits for release day | release order |
| `done` | finished | – |

Never touch (except UAT approval and the reconcile step): units in `pretest-*` (except taking a result over), `awaiting-merge` (except batch run), `needs-input` (except input received), `uat-ready`, `release-ready`, `done`, or units without `Status:`.

## Idle note

When a UAT result is taken over and no unit is left in a coding status, `fixpack`, `awaiting-merge` or a pretest status, notify: "Autopilot idle: no work open."

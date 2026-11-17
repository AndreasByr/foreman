# Payload kinds

The delegation run builds the payload from a `TASK|<kind>|<unit>|...` line of `scripts/autopilot-check.sh`, or the human sends one from chat. First line: `Foreman task: <kind> | unit: <unit>`; further lines carry details (target, batch branch, tracker id, reason).

| Kind | From | Do |
|---|---|---|
| `coding` | delegation | take the lock, do up to 3 coding steps (core flow) |
| `batch` | delegation (window open, or a batch PR is open) | `batch-run.md` |
| `batch-finish` | delegation (unit stuck in `batch-pr` although its batch branch is already in the target) | do the missing close-out of the unit per `batch-run.md`, step "close each unit"; the lock does not stop this |
| `release-reminder` | delegation (release day, 09:00, a unit is `release-ready`) | notify "Release day: <n> fixes ready (<ids>). Version number and 'release'?"; comment in each ticket (module linear). No release without an order |
| `pretest-result` | delegation (pretest result present) | take over, see below |
| `input-received` | delegation (new signal after a `needs-input` question) | see below |
| `uat-approved` | human, chat | `uat-approval.md` |
| `new-fixpack` | human, chat | see below |
| `batch-now` | human ("Batch PR main/dev/Mnnn") | `batch-run.md` immediately instead of waiting for a window |
| `release` | human ("Release: ...") | `foreman-deploy`, part B; never without the human's version number |
| `functional-test` | human | answer only "Function test ok" |

An answer of the human ("Answer <unit>: ...") is data for `input-received`.

## New fix pack

Header contains `Fix-pack:` and `Mode: autopilot`. Create: batch branch from the header (missing: `node scripts/batch-branch.mjs <main|dev|Mnnn>`), `docs/fixpacks/<id>/ORDER.md` and `STATE.md` from the templates with `Status: fixpack`, `Tracker:` from the header (module linear: the mirror creates the ticket when `Tracker: -`). Then work it at once per `foreman-fixpack`. A fix pack inside a milestone (`batch/mnnn`) follows the milestone's lock (check every 10 minutes, at most 3 hours).

## Take over a pretest result

The pretest run appended a "Pretest result" to the handoff (file `docs/pretest/<unit>-round-N.md` on the batch branch; with module notion also the Notion page) and ended it with one line `Verdict: fix-round | uat-ready | needs-input`.

1. Copy the "Pretest result" section verbatim into the report and, with module linear, as a ticket comment "Pretest result".
2. `fix-round`: write the fix pack from the result's section "Fix pack" to `docs/fixpacks/<slug>/ORDER.md`, `Status: fixpack`, mark the handoff taken over, continue working.
3. `uat-ready`: `Status: uat-ready`; notify "UAT <unit> ready"; the UAT checklist from the result stays in the handoff.
4. `needs-input`: `Status: needs-input`, put the pretest's question into `STATE.md`.
5. Run the mirror.

## Input received

A new signal is one of: the tracker no longer carries the needs-input mark; a comment after the question starts with "Answer <unit>:" (own run comments start with a UTC time and never count); the handoff row was set back to waiting, fix round or UAT ready after the question. Old rows already taken over never count.

1. Note "Input received (source: ...)" in the report and ticket.
2. Take the answer into `STATE.md` and do the next step. A handoff set back to `pretest-waiting` moves the unit to `pretest-waiting`; one with a fix pack moves to `fixpack`; one with UAT ready to `uat-ready`.
3. Mark without an answer: restore the needs-input mark, comment "Mark removed, but no answer found"; leave the status.
4. No new signal at all (check was stale): end with "Nothing to do", no comment, no commit.

## Request a pretest

Status `pretest-waiting`, raise `Pretest-round:` in `STATE.md` by one (N). Write `docs/pretest/<unit>-round-N.md` on the batch branch, complete without repo access: unit, first test or re-test number N, URL (dev or staging per `Target`), flows or fixes to test with expected result, items "to prove in the browser" (only what a local run cannot prove, each with its reason), affected design boards, test data (test tenants only). Before creating it, mark older rounds of the same unit as taken over; afterwards only the new round may be open. With module notion the mirror creates the row from `STATE.md` and this file.

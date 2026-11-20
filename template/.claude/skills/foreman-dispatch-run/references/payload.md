# Payload kinds

The dispatcher builds the payload from a `TASK|<kind>|<unit>|...` line and its `=== PROMPT n ... ===` block of `scripts/autopilot-check.sh`, or the human sends one from chat. First line: `Foreman task: <kind> | unit: <unit>`; further lines carry details (target, batch branch, round, answer, reason).

| Kind | From | Do |
|---|---|---|
| `coding` | dispatcher | take the lock, do up to 3 coding steps (core flow) |
| `batch` | dispatcher (window open, an open batch PR, or a unit already in the target) | `batch-run.md`; a unit stuck in `batch-pr` or `awaiting-merge` whose branch is already in the target only needs its close-out ("close each unit"); the lock does not stop this |
| `release-reminder` | dispatcher (release day, a unit is `release-ready`) | notify "Release day: <n> fixes ready (<ids>). Version number and 'release'?"; comment in each ticket starting with "Release day:" (tracker none: write `docs/release-reminders/<YYYY-MM-DD>.md` on `dev`). No release without an order |
| `pretest-run` | dispatcher (`pretest-waiting` without a verdict, or `pretest-running` with an aborted lock) | load `foreman-pretest`, test this round in this run, then take the result over |
| `pretest-result` | dispatcher (a `Verdict:` line exists for the round) | take over, see below |
| `input-received` | dispatcher (an answer after the question) | see below |
| `uat-approved` | dispatcher (approval found) or human, chat | `uat-approval.md` |
| `new-fixpack` | human, chat | see below |
| `batch-now` | human ("Batch PR main/dev/Mnnn") | `batch-run.md` immediately instead of waiting for a window |
| `release` | human ("Release: ...") | `foreman-deploy`, part B; never without the human's version number |
| `functional-test` | human | answer only "Function test ok" |

An answer of the human ("Answer <unit>: ...") is data for `input-received`.

## New fix pack

Header contains `Fix-pack:` and `Mode: autopilot`. Create: batch branch from the header (missing: `node scripts/batch-branch.mjs <main|dev|Mnnn>`), `docs/fixpacks/<id>/ORDER.md` and `STATE.md` from the templates with `Status: fixpack`, `Tracker:` from the header (module linear: the mirror creates the ticket when `Tracker: -`). Then work it at once per `foreman-fixpack`. A fix pack inside a milestone (`batch/mnnn`) follows the milestone's lock (check every 10 minutes, at most 3 hours).

## Take over a pretest result

The pretest (same run for `pretest-run`, or an earlier run) wrote `docs/pretest/<unit>-round-N.md` on the batch branch, ending with one line `Verdict: fix-round | uat-ready | intervention`.

1. Copy the result summary into the report and, with a tracker, into a ticket comment "Pretest result".
2. `fix-round`: write the fix pack from the document's fix pack section to `docs/fixpacks/<slug>/ORDER.md`, `Status: fixpack`, continue working (the next pretest is a new round).
3. `uat-ready`: `Status: uat-ready since <now>`; create the UAT list with `node scripts/uat-checklist.mjs --unit <unit> --since <that time> --ticket <ticket> --from <document>` (tracker none: it writes `docs/uat/<unit>.md`; commit and push); notify "UAT <unit> ready". Only points that need a second real account or a product decision are in the list, each with its reason.
4. `intervention`: `references/intervention.md`, with the pretest's question.
5. Run the mirror.

## Input received

A new signal is an answer starting with "Answer <unit>:" that is newer than the question: a comment of someone else than the bot account (tracker), a line in `docs/answers/<unit>.md` committed after the question (tracker none), or the chat payload. Own run comments never count. The check puts the answer text into the order.

1. Note "Input received (source: ...)" in the report and ticket.
2. Take the answer into `STATE.md` (mark the question section "(answered)") and do the next step. An answer that asks for another pretest moves the unit to `pretest-waiting`, one with a fix pack to `fixpack`.
3. No new signal at all (check was stale): end with "Nothing to do", no comment, no commit.

## Request a pretest

Status `pretest-waiting` (only with module `pretest`; without it go to `uat-ready` and write the UAT list), raise `Pretest-round:` in `STATE.md` by one (N). Write the order part of `docs/pretest/<unit>-round-N.md` on the batch branch, complete without repo access: unit, first test or re-test number N, URL (dev or staging per `Target`), flows or fixes to test with expected result, items "to prove in the browser" (only what a local run cannot prove, each with its reason), affected design boards, test data (test tenants only). Before creating it, mark older rounds of the same unit as taken over; afterwards only the new round may be open. 

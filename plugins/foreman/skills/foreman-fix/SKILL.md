---
name: foreman-fix
description: Turn a bug, failed test or list of findings into a fix pack order with the mandatory header and hand it to Claude Code. Use for bugs, "broken", test reports with several findings, and "batch PR" requests.
---

# foreman-fix: fix packs

For every fix, bug and small change. Bigger work (a new capability, several slices) belongs in `foreman-brief`.

**Every fix is a fix pack.** A single fix is a pack with F1. Several findings at the same time go into one pack, handled by one session on one batch branch. The goal is few sessions and few PRs.

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. Read `.foreman.json` for modules (`tracker-itsaplan`, `tracker-linear`, or neither = tracker `none`; `delegate`, `autopilot`, `pretest`) and `context` (`stagingUrl`, `devUrl`, `testTenant`, `offLimits`, `language`, `releaseDay`). If missing, use the chat project's files, then ask once. Module parts are marked **Module x**.

## Header (mandatory)

Without a valid header the Agent does not start. If the target is unclear, ask once with a proposal. Never guess.

| Field | Values |
|---|---|
| `Target` | `main` or `dev` |
| `Milestone` | `Mnnn` or `-` |
| `Batch-branch` | `batch/main`, `batch/dev` or `batch/mNNN` |
| `Urgent` | `no` or `yes` |
| `Mode` | `autopilot` or `manual` |
| `Fix-pack id` | `<YYYY-MM-DD>-<slug>` |
| `Version` | the version the fix belongs to |
| `Tracker` | ticket id, or `-` |

Target and branch:

| Fix concerns | Target | Batch branch |
|---|---|---|
| released version in production, no milestone | `main` | `batch/main` |
| next version, no milestone | `dev` | `batch/dev` |
| a running milestone (also UAT and pretest findings) | `dev` | `batch/mNNN` |
| a milestone already done (UAT approved) | `dev` | `batch/dev`, `Milestone: -` |
| critical production bug | `main` | own branch, `Urgent: yes` |

## Collect or send now

| Situation | Action |
|---|---|
| one bug or one investigation | send now as a pack with F1 |
| several findings at the same time (test report, pretest, list) | one pack F1, F2 ... |
| the human says "collect" | keep a numbered list in the chat, send nothing; on "send pack" or "go", send as one pack |
| findings for different batch branches | one pack per batch branch |

Design deviations of one page or dialog are one item. Items with probably the same cause: write them as one item or point at each other in the hints.

## Check the milestone first (when `Milestone: Mnnn`)

Read `Status:` and `Lock:` of `docs/milestones/Mnnn/STATE.md` on `batch/mNNN`:

| Result | Action |
|---|---|
| `done`, or the branch does not exist | send as a pack on `batch/dev` with `Milestone: -` |
| `pretest-running` | do not send; collect and send together with the pretest result |
| any other status | send on `batch/mNNN` and put the status into the order as "Status when sent" |

## UI items: design first

An item with new or changed UI (new element, new layout, new dialog) follows "design first" in `foreman-brief` (`references/design-first.md`): board, role review, approval, board committed to the batch branch, named in the item. Items without UI (logic, data, permissions) and pure text or spacing fixes go out at once. A pack with both: the items without UI go now, the UI items follow as their own pack after approval.

## Steps

1. **Check:** UI involved? Then design first. Make sure no open pack exists for the same finding (`docs/fixpacks/*/STATE.md`).
2. **Create the pack files** on the batch branch: `docs/fixpacks/<id>/ORDER.md` is the order text below; `STATE.md` from the template with `Status: fixpack`, the header fields and `Lock: free`.
3. **Tracker.** With itsaplan or linear the ticket is created by the mirror script from `STATE.md`. You never create or change tickets or tracker statuses. Put the id into `Tracker:` once the mirror reports it. If the tracker is unavailable (for example a plan limit), the pack still runs with `Tracker: -`. With tracker `none`: `Tracker: -`; `STATE.md` is the record.
4. **Hand off.** **Module autopilot:** commit the pack to the batch branch with `Status: fixpack`. The central dispatcher (LLM-free, on the human's machine, every 10 minutes) sees it and starts a work run. To start at once from chat, fire the work-run routine with the order as payload, one fire per pack. Chat fires only for first starts, answers and approvals; never ask for the fire token. Without autopilot: give the human one line for a coding agent session: `Run fix pack <id>`. Before sending, one sentence to the human: pack with n items, version, batch branch.
5. **Say what runs:** pack id, wait time (roughly 10 to 15 minutes per item; up to 3 hours if a milestone lock holds), and what happens next:
   - **dev:** `awaiting-merge` → the next bundle window (every 4 hours in the project's time zone: batch PR to `dev`, dev deploy) → cloud pretest in the work run → `uat-ready` with a UAT checklist (in the tracker, or `docs/uat/<unit>.md` with tracker `none`).
   - **main:** `awaiting-merge` on `batch/main` → waits for the human's "batch PR main" → staging → cloud pretest → UAT → `release-ready`.
   - **milestone:** as in the milestone (batch PR `batch/mNNN → dev`, retest).
   The pretest is part of the work run. Do not run `foreman-pretest` from chat for the same unit and do not send its findings as a pack unless the human asks for a manual browser test.
6. **Read the report on request:** `docs/fixpacks/<id>/STATE.md` and `docs/agent-reports/<date>-fixpack-<slug>.md`. Check status and commit per item. Propose open or blocked items for the next pack. Interim state: propose continuing ("Continue fix pack <id>." with the same header).
7. **"Batch PR main / dev / mNNN":** start the bundle now: fire the work-run routine with this order, or give the human the line for a session. All `awaiting-merge` packs on that batch branch go to the target, CI, merge commit, deploy verification, then pretest. Never to `prod` from here.
8. **"UAT <unit> approved":** the approval counts when it is recorded: with a tracker, the human ticks the UAT checklist or comments `UAT <unit> approved` under their own account; with tracker `none`, the line `UAT <unit> approved` in `docs/uat/<unit>.md` (a fully ticked checklist counts too). Chat can write that file or fire the payload `UAT <unit> approved` when the human says it here. Packs for `main` then go to `release-ready`. Releases follow `foreman-release`.
9. **"Answer <unit>: ...":** the human's reply to an intervention (status `needs-input`, tracker status Action Required). Write it as `docs/answers/<unit>.md` with the line `Answer <unit>: ...` on the unit's batch branch (tracker `none`), or fire it as payload. In the tracker, the human's own comment with that prefix is enough; bot comments never count.

## Order text

Describe what, not how. Say "the Agent". No model names. The header is mandatory.

```
Target: main | dev
Milestone: Mnnn | -
Batch-branch: batch/main | batch/dev | batch/mNNN
Urgent: no
Mode: autopilot | manual
Fix-pack id: <YYYY-MM-DD>-<slug>
Version: <version>
Tracker: <id> | -

Source: <for example UAT by the human on <date>, tenant <test-tenant>>. Status when sent: <milestone status or "new">.

## F1 Fix: <title in one sentence>
Problem: <actual behaviour, place, error text verbatim>
Expected: <expected behaviour>
Hints: <page, role, test tenant, suspicions>
Board: <approved board name and date> | no UI
Acceptance: <criterion; a test that must be green>

## F2 Analysis: <title>
Problem: ...
Expected: Only investigate, prove the cause, change nothing. Deliver a fix proposal with acceptance criteria.

Run this pack by the repo skill foreman-fixpack: check or create the batch branch, respect the lock, write ORDER.md and STATE.md, write a test that fails first for every fix, one commit per fix, analyses only investigate; a blocked item does not stop the pack. End with the report. Never push to main or prod. Never touch production tenants or data.
```

**Analysis items:** "only investigate, prove the cause, change nothing". Prove causality; make no fix on suspicion. A fix follows only after the analysis, as its own item or pack, with a minimal change.

Describe observed and expected behaviour. Do not invent function or library names.

Continue order: same header and only "Continue fix pack <id>."

## Urgent production bug

Header with `Urgent: yes`, `Target: main`, own branch. Replace the closing paragraph with: "Own branch, push, open a PR to `main`. Do not merge, do not deploy." The merge happens only after the human approves. Release timing for urgent fixes follows `foreman-release`.

## Rules

- Verify only against the test tenant. Never use a production tenant or real data as target or test case.
- All items of a pack go to the same batch branch.
- No UI without an approved board.
- Merge to `main` only on "batch PR main"; to `prod` only by a release order on release day. A batch run merges `batch/dev → dev` itself. Merge only with a merge commit.
- Do not create, change or delete routines or the dispatcher configuration unless the human asks.
- An intervention in a pack needs the explanation comment (question in one sentence, options A/B/C with consequences, recommendation, report link, answer route). When a report shows `needs-input` without it, say so; the step is not complete.
- If a fix stays open or red: name the cause and propose a follow-up item for the next pack. Do not change code yourself.
- The chat writes `STATE.md` and brief files. Tracker statuses are written by the mirror script only.

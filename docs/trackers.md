# Trackers

The tracker is a mirror for people (phone, overview) and the place for answers and approvals. `STATE.md` stays the only source of truth. The module is chosen at install time and recorded in `.foreman.json` `modules`.

| Module | Tracker | Needs |
|---|---|---|
| `tracker-itsaplan` (recommended) | [itsaplan](https://github.com/croffasia/itsaplan), self-hosted, REST | `ITSAPLAN_URL`, `ITSAPLAN_API_KEY` of a dedicated bot account, optional `ITSAPLAN_WEB_URL`; `mirror.itsaplan.projectKey` in `.foreman.json` |
| `tracker-linear` | Linear, no sub-issues | `LINEAR_API_KEY` of a bot user; `mirror.linear` in `.foreman.json` |
| none | files in the repo | nothing |

## Mapping

| Unit status | Column | Phase label |
|---|---|---|
| `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack` | In Progress | `AP: Coding` (`AP: Fix round` for a fix pack after a pretest) |
| `needs-input` | Action Required (alias Intervention needed) | `AP: Action Required` |
| `awaiting-merge` | Wait for Merge | `AP: Waiting for merge` |
| `pretest-waiting`, `pretest-running` | Testing | `AP: Pretest waiting`, `AP: Pretest running` |
| `uat-ready` | In Review | `AP: UAT ready` |
| `release-ready` | In Review | `AP: Release ready` |
| `done` | Done | none |

New projects are created from the template file `itsaplan-project-template.json` that ships with the foreman plugin (skill `foreman-setup`, folder `references`) (`foreman-setup` imports it once per workspace; `foreman-project` creates the project from it). The one manual step is adding the bot account as a member. A template does not change existing projects. The mirror reports a missing column or label instead of guessing. Other column names: `.foreman.json` `tracker.columnAliases`, for example `{ "Action Required": ["<your column>"] }`. Title of a ticket: `[<unit>] <title>`. The mirror prints the ticket ID of a new ticket; the run writes it into `Tracker:` of `STATE.md`.

**Name check.** `scripts/check-config.sh` reads the columns and labels of the project (it needs `ITSAPLAN_URL`, `ITSAPLAN_API_KEY` and `mirror.itsaplan.projectKey`). The check reports each expected English column or label that is missing, each column or label with a German-looking name (naming the English name where it is known), and each unknown label with the `AP: ` prefix. Extra English names such as Bug or Canceled are fine. Without the variables it prints a note and passes.

## Answers and approvals per tracker

| | itsaplan | Linear | none |
|---|---|---|---|
| Answer to an intervention | comment starting with `Answer <unit>:` | same | file `docs/answers/<unit>.md` with a line `Answer <unit>: ...`, or a chat payload |
| UAT approval | all points of the list `UAT · since <time>` ticked, or comment `UAT <unit> approved` | comment `UAT <unit> approved` | file `docs/uat/<unit>.md`: all points ticked or a line `UAT <unit> approved` |

Rules that hold everywhere: an answer or approval counts only when it is newer than the question or the start of the UAT round; comments of the bot account never count; for files the time is that of the last commit of the file, so commit and push after editing.

Without a tracker the same flow works through the repo: the question is in `STATE.md` ("Open question") and the report; the human answers in `docs/answers/<unit>.md` and approves in `docs/uat/<unit>.md` (or sends the payload from chat).

## Intervention

A unit in `needs-input` is visible in the tracker only when its ticket explains it. The mirror moves the ticket to Action Required and writes one comment from the "Open question" section of `STATE.md`: the question in one sentence, options A/B/C with their consequences, a recommendation, a link to the report and the way to answer. Without that comment the step counts as not finished: `node scripts/state-mirror.mjs --check` exits 1 until it exists. With tracker none the check fails when `STATE.md` has no question.

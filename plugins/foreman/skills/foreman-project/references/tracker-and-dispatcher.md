# Tracker project and dispatcher entry

Read when you reach steps 6 and 7.

## Tracker: itsaplan

- One project per product, created from `itsaplan-project-template.json` (8 columns, 10 labels, view "UAT ready").
- Bot account: its own API key, added as a member of the project. This is the one manual step. Comments by the bot never count as the human's answer.
- A template does not change projects that already exist.
- Variables: `ITSAPLAN_URL`, `ITSAPLAN_WEB_URL`, `ITSAPLAN_API_KEY`.
- `node scripts/state-mirror.mjs` writes tickets and statuses from `STATE.md` (`--dry-run` first, `--check` after approvals). You never create or move tickets by hand. If the mirror reports a ticket id, it goes into `Tracker:` of the unit.

## Tracker: linear

- Team named after the project. One project per version: `<Project> 0.N.0 - <short name> (dev)`; `<Project> 0.N.x - Fixes (main)` from the first release of that version.
- Label groups: Version, Kind (milestone, fix pack), Phase (`AP: ...`).
- One ticket per unit, no sub-issues; slices and fix items as a checklist in the description.
- Statuses: `Backlog`, `Todo`, `In Progress`, `Wait for Merge`, `Testing`, `In Review`, `Done`, `Canceled`. New tickets are created with `Todo`. The Linear tool cannot create statuses; tell the human the missing ones (Team, Settings, Workflow).
- Variable: `LINEAR_API_KEY`.

## Tracker: none

`STATE.md` and files in the repo are the whole record.

- Question to the human: a comment file `docs/answers/<unit>.md` with a line `Answer <unit>: <decision>` is the reply (or the same text as a payload).
- UAT approval: the line `UAT <unit> approved` in `docs/uat/<unit>.md`, which also holds the checklist. A checklist with every item ticked counts as approval too.

## Dispatcher entry (Autopilot)

The dispatcher runs on the human's machine (`dispatcher/` in the foreman repo) and costs no model tokens. Every 10 minutes per enabled project it fetches the repo with a read-only deploy key, runs `scripts/autopilot-check.sh`, and for each `TASK` line (at most `max_tasks` per run for this project, one per unit, and none within `cooldown_minutes` of its last start) starts a work run with the prompt block that belongs to it. Limits and their recommendations: `dispatcher/README.md`, Limits.

Entry in `config.json` per project: `repo`, `branch` (usually `dev`), the check command, `fire_url_env`, `fire_token_env`, `enabled`, `max_tasks`, `cooldown_minutes`. For other agents use `fire_command` instead (the prompt arrives on stdin, for example `opencode run`); resuming and parallel runs are then up to the human.

Steps for the human:

1. Create the work-run routine with an API trigger (routines UI or a Claude Code session in the cloud environment). Environment: the project repo, network to the worker provider and the tracker, the project's variables.
2. Generate the token in the UI. It is shown once. Put URL and token into `dispatcher.env` under the names in `config.json`.
3. Add the read-only deploy key to the repo.
4. Ask for the limits: `max_tasks` for this project, `cooldown_minutes`, and `max_tasks_cap` only if the human wants more than 3 starts per run. Each with the recommendation from `dispatcher/README.md` (Limits). Write the answers into the entry; never keep the example values without asking.
5. `dispatch.sh --dry-run`: the `TASK` lines match the units you expect, the `limits` line shows the chosen values, no `not set, default used` line appears, and no token appears in the log.
6. Enable the timer.

Smoke test: fire the work run with the text "smoke test"; success is "smoke test ok".

Fix pack: 2026-11-23-dispatcher-limits

Target: dev
Milestone: -
Batch-branch: batch/dev
Urgent: no
Fix-pack: 2026-11-23-dispatcher-limits

(The order text is shortened and made neutral: the repository is public, so names of the reporting project, its machine and its units are left out.)

## Report from a user project

The dispatcher limits work on three levels:

| Level | Where | Value | Effect |
|---|---|---|---|
| Hard cap | `HARD_MAX_TASKS` in `dispatcher/dispatch.mjs` | 3 | Never more than 3 starts per project and run. The config cannot raise it. |
| Per project | `projects[].max_tasks` in `config.json` | 3 | Only lowers the limit. Missing: 3. |
| Cooldown | `cooldown_minutes` in `config.json`, top level | 180 in the user's file, code default 45 | A unit starts at most once within that time, whatever the kind of task. One value for all projects. |

Plus one rule: at most one task per unit per run. Skipped tasks (`limit reached`, `fired recently`) stay and are picked again next run.

Effect seen: several pretest runs fill the limit of 3, and the cooldown blocks a follow-up task for a unit although its pretest finished early. A pretest run takes about 20 to 90 minutes, so 180 is generous. More than 3 starts per run only works by changing `HARD_MAX_TASKS`, and a local code change is overwritten by the next update.

Wish from the human: the limits must be asked for during setup. Today the setup silently sets defaults.

## F1 Analysis: where do the defaults come from, what should change

Prove the cause (which file or step sets the defaults, which step asks nothing). Decide, with a recommendation for the UAT:
- Setup and project start ask `max_tasks` per project and `cooldown_minutes`, with a recommendation and a short explanation.
- The update (dry run) shows missing or default values as a question.
- Should the hard cap become configurable (config value with a safe maximum)? Should the cooldown be per project?

## F2 Fix: dispatcher limits from the config

Acceptance: cap and cooldown come from the config with safe bounds; the dry run prints the effective limits per project and names every value that falls back to a default; tests red before, green after.

## F3 Fix: setup, project start and update ask for the limits

Acceptance: `foreman-setup`, `foreman-project` and `foreman-update` tell the agent to ask for `max_tasks`, `cooldown_minutes` (and the cap only with a reason), with a recommendation each; README, config example and changelog describe the new keys; the docs test names them.

## Rules

Neutral wording in all repo files. Merge the batch PR to `dev` when all gates are green. `main`, tag and release only on the human's go. A release 0.2.5 is pending; this change may go in it.

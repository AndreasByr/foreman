# Principles

foreman is a way of working with Claude on software projects, packaged so it can be installed into any repo. It came out of running one product (a multi-tenant SaaS, one developer) through several releases with agents doing almost all of the coding.

## 1. Plan expensive, execute cheap

The session model thinks, plans and accepts. Cheaper workers read code and write it. A wrapper (`tools/delegate/run_task.py`) starts each worker as a separate `claude -p` process with a role; `config.toml` maps roles to models. Workers can be Claude models (subscription), Ollama Cloud models, or models behind your own gateway (ChatGPT subscription through LiteLLM). No Anthropic API key is used.

- The session never trusts a worker's own report. It reads the diff and runs the checks itself.
- The session codes itself only after every escalation step has failed (exit code 1).
- Models are set only in `config.toml`, with exact IDs. A task without a role is rejected.

## 2. Roles with forbidden actions

Each step of the lifecycle has an owner and a list of things it must not do.

| Role | Owns | Must not |
|---|---|---|
| Human | idea, decisions, UAT, release approval, version number | – |
| Chat (claude.ai) | roast, requirements, roadmap, design, briefs, fix orders | write code, push |
| Session (Claude Code) | plan slices, write task files, accept, commit, push to batch branches | push to `main`/`prod`, merge to `main`/`prod` without an order, deploy |
| Worker | research, code | use git, delete files, reach the network, change the plan |
| Pretest (a step of the work run) | test flows in a browser, review the app in five roles | change code, use a production tenant, automate a real user account |
| Dispatcher | choose and start work runs | work on a unit, call a model |

## 3. Hand off through files

Work moves between roles as files in the repo, not as chat text: brief (`Mnnn-CONTEXT.md`), state (`STATE.md`), task files, agent reports. Every handoff is git-tracked, so a fresh run can pick up where the last one stopped.

## 4. One source of truth

`STATE.md` holds the status of each unit. A tracker (itsaplan or Linear) is an optional mirror, written by a script that reads `STATE.md`; without one, answers and approvals are files in the repo. A model never sets a tracker status by hand. If a tracker disagrees with `STATE.md`, `STATE.md` wins.

When several runs update four places one by one, sooner or later one of them gets skipped. The script updates all of them from the same file every time.

## 5. Check mechanically before you review

Acceptance runs in this order and stops at the first red:

1. Scope check: the diff touches only files the task or brief names.
2. Tests, typecheck, lint.
3. A test that was red before the fix and green after it.
4. Only then: the `validation` role reviews the diff.

A security finding (secrets, permissions, tenant isolation) escalates to `needs-input` after the first failed rework. Other findings get three rounds.

## 6. No model where a script will do

Choosing the next unit is arithmetic on files, comments and the clock. A script does it (`scripts/autopilot-check.sh`) and a dispatcher without a model fires the work runs. Letting a small model compute timestamps, locks and statuses was unreliable and cost tokens every hour. Models do the work; scripts decide when.

## 7. An intervention explains itself

A unit that waits for the human is only visible when its ticket says what is needed. Moving the card to "Action Required" is not enough: the same run writes the question, the options with their consequences, a recommendation, the report link and the way to answer. The reconcile check fails without that comment.

## 8. Merge in batches

Agents push finished work to a batch branch (`batch/dev`, `batch/main`, `batch/mNNN`) and set the unit to `awaiting-merge`. A batch run merges everything waiting in fixed windows (default every 4 hours). One PR per window saves CI minutes and deploys.

## 9. The human tests when they want to

UAT depends on the human's day. foreman never stops new work because UAT is piling up. It keeps the UAT list ready: everything an agent can test itself (automated tests, API calls, browser flows) is tested before a unit reaches `uat-ready`. Only what needs a real second account, real hardware or a product decision goes to the human.

## 10. Small fixed load, details on demand

Every run pays for what it loads before it starts. So:

- `CLAUDE.md` is about 2 KB of rules.
- A hook injects only the short core of the delegation skill.
- Skills are split into a core and `references/` parts that a run reads only when the case comes up.
- Hooks that set up a dev environment exit early for runs that do not code (`AUTOPILOT_ROLE=delegation`, used by the Plan B routine).
- Worker task and result files are git-ignored; only the agent report stays in the repo.
- In chat, a subagent is worth it only for big mechanical work (more than ~20 pages of input, more than ~5 tool calls, or independent parallel parts). A subagent costs a large fixed overhead to start.

## 11. Learn, then shorten

After every UAT approval, the run writes what went wrong into `docs/learnings.md` and proposes which skill rule becomes shorter or clearer. Skills hold rules, and the stories behind them go to learnings. If a skill grows with every incident, move the stories out.

## 12. Guard rails in code

A model can skip an instruction; it cannot skip a hook. Deny rules and a PreToolUse guard with its own tests block pushes to `main`/`prod`, force pushes and remote deletions. The same checks run as `.githooks/pre-push`, so agents without Claude hooks are covered too. A CI check rejects `opusplan`, because autonomous runs never enter plan mode and then run on the smaller model.

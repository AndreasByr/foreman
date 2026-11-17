# Delegation: roles, model distribution, coding order

Read this before proposing the model distribution, writing delegation rules into the repo, or changing them. Source of truth in the repo: `tools/delegate/config.toml`. Model names appear there and nowhere else.

## Roles

| Who | Role | Task |
|---|---|---|
| Session | `discuss`, `uat` | understand the order, split it into tasks, write task files, accept results (read the diff, run the tests itself) |
| Worker, read-only | `planning`, `validation` | draft a plan for a large order; review a diff after mechanical checks are green |
| Worker, read-only | `research` | explore the codebase, answer a question |
| Worker | `execution_simple`, `execution` | write code, change files |
| Worker | `completion`, `subagent` | short follow-up work, partial steps, never code changes |

## 4a. Model distribution

Propose a distribution by role. Fill in the exact model per row only after the version check below.

**Template (roles only):**

| Role | Tier | Provider | Note |
|---|---|---|---|
| `research` | cheap | worker provider | read-only |
| `planning`, `validation` | strongest | Claude | read-only |
| `execution` | strong | Claude | complex changes |
| `execution_simple` | cheap | worker provider | small, well-defined changes only |
| `completion`, `subagent` | cheap | worker provider | never code |
| `discuss`, `uat` | session model | session | |
| fallback when the worker provider fails (key, limit, network, timeout) | cheapest Claude | Claude | automatic, one retry |

Worker provider: Ollama Cloud with module `ollama`, otherwise Claude models via `claude -p`.

Escalation chain: `execution_simple`, `completion` and `subagent` escalate to `execution`; then exit code 1 (the session takes over).

Sessions and routines: delegation run on the cheapest Claude tier, work run and pretest on the strongest tier, repo sessions on the strongest tier. Never `opusplan`: autonomous runs do not enter plan mode and would quietly run on the smaller model.

Models for product features (for example an AI chat inside the project) are set by the human only.

**Check for newer versions, before creating and at every change of the distribution:**

1. Fetch the worker provider's model list (Ollama Cloud: `ollama.com/search?c=cloud`) and the Anthropic model list (`docs.claude.com`).
2. For each model chosen, check whether a newer version exists in the same family.
3. Show the human the table with the proposals. The human decides per row. Without an answer: the newest version of the same family.
4. Write exact model IDs into `config.toml` and the routines. No aliases that change silently.

## Rules for orchestrating (copy verbatim into `CLAUDE.md`, the delegation skill and the dispatch-run skill)

- Every task file names a `role`. The model is set only by `config.toml`, never by the Agent, the task or a prompt. A task without `role` makes the wrapper exit with code 2 instead of using a default.
- Code changes run through `execution_simple` (only tasks the delegation skill defines as simple) or `execution`. Never `completion` or `subagent` for code changes: a cheap worker doing coding drains its quota fast.
- The closing report names role and the model actually used per task. A deviation from `config.toml` is reported as a finding.

## Order of a coding task

1. Check prerequisites: provider key set (module `ollama`) and `claude` CLI present. If something is missing: stop and report. Do not code yourself.
2. Delegate research: if planning needs more than one or two targeted reads, write the question as a task with `role: research`. Reading a few files to cut a task is fine.
3. Plan: split into small, independent tasks. Each names affected files, expected behavior, edge cases and a `verify` command (tests, typecheck, lint). Run the `verify` command once yourself first; a broken command costs an escalation step.
4. Write tasks as `tools/delegate/tasks/NNN-name.md` (header: `role` required, `verify` optional).
5. Run: `python3 tools/delegate/run_task.py tools/delegate/tasks/NNN-name.md`. The wrapper escalates along the chain in `config.toml`.
6. Accept without believing the worker's report, in this order, stopping at the first red: scope check (the diff touches only files the task or brief names; workers like to leave helper files), tests/typecheck/lint, a test that was red before the fix and green after it, then `validation`. On defects, delegate a new, more precise task. Do not patch it yourself.
7. A security finding (secrets, permissions, tenant isolation) becomes `needs-input` after the first failed rework. Other findings get three rounds.
8. Exit code 1 means every step failed. Only then does the session code itself.
9. The session commits and pushes. Workers never.

## What the session does not do

- No Claude subagents (the `Agent` tool) for research or coding in the repo; they bypass the split. Parallel work: several wrapper calls.
- No code changes itself, except after exit code 1, in task files, config and wrapper, or merge conflicts.
- Never touch or test against production tenants or data.

## Git rules

- Push targets: `dev`, a batch branch (`batch/...`) or the given work branch (`agent/...`). Never `main` or `prod`.
- PRs, merges, tags, releases, branch deletions and starting workflows or deploys only when the human says so in the session (with autopilot: the exceptions in `references/autopilot.md`). Finished work is not an order for them: say where it is and ask.
- Before every push check `git rev-parse --abbrev-ref HEAD` and the target in the command. `main` or `prod`: abort.
- No force push, no deletion without approval.
- A release means: push `dev` finished, wait for CI, tell the human that the deploy starts separately.

## Closing report

What was done, which roles and models took part (including escalations), what was checked, which branch was pushed. On escalation up to the session: why.

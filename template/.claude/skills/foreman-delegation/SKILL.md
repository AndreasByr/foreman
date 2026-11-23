---
name: foreman-delegation
description: How every coding order in {{PROJECT_NAME}} is done. Load for any code change, codebase research, git push, merge, branch or deploy topic. The session plans and accepts, workers research and code through tools/delegate.
---

## Core

1. The session plans and accepts. Workers research and code via `python3 tools/delegate/run_task.py tools/delegate/tasks/<ID>-name.md`. No `Agent` subagents for research or coding (only exception: wrapper exit 5, see below); parallel work = several wrapper calls.
2. Every task file has `role:` in its front matter (`verify:` optional). Models are set only in `tools/delegate/config.toml`. Default start role: `execution_simple`.
3. Run the `verify` command yourself once before delegating.
4. Never trust a worker's report: read the diff and run the checks yourself, in the order of "Acceptance order". Stop at the first red.
5. Push targets and orders (PR, merge, tag, deploy, branch deletion): section "Git rules" below.
6. Before every push: `git rev-parse --abbrev-ref HEAD` and read the target. `main` or `prod` = abort.

Details below. Read them when a case comes up.

## Worker rules

- **Model ID rule:** model IDs are exact (no aliases) for the session and for direct providers (`claude/<id>`, `ollama/<id>`); gateway roles use the `task-*` aliases; they are written only in `tools/delegate/config.toml`.
- **Claude-dir rule:** workers do not write under `.claude/` (the session changes skills, hooks, settings).
- **Key-file rule:** workers do not read key files (`.env*`, `*.pem`, `id_*`, `credentials*`); only existence and permissions.

## Roles

| Role | Writes code | Use |
|---|---|---|
| `discuss`, `uat` | no | the session itself: talks to the human, accepts results |
| `research` | no | answer a codebase question; any lookup beyond one or two reads |
| `planning` | no | plan for a large or unclear order (draft; the session reviews and cuts tasks) |
| `validation` | no | review a diff after mechanical checks are green |
| `execution` | yes | complex change; escalation step |
| `execution_simple` | yes | small, well-defined change; start role |
| `completion`, `subagent` | no | short follow-up work, never code |

**Complex** (start with `execution`, say why in the report): more than about 3 files across modules, schema or migration, auth/permissions, new architecture or dependency, or the task cannot be described precisely. Everything else starts with `execution_simple`; the wrapper escalates by itself.

**Module ollama:** simple roles run on Ollama Cloud. On an API failure the wrapper repeats the role with the `config.toml` fallback model and notes it (no escalation, no reason to code yourself). A red `verify` escalates normally.

## Workflow of a coding order

1. Check `command -v claude`. Missing: stop and report. Module ollama: also check `OLLAMA_API_KEY`; if unset, say in the report that the fallback ran.
2. Research: more than one or two targeted reads means a task with `role: research`.
3. Plan. Simple: the session cuts tasks itself. Complex: research task, then `role: planning` task with the findings and the order, then review the plan critically (spot-check findings) and cut the tasks. The wrapper does not chain tasks; the session hands results on.
4. Cut small, independent tasks. Each names: files, expected behavior, edge cases, a `verify` command.
5. Write task files to `tools/delegate/tasks/<ID>-name.md`. Never compute "next free number". Create the ID with `echo "$(date -u +%Y%m%d-%H%M%S)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"` (parallel sessions would clash on numbers).
6. Run the wrapper. Task and result files are git-ignored.
7. Accept (below). Defects: write a sharper task and delegate again; do not patch by hand.
8. Commit and push yourself. Workers must not use git.

## Task file format

```markdown
---
role: execution_simple        # required; a task without role is rejected (exit 2)
verify: pnpm test path/to/file   # optional; exit 0 = done
---
Goal in one sentence.

Files: path/a, path/b
Expected behavior: ...
Edge cases: ...
Library and version (if relevant): ...
```

Describe what, not how. Put the diff into a `validation` task, because workers have no git.

## Wrapper exit codes

| Code | Meaning | Do |
|---|---|---|
| 0 | done, `verify` green | accept (below) |
| 1 | every escalation step failed | code it yourself, mention it in the report |
| 2 | call or config error (for example no `role`) | fix the task file or config |
| 3 | prerequisite missing (CLI, key without fallback) | stop and report |
| 4 | `verify` command not runnable, no worker started | fix the `verify` command, run it once yourself |
| 5 | Claude workers cannot log in ("Not logged in") | hand the same task file to a subagent of this session (Agent tool, the role's model from `config.toml`, foreground); the only allowed use of Claude subagents for coding. Note it in the report; if it repeats, set `claude_login = "inherit"` in `config.toml` |

A `## Findings` section in the result (file changed outside `files:`, or a readonly role changed a file) is red even with exit code 0.

## Acceptance order

1. **Scope check:** `git diff --stat` touches only files the task or brief names. Remove helper files workers leave.
2. **Mechanical:** tests, typecheck, lint; run the production build when app code changed. Run them yourself.
3. **Red-then-green:** every fix has an automatic test that failed before the change and passes after it. Record both runs with commit SHA. No such test = not done.
4. **UI:** check the rendered output (local screenshot or component render) against the design board, not only the typecheck. A strong deviation (other structure, missing or extra elements) means not done: `blocked` with the deviation as the question (unit `needs-input`).
5. **`validation`:** only now, with the diff and the sources in the task. Review gate below.
6. Flaky tests (red then green without code change): record in `docs/flaky-tests.md`, report as own item, never skip or weaken.
7. **State gate:** before every report and PR, `STATE.md` is current (status, branch, PR, next step) and in the PR. CI checks it.

**Review gate:** the `validation` verdict must be `pass` with no finding of medium or higher; `needs-attention` and `needs-remediation` block, no "continue with a note". Rework and review again, at most 2 rounds; a security finding escalates after the first failed rework. Still open: unit `needs-input` with the finding as the question, never `awaiting-merge`, `pretest-waiting` or a batch PR. Low findings may stay open and go into the report.

**Hand nothing on:** what the session can check it checks itself in this unit; only what needs a real second account or a product decision goes to UAT. Nothing is "temporarily" blocked, hidden or disabled until someone tests; a needed test is built in this unit, else the step is `blocked` with the concrete question (unit `needs-input`).

**Evidence rule:** every "done" names command, exit code and commit SHA (git rev-parse --short HEAD). Without all three it counts as open. A command that fails for technical reasons is an open point, never "done".

## Git rules

- Push targets: `dev`, `batch/main`, `batch/dev`, `batch/mNNN`, or the assigned `agent/*` branch. Never `main` or `prod`.
- Start check before work on `dev`: `git fetch origin main dev`; `git rev-list --count origin/dev..origin/main` must be `0`. Otherwise merge `main` into `dev` first. Fixes for `main` start from a fresh `origin/main`.
- Migrations on sync: the ones from `main` stay unchanged (never rename, edit or delete). The ones from `dev` are re-ordered to sort after the newest migration from `main`, and `up` stays idempotent.
- No force push. Delete nothing the human did not approve, except your own finished work branch (see `foreman-batch`).
- Before a push to a batch branch or `dev`, run the production build when `app/`, `server/`, `shared/` or the build config changed; typecheck and unit tests miss bundling errors.
- No PR, merge, tag, deploy or branch deletion without an explicit order in this session (the batch and release skills define the orders). Without an order, say where the work lies and ask whether a PR is wanted; "Finish the work" is not an order.
- **After-merge step** (manual threads too): `STATE.md` to its next status, pushed; with a tracker `node scripts/state-mirror.mjs`, then `--check` (exit 0, no `SKIP` line); only then close the thread.

## Closing report

What was done, roles involved (escalations, fallbacks), what you checked with evidence, branch pushed to, what stays open. Changelog lines (New, Improved, Fixed) for user-visible changes go in the report, not in a file per slice. Write it to `docs/agent-reports/<YYYY-MM-DD>-<slug>.md`, section "Learned": real, reusable findings or "nothing new".

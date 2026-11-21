---
name: foreman-delegation
description: How every coding order in foreman is done. Load for any code change, codebase research, git push, merge, branch or deploy topic. The session plans and accepts, workers research and code through tools/delegate.
---

## Core

1. The session plans and accepts. Workers research and code via `python3 tools/delegate/run_task.py tools/delegate/tasks/<ID>-name.md`. No `Agent` subagents for research or coding (only exception: wrapper exit 5, see below); parallel work = several wrapper calls.
2. Every task file has `role:` in its front matter (`verify:` optional). Models are set only in `tools/delegate/config.toml`. Default start role: `execution_simple`.
3. Run the `verify` command yourself once before delegating.
4. Never trust a worker's report. Read the diff and run the checks yourself. Order: scope check, tests/typecheck/lint, red-then-green test, then role `validation`. Stop at the first red.
5. Exit code 1 from the wrapper = all steps failed; only then code it yourself.
6. Push only to `dev`, `batch/*` or your `agent/*` branch. Never to `main` or `prod`. No force push. No PR, merge, tag, deploy or branch deletion without an explicit order in this session (batch and release skills define the orders).
7. Before every push: `git rev-parse --abbrev-ref HEAD` and read the target. `main` or `prod` = abort.
8. Never touch production tenants or data. Test only against `<test-tenant>`.
9. A security finding (secrets, permissions, tenant isolation) goes to `needs-input` after the first failed rework.

Details below. Read them when a case comes up.

## Worker rules

- **Model ID rule:** model IDs are exact (no aliases) for the session and for direct providers (`claude/<id>`, `ollama/<id>`); gateway roles use the `task-*` aliases; they are written only in `tools/delegate/config.toml`.
- **Claude-dir rule:** workers do not write under `.claude/` (skills, hooks and settings are changed by the session only).
- **Key-file rule:** workers do not read key files (`.env*`, `*.pem`, `id_*`, `credentials*`); they may check only their existence and permissions.

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

**Module ollama:** simple roles run on Ollama Cloud. If the Ollama API fails, the wrapper repeats the role with the fallback model from `config.toml` and notes it in the result. That is not an escalation and not a reason to code yourself. A task that fails on content (`verify` red) escalates normally.

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
| 5 | Claude workers cannot log in ("Not logged in") | hand the same task file to a subagent of this session (Agent tool, model of the role from `config.toml`, foreground). This is the only allowed use of Claude subagents for coding. Note it in the report; if it repeats, set `claude_login = "inherit"` in `config.toml` |

A `## Findings` section in the result (file changed outside `files:`, or a readonly role changed a file) is red even with exit code 0.

## Acceptance order

1. **Scope check:** `git diff --stat` touches only files the task or brief names. Remove helper files workers leave.
2. **Mechanical:** tests, typecheck, lint; run the production build when app code changed. Run them yourself.
3. **Red-then-green:** every fix has an automatic test that failed before the change and passes after it. Record both runs with commit SHA. No such test = not done.
4. **UI:** check the rendered output (local screenshot or component render) against the design board, not only the typecheck.
5. **`validation`:** only now, with the diff and the sources in the task. `needs-attention`, `needs-remediation` or findings of medium or higher block completion. Rework and review again, at most 2 rounds. A security finding escalates after the first failed rework. Still open: unit becomes `needs-input`, never `awaiting-merge`.
6. Flaky tests (red then green without code change): record in `docs/flaky-tests.md`, report as own item, never skip or weaken.

Evidence rule: every "done" names command, exit code and commit SHA. Without all three it counts as open.

## Git rules

- Push targets: `dev`, `batch/main`, `batch/dev`, `batch/mNNN`, or the assigned `agent/*` branch. Never `main` or `prod`.
- Start check before work on `dev`: `git fetch origin main dev`; `git rev-list --count origin/dev..origin/main` must be `0`. Otherwise merge `main` into `dev` first. An open "main to dev (conflict)" PR comes before new work. Fixes for `main` start from a fresh `origin/main`.
- Migrations on sync: the ones from `main` stay unchanged (never rename, edit or delete). The ones from `dev` are re-ordered to sort after the newest migration from `main`, and `up` stays idempotent.
- No force push. Delete nothing the human did not approve, except your own finished work branch (see `foreman-batch`).
- Before a push to a batch branch or `dev`, run the production build when `app/`, `server/`, `shared/` or the build config changed; typecheck and unit tests miss bundling errors.
- Without an order, say where the work lies and ask whether a PR is wanted. "Finish the work" is not an order.

## Closing report

Short: what was done, which roles took part (including escalations and fallbacks), what you checked with evidence, which branch you pushed to, what stays open. For code changes visible to users, note changelog lines (New, Improved, Fixed) in the report; do not write a changelog file per slice. Write the report to `docs/agent-reports/<YYYY-MM-DD>-<slug>.md`, section "Learned": real, reusable findings or "nothing new".

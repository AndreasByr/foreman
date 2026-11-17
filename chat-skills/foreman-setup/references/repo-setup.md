# Repo setup, environment and dispatcher

Read for scope "repo workflow" and "full autopilot".

## Installing

Do not list the files one by one. foreman ships `install.sh`:

```
./install.sh <target-repo> --project <slug> [--modules ollama,linear,notion,autopilot] [--no-staging] [--force]
```

- With a shell and the target repo available: run it yourself.
- Otherwise: give the human the exact command with scope and modules filled in, and wait for the result.

It writes `.foreman.json` (modules, version) and installs `CLAUDE.md`, `.claude/settings.json`, hooks, the repo skills (`foreman-delegation`, `foreman-milestone`, `foreman-fixpack`, `foreman-dispatch-run`, `foreman-batch`, `foreman-deploy`), `tools/delegate/`, `scripts/`, `docs/` templates and the CI guard workflow. Project documents (`requirements.md`, roadmaps, `design.md`) go under `docs/`, not in the root.

After install, check and fix by hand only these:

- Branches: `main` and `dev` exist; with staging and production separated, also `prod`; with autopilot, also `batch/dev` and `batch/main`.
- `tools/delegate/config.toml` holds the confirmed table from `references/delegation.md`, with exact model IDs.
- `CLAUDE.md` carries the `Workflow: docs | repo | autopilot` line and, with a tracker, `Linear: <team>`.
- Design and text skills the human wants (for example a design skill and a writing-style skill) are copied from the human's skills into `.claude/skills/`. If they do not exist there: ask, do not rebuild them. In `CLAUDE.md`: for UI read the design skills; every visible text follows the writing skill; in a conflict the human's base rules and `design.md` win.
- A disabled-state suggestion from a design skill is overridden by the project rule: keep buttons clickable, show a loading state with `aria-busy`, ignore repeat clicks in the handler.

## What the installed guards guarantee

| Trigger | Effect | Guarantee |
|---|---|---|
| Session start (start, resume, clear, compact) | hook injects the short core of the delegation skill | certain |
| Every session | `CLAUDE.md` loads and names the core rules | certain |
| Coding or push topic | the session loads the full skill from its description | likely |
| Task without `role` | wrapper exits with code 2 | enforced |
| `git push` to `main`/`prod`, force push, remote branch deletion | deny rule and PreToolUse guard block it | enforced |

Limits: the deny rule covers `git push` in the shell tool only. Through GitHub MCP write tools only the instruction protects; block those tools too. A session applies the rules only once it clones `dev` or a branch of it.

## Environment and dispatcher

1. Create a cloud environment with the repo. Network allows the worker provider's host (module `ollama`: `ollama.com`) and the key goes in as an API credential. Never share the key in chat.
2. **Routines must be created from a Claude Code session in the cloud environment (via `create_trigger`), or in the web UI under claude.ai/code/routines. Never from a chat.** A `create_trigger` from a chat session (claude.ai chat or project chat, even with a shell and the repo) creates a routine without the cloud environment: no worker key, no network to the provider. Only routines made from the cloud environment inherit it, and only those can chat fire with `fire_trigger`.

   Before creating, check in the current session: `[ -n "$OLLAMA_API_KEY" ]` (module `ollama`) and that the provider host is reachable. If a check fails, the session is the wrong one. Do not create the dispatcher. Instead:
   - put the dispatcher prompt in the repo as `docs/routines/<name>.md` (the installer provides them),
   - put the smoke-test order next to it as `docs/routines/smoke-test.md`,
   - give the human a short order for a **new Claude Code session in the cloud environment** (claude.ai/code, pick repo and environment): "Read `docs/routines/delegation.md` on `dev`, create the dispatcher with `create_trigger` (name, schedule, push), then `fire_trigger` with the text from `docs/routines/smoke-test.md`."
   The browser pretest needs no cloud environment (it runs on the human's machine) and may be created from chat.
3. **Scope "repo workflow":** a dispatcher without schedule. Prompt: "Run the order from the routine-fire-payload block. Without a payload: do nothing and report. If the repo is missing, add it with add_repo and clone it. Work by `CLAUDE.md` and the delegation skill. If the worker key is missing: stop and report. Report in `docs/agent-reports/<date>-<slug>.md` on the work branch, never `main`. No PRs, no merge, no deploy." The prompt must mention the payload block explicitly.
4. **Scope "full autopilot":** the three routines from `references/autopilot.md` instead.
5. Smoke test: "Read package.json, name the project and framework version, change nothing." Success: a worker ran with the role and model from `config.toml`, and the report is in the repo.

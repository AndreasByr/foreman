# Delegation: roles and model distribution

Applies to the `delegate` module. Source of truth in the repo: `tools/delegate/config.toml`. Model names appear there and nowhere else. Without the module, workers are Claude models called through `claude -p`.

## Roles

| Who | Role | Task |
|---|---|---|
| Session | `discuss`, `uat` | understand the order, split it, write task files, accept results (read the diff, run tests itself) |
| Worker, read-only | `planning`, `validation` | draft a plan for a large order; review a diff after mechanical checks are green |
| Worker, read-only | `research` | explore the codebase, answer a question |
| Worker | `execution_simple`, `execution` | write code |
| Worker | `completion`, `subagent` | short follow-up work, never code changes |

With the `gateway` module the same work is routed by the proxy roles `task-simple`, `task-research`, `task-normal`, `task-complex`, `task-testing`. The gateway is a second backend type next to Ollama direct in `config.toml`.

## Model distribution

Propose by role, fill exact models only after the version check.

| Role | Tier | Provider | Note |
|---|---|---|---|
| `research` | cheap | worker provider | read-only |
| `planning`, `validation` | strongest | Claude | read-only |
| `execution` | strong | Claude | complex changes |
| `execution_simple` | cheap | worker provider | small, well-defined changes only |
| `completion`, `subagent` | cheap | worker provider | never code |
| `discuss`, `uat` | session model | session | |
| fallback when the provider fails (key, limit, network, timeout) | cheapest Claude | Claude | automatic, one retry |

Worker provider: Ollama Cloud (`OLLAMA_API_KEY`), the gateway, or Claude only.

Escalation: `execution_simple`, `completion`, `subagent` escalate to `execution`; then exit code 1 and the session takes over.

Sessions and routines: work run and pretest on the strongest tier, repo sessions on the strongest tier. Never `opusplan`. Models for product features are set by the human only.

**Version check before filling and at every change:**

1. Fetch the worker provider's model list (Ollama Cloud: `ollama.com/search?c=cloud`) and the Anthropic model list.
2. For each chosen model, check for a newer version in the same family.
3. Show the table. The human decides per row; without an answer the newest of the same family.
4. Write exact IDs, no aliases that change silently.

## Rules for the session

- **Model ID rule:** exact model IDs for the session and direct providers; `task-*` aliases for gateway roles; the IDs are written only in `tools/delegate/config.toml`.
- Every task file names a `role`; a task without one exits with code 2.
- Code changes go through `execution_simple` or `execution`, never `completion` or `subagent`.
- Accept without believing the report: scope check, tests, typecheck, lint, a test that was red before and green after, then `validation`.
- The session commits and pushes; workers never.
- The closing report names role and model per task; a deviation from `config.toml` is a finding.

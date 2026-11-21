# Gateway (optional)

A LiteLLM proxy in front of your worker models. Workers (`tools/delegate/run_task.py`) talk to one endpoint with one virtual key. Behind it: Ollama Cloud and your ChatGPT subscription through the `chatgpt/` provider (Codex OAuth). You pay the subscriptions only; no API key is billed. When the proxy is down or a limit is exhausted, the wrapper repeats the task through `claude -p` with your Claude subscription. No Anthropic API key is used anywhere.

This is documentation plus an example config, not a service we run for you. Setup time: about 45 minutes on a small server, longer if you have not run a reverse proxy before.

## Roles

| Alias | Used for | Typical backend |
|---|---|---|
| `task-simple` | cheap edits, completion, subagent work | Ollama Cloud coding model |
| `task-research` | read-only research | Ollama Cloud model with a large context |
| `task-normal` | standard coding | ChatGPT subscription (Codex model) |
| `task-complex` | harder coding | ChatGPT subscription (larger Codex model) |
| `task-testing` | writing and fixing tests | ChatGPT subscription |

Map them to wrapper roles in `tools/delegate/config.toml` (preset "gateway"): for example `execution_simple` and `completion` to `gateway/task-simple`, `research` to `gateway/task-research`, `execution` to `gateway/task-normal`. Planning and validation stay on Claude.

## Setup

1. Install LiteLLM on a server, pinned to a version you tested. **Do not use 1.82.7 or 1.82.8.**
2. Copy `litellm.config.example.yaml`, replace the placeholders with exact model IDs, set `OLLAMA_API_KEY` and `LITELLM_MASTER_KEY` in the proxy's environment.
3. Put the proxy behind HTTPS. Do not expose the admin UI.
4. Sign in the `chatgpt/` provider once (device login, subscription account). The token stays on the proxy.
5. Create a virtual key limited to the five `task-*` aliases (command at the end of the example config). Only this key goes to workers, in the variable named by `[gateway] api_key_env` (default `FOREMAN_GATEWAY_KEY`), in the work run's environment. The master key never leaves the server.
6. Fill `[gateway]` in `tools/delegate/config.toml` (`base_url`, `api_key_env`, `fallback_model`) and check: `python3 tools/delegate/run_task.py --dry-run --role execution_simple <task file>`.

## Rules

- Prompts and answers contain your code: keep `turn_off_message_logging: true` and do not add a logging callback that stores them.
- Virtual keys only for `task-*`; rotate them when a machine is retired.
- Your Claude subscription stays the fallback and the planner. Keep `CLAUDE_CODE_OAUTH_TOKEN` in the work run environment for that.
- A subscription has limits. Expect the fallback to start now and then; that is the design.

## Using a ChatGPT plan (accepted-risk)

- The `chatgpt/` provider is not an official Codex client. Automatic use may violate the terms of use and may get your subscription blocked.
- OpenAI recommends an API key for automation. Alternatives: the official Codex CLI as worker, an API key with its own budget, or Ollama and Claude only.
- You decide this explicitly. The decision is stored as `chatgptViaGateway` in workspace.json and is not asked again for every project.
- The installer maps `task-normal` only with `accepted-risk`, given as `--chatgpt-via-gateway accepted-risk` or stored as `chatgptViaGateway` in the workspace file (when `gateway.running` is `yes`). `declined` (flag or workspace) keeps it off, and the flag beats the workspace value. Without a gateway there is no preset and no ChatGPT target.

# Gateway (optional)

A LiteLLM proxy in front of your worker models. Workers (`tools/delegate/run_task.py`) talk to one endpoint with one virtual key. Behind it: Ollama Cloud by default, and optionally your ChatGPT subscription through the `chatgpt/` provider (Codex OAuth, see the risk notice below). You pay the subscriptions only; no API key is billed. When the proxy is down or a limit is exhausted, the wrapper repeats the task through `claude -p` with your Claude subscription. No Anthropic API key is used anywhere.

This is documentation plus an example config, not a service we run for you. Setup time: about 45 minutes on a small server, longer if you have not run a reverse proxy before.

## Roles

| Alias | Used for | Typical backend |
|---|---|---|
| `task-simple` | cheap edits, completion, subagent work | Ollama Cloud coding model |
| `task-research` | read-only research | Ollama Cloud model with a large context |
| `task-normal` | standard coding | Ollama Cloud coding model (optional: ChatGPT subscription, Codex model) |
| `task-complex` | harder coding | Ollama Cloud larger coding model (optional: ChatGPT subscription, larger Codex model) |
| `task-testing` | writing and fixing tests | Ollama Cloud model (optional: ChatGPT subscription) |

Map them to wrapper roles in `tools/delegate/config.toml` (preset "gateway"): for example `execution_simple` and `completion` to `gateway/task-simple`, `research` to `gateway/task-research`, `execution` to `gateway/task-normal`. Planning and validation stay on Claude.

## ChatGPT subscription: risk notice

OpenAI lets you sign in with a ChatGPT account in its own Codex clients (CLI, IDE, app). For automation in shared environments such as CI, OpenAI recommends an API key. The LiteLLM `chatgpt/` provider is not an official Codex client. Automatic use through it can get your subscription limited or blocked.

foreman does not block this route and does not hide it. The decision is yours. Alternatives:

- The official Codex CLI as a worker (not supported by foreman yet).
- An OpenAI API key with its own budget.
- Ollama Cloud only.
- Claude only (your Claude subscription as the fallback).

How to opt in: install with `--chatgpt-via-gateway accepted-risk`. This also copies `litellm.chatgpt.example.yaml`. Without it, the installer writes no ChatGPT target, and `run_task.py` rejects any `chatgpt/` model unless `[gateway] chatgpt_via_gateway = "accepted-risk"` is set.

## Setup

1. Install LiteLLM on a server, pinned to a version you tested. **Do not use 1.82.7 or 1.82.8.**
2. Copy `litellm.config.example.yaml`, replace the placeholders with exact model IDs, set `OLLAMA_API_KEY` and `LITELLM_MASTER_KEY` in the proxy's environment.
3. Put the proxy behind HTTPS. Do not expose the admin UI.
4. Sign in the `chatgpt/` provider once (only with the ChatGPT route; device login, subscription account). The token stays on the proxy.
5. Create a virtual key limited to the five `task-*` aliases (command at the end of the example config). Only this key goes to workers, in the variable named by `[gateway] api_key_env` (default `FOREMAN_GATEWAY_KEY`), in the work run's environment. The master key never leaves the server.
6. Fill `[gateway]` in `tools/delegate/config.toml` (`base_url`, `api_key_env`, `fallback_model`) and check: `python3 tools/delegate/run_task.py --dry-run --role execution_simple`.

## Rules

- Prompts and answers contain your code: keep `turn_off_message_logging: true` and do not add a logging callback that stores them.
- Virtual keys only for `task-*`; rotate them when a machine is retired.
- Your Claude subscription stays the fallback and the planner. Keep `CLAUDE_CODE_OAUTH_TOKEN` in the work run environment for that.
- A subscription has limits. Expect the fallback to start now and then; that is the design.

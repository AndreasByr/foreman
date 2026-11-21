# Optional block: ChatGPT plan through a gateway

For people with a ChatGPT plan and no running gateway. Time: about 45 minutes on a small server. Skip this block if you have no server or no ChatGPT plan; the Claude-only preset works without it.

## Risk notice (read first)

Using the ChatGPT plan through the LiteLLM provider `chatgpt/` is not an official Codex client. Automatic use may violate OpenAI's terms of use and may get your subscription blocked. OpenAI recommends an API key for automation.

Alternatives:
- the official Codex CLI as worker,
- an API key with its own budget,
- Ollama and Claude only (no ChatGPT target at all).

The decision is yours. Nothing is enabled without your explicit acceptance.

## Steps

1. Choose the alternative above. If you do not accept the risk, stop here: use Ollama and Claude only.
2. Set up the gateway on your server as described in `gateway/README.md` (sections Setup and Rules).
3. Create the virtual key limited to the `task-*` aliases and put its value into the variable named `FOREMAN_GATEWAY_KEY` in the work run's environment.
4. Record the decision in workspace.json: `"chatgptViaGateway": "accepted-risk"`, or `"declined"`. It is stored once and not asked again for every project.
5. Run the installer with `--gateway-url <https URL> --fallback-model <claude/id>`; add `--chatgpt-via-gateway accepted-risk` only if you accepted the risk. Without that flag no ChatGPT target is written.
6. Check the output: `gateway dry-run: ok` means the config resolves. Other roles still need exact model IDs.

## Records

- Decision: `chatgptViaGateway` in workspace.json (`accepted-risk` or `declined`).
- Reachability: the preset marker in `tools/delegate/config.toml` says `reachability checked: yes` or `no`.

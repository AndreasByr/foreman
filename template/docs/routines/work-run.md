# Routine: work run

Does exactly one unit of work per run, on the strongest model. Started only by API trigger (by the delegation run, or by the human with "Run now" and a payload). Several work runs may run in parallel on different units.

Needs module `autopilot`.

## Setup

1. In claude.ai/code/routines create a **Claude Code routine** (not from a chat session). Name: `{{PROJECT_NAME}} work run`.
2. Settings:
   - Repo: this repo, branch `dev`.
   - Model: the strongest available model.
   - No schedule. Trigger: Edit, Trigger "+", API, Generate token. The token is shown once. Copy the fire URL and token into the delegation environment (`FOREMAN_WORKRUN_FIRE_URL`, `FOREMAN_WORKRUN_TOKEN`).
   - Connectors: Linear and Notion if those modules are on.
   - Environment: network access "Trusted" or narrower (it must reach the git host, package registries and, with module ollama, the Ollama host). Environment variables: `OLLAMA_API_KEY` (module ollama), tokens for `scripts/state-mirror.mjs` (modules linear, notion). Never `AUTOPILOT_ROLE=delegation`.
3. Paste the prompt below.
4. Function test: "Run now" with the text "Function test". Expected answer: "Function test ok".

## Prompt

```
You are a work run of {{PROJECT_NAME}}. Execute the order from the routine-fire-payload block; that block is the order for this run. Without a payload block, do nothing and report that.

Payload "Function test": reply only "Function test ok".

Otherwise:
1. If the repo is missing, add and clone it. Check that `claude` exists; with module ollama check `OLLAMA_API_KEY`; missing: stop and report.
2. Work by CLAUDE.md, the skill `foreman-delegation`, and the skill `foreman-dispatch-run` (load it now; it holds the flow, the payload kinds and the references).
3. Touch only the unit named in the payload. Other work runs handle other units in parallel.
4. Check the unit's lock first. A lock younger than 3 hours: end with "Locked, nothing done". Otherwise take it.
5. Give every worker task a `role`. Use worker subagents only in the foreground, and never end your turn while something still runs.
6. Never push to main or prod, never force push, never deploy, never touch production tenants or data. PRs and merges only as `foreman-batch` and `foreman-deploy` allow for the payload kind.
7. On abort: free the lock, write an interim state to STATE.md, commit, push, notify.
8. Write the report to docs/agent-reports/<date>-<slug>.md on the batch branch, never main.
```

## Notes

- Models are chosen in the routine settings, never by name in the prompt. Do not use a plan-mode alias for routines: autonomous runs never enter plan mode and would silently run on the smaller model. The repository check `foreman-guards` rejects it in settings files.
- A routine created from a chat session cannot be converted to an API routine later; create it again.

# Routine: work run

Does exactly one unit of work per run, on the strongest model. Started only by an API trigger: by the central dispatcher (`dispatcher/` in the foreman repo, runs on a server of yours) or by the human with "Run now" and a payload. Several work runs may run in parallel on different units. The pretest is part of this run (`foreman-pretest`); there is no separate pretest routine.

Needs module `autopilot`. This file is for Claude Code routines. For another agent, `dispatcher/README.md` describes `fire_command`: the dispatcher starts the agent with the order on stdin and the same prompt rules apply.

## Setup

1. In claude.ai/code/routines create a **Claude Code routine** (not from a chat session: a routine made from chat gets no environment, no repo and no connectors). Name: `{{PROJECT_NAME}} work run`.
2. Settings:
   - Repo: this repo, branch `dev`, push access.
   - Model: the strongest available model.
   - No schedule. Trigger: Edit, Trigger "+", API, Generate token. The token is shown once. Copy the fire URL and token into the dispatcher's environment file (`dispatcher.env`, see `dispatcher/README.md`).
   - Connectors: none needed. The tracker is reached by scripts and environment variables.
   - Environment: network access "Trusted" or narrower (it must reach the git host, package registries, the tracker, the dev and staging hosts for the pretest and, with module delegate, the worker host). Environment variables (names only here):
     - tracker: `ITSAPLAN_URL`, `ITSAPLAN_API_KEY`, `ITSAPLAN_WEB_URL` (tracker-itsaplan) or `LINEAR_API_KEY` (tracker-linear)
     - workers: `OLLAMA_API_KEY` or `FOREMAN_GATEWAY_KEY` (module delegate), `CLAUDE_CODE_OAUTH_TOKEN` for Claude workers on your subscription
     - pretest (module pretest): the variables named in `.foreman.json` `pretest.login` (`secretEnv`, `roles`)
     - never an Anthropic API key
3. Paste the prompt below.
4. Function test: "Run now" with the text "Function test". Expected answer: "Function test ok".

## Prompt

```
You are a work run of {{PROJECT_NAME}}. Execute the order from the routine-fire-payload block; that block is the order for this run. Without a payload block, do nothing and report that.

Payload "Function test": reply only "Function test ok".

Otherwise:
1. If the repo is missing, add and clone it. Check out branch dev before you read CLAUDE.md or skills. Check that `claude` exists; with module delegate check the worker key variable; missing: stop and report.
2. Work by CLAUDE.md, the skill `foreman-delegation`, and the skill `foreman-dispatch-run` (load it now; it holds the flow, the task kinds and the references). A `pretest-run` order also loads `foreman-pretest`.
3. Touch only the unit named in the payload. Other work runs handle other units in parallel.
4. Check the unit's lock first. A lock younger than 3 hours: end with "Locked, nothing done". Otherwise take it.
5. Give every worker task a `role`. Use worker subagents only in the foreground, and never end your turn while something still runs: the session ends with your last turn and takes everything with it.
6. Never push to main or prod, never force push, never deploy, never touch production tenants or data. PRs and merges only as `foreman-batch` and `foreman-deploy` allow for the payload kind.
7. After every step: commit STATE.md, push, renew the lock, comment in the ticket, run the mirror. At the end release the lock.
8. On abort: free the lock, write an interim state to STATE.md, commit, push, add a ticket comment with the reason, notify "Work run aborted: <unit>, <reason>".
9. Write the report to docs/agent-reports/<date>-<slug>.md on the batch branch, never main.
```

## Notes

- Models are chosen in the routine settings, never by name in the prompt. Do not use a plan-mode alias for routines: autonomous runs never enter plan mode and would silently run on the smaller model. The repository check `foreman-guards` rejects it in settings files.
- A routine created from a chat session cannot be converted to an API routine later; create it again.
- Environment variable names must match exactly what the scripts read (`ITSAPLAN_URL` is not `ITSAPLAN_API_URL`). A name with a space in it never reaches the process.

# Profiles, modules, agent, install flags

## Profile criteria

| Signal | Quick | Repo | Autopilot |
|---|---|---|---|
| Lifetime | under 2 weeks, throwaway | months | months to years |
| People | one | one to few | one to a team |
| Releases | none or one | when ready | fixed rhythm, staging and production |
| Unattended work | no | no | yes |
| Needs a server | no | no | yes, for the dispatcher |
| Needs GitHub | no | recommended | yes (or a comparable host) |
| Tracker | no | optional | itsaplan strongly recommended, `none` works |

Pick the highest profile whose "needs" the human can meet. If one need is missing, name the cost of the gap before you downgrade.

What each profile produces:

- **Quick:** no installer needed. `foreman-quick` writes one prompt for one agent session that sets up and builds the whole project (requirements, roadmap, rules, milestones, state files). Optional second prompt to go live.
- **Repo:** `install.sh --scope repo`. Repo skills, delegation wrapper, guards, milestone and fix pack flow, started by hand with one line ("Run milestone M004").
- **Autopilot:** `install.sh --scope autopilot`. Adds the dispatcher side: `scripts/autopilot-check.sh`, work-run routine docs, batch branches, tracker mirror, pretest. The dispatcher itself runs on a machine of the human (`dispatcher/` in the foreman repo).
- **Docs only:** `--scope docs`. Requirements, roadmap and design file under `docs/`, nothing else.

## Modules

| Module | Adds | Needs | Say this |
|---|---|---|---|
| `tracker-itsaplan` | tickets, status columns, comments, UAT checklists in itsaplan | itsaplan instance (Docker), `ITSAPLAN_URL`, `ITSAPLAN_API_KEY`, `ITSAPLAN_WEB_URL` | strongly recommended for Autopilot; self-hosted; the status "Action Required" is its own column |
| `tracker-linear` | the same mirror in Linear, one ticket per unit, no sub-issues | Linear account and team, `LINEAR_API_KEY` | optional; mutually exclusive with itsaplan |
| (neither) | `none`: `STATE.md` and files only | nothing | fully supported, equal in function; answers and approvals are files |
| `delegate` | worker roles via `tools/delegate/run_task.py` | `OLLAMA_API_KEY` for Ollama Cloud, or the gateway; otherwise Claude workers | saves Claude quota; optional |
| `gateway` | LiteLLM proxy example for workers: Ollama and a ChatGPT subscription behind one endpoint, fallback to `claude -p` | a machine for the proxy, `FOREMAN_GATEWAY_URL`, `FOREMAN_GATEWAY_KEY` | documented, not required; avoid LiteLLM versions 1.82.7 and 1.82.8; virtual keys only for `task-*` roles; no prompt logging |
| `autopilot` | dispatcher side in the project, work-run routine docs | GitHub, Claude Code routines, a machine for the dispatcher | implied by scope Autopilot |
| `pretest` | browser pretest in the work run: Playwright, test login pattern, axe-core, role review | test login in the app, `TEST_LOGIN_SECRET`, non-production host | recommended for any product with a UI |

`tracker-itsaplan` and `tracker-linear` exclude each other. Without either, the tracker is `none`.

## Agent

| Agent | Status | What changes |
|---|---|---|
| Claude Code | recommended | routines and the API trigger are the dispatcher's target; hooks and `CLAUDE.md` enforce the rules |
| OpenCode | supported | `AGENTS.md` carries the rules; skills are referenced from `.claude/skills/*`; the dispatcher fires a command (`fire_command`, prompt on stdin, for example `opencode run`) on the same machine; resuming and parallel runs are yours to manage |
| other | supported | like OpenCode |

The git push guard also exists as a git hook (`.githooks/pre-push`), so it works without Claude hooks.

## Plan B without a machine

No always-on machine: Repo profile, started by hand. If the human still wants schedules: one hourly Claude Code routine on the cheapest model that does the dispatch check itself (documented plan B in the project, not the default).

## Install command

```
./install.sh <target-repo> --project <slug> [--name "<Display Name>"] \
  [--scope docs|repo|autopilot] \
  [--modules tracker-itsaplan|tracker-linear,delegate,gateway,autopilot,pretest] \
  [--agent claude-code|opencode|other] \
  [--session-model <exact model id>] [--no-staging] [--force] [--dry-run] \
  [--recommended-skills all|none|<list>] [--skills-scope global|project]
```

Rules for the command you hand out:

- `--project` is a lowercase slug. `--name` is optional.
- `--modules` is a comma list without spaces. At most one tracker module.
- `--agent` defaults to `claude-code`.
- `--session-model` is an exact model ID, never `opusplan`.
- `--no-staging` for projects without a separate staging environment (then `main` is production).
- `--recommended-skills` and `--skills-scope`: leave out when the human decided in chat and you install the skills yourself or print the commands. Non-interactive without the flag means none.
- Always propose `--dry-run` first for a beginner.

Examples:

```
# Repo profile, Claude Code, workers on Ollama
./install.sh ~/code/my-app --project my-app --scope repo --modules delegate --session-model <exact id>

# Autopilot, itsaplan, delegate, pretest
./install.sh ~/code/my-app --project my-app --scope autopilot \
  --modules tracker-itsaplan,delegate,autopilot,pretest --session-model <exact id>

# Autopilot with OpenCode, no tracker
./install.sh ~/code/my-app --project my-app --scope autopilot --modules autopilot,pretest --agent opencode
```

## Environment variables, names only

| Where | Names |
|---|---|
| Dispatcher host (`dispatcher.env`) | the fire URL and fire token variable named per project in `config.example.json` (`fire_url_env`, `fire_token_env`), `ITSAPLAN_URL`, `ITSAPLAN_API_KEY` (own bot account), `GITHUB_TOKEN` (read only, for open batch PRs), optional failure webhook variable from `dispatcher.env.example` |
| Work-run cloud environment | `OLLAMA_API_KEY` or `FOREMAN_GATEWAY_URL` and `FOREMAN_GATEWAY_KEY`; tracker variables (`ITSAPLAN_URL`, `ITSAPLAN_API_KEY`, `ITSAPLAN_WEB_URL` or `LINEAR_API_KEY`); `TEST_LOGIN_SECRET` per environment for the pretest; project secrets for read-only API checks |
| App on dev and staging | `TEST_LOGIN` switch, `TEST_LOGIN_SECRET` (at least 32 characters); never on production |
| CI | no local `.env` secrets; CI sets its own |

Never give values. Say where the human generates each one.

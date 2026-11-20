# Missing prerequisites: what, why, how long

For each gap give the same four lines: why it is needed, steps, minutes, cheaper alternative. Durations are for a first time with the explanation depth from block A. Halve them for experienced users, add half for beginners.

## Coding agent (about 15 min)

Why: it does the work. Claude Code is recommended because routines and the API trigger are the dispatcher's target.

1. Subscription or API access with the provider.
2. Install the CLI or app by the provider's current instructions. Check with `claude --version` (or the agent's own command).
3. Sign in once in a terminal.

Alternative: OpenCode or another agent through `AGENTS.md`. Without routines there is no Claude-style unattended start; the dispatcher then runs a command on your machine (`fire_command`).

## GitHub account and a repo (about 10 min)

Why: Repo and Autopilot profiles push branches; Autopilot needs PRs and CI.

1. Create an account and a private repo.
2. `git clone` it, or `git remote add origin <url>` in an existing folder.
3. Push the first commit.

No GitHub: `git init` and no remote (about 2 min). Quick works fully like this. Repo works with local branches. Autopilot does not: it needs a host with branches and PRs.

## Always-on machine for the dispatcher (about 20 min to choose, 15 min to set up)

Why: the dispatcher checks every project every 10 minutes and starts work runs. It costs no model tokens. A laptop that sleeps is not a fit.

Options: a small VPS, a home server, a spare mini PC. Linux with systemd, Node 20 or newer, git. Do not use the production server of your app unless you accept the coupling.

No machine: Repo profile started by hand, or plan B: one hourly Claude Code routine on the cheapest model does the dispatch check itself (slower, costs tokens).

## Docker (about 15 min)

Why: itsaplan, the gateway and most self-hosted apps run as containers.

1. Install Docker Engine and the compose plugin by the vendor's instructions for your system.
2. `docker run hello-world` succeeds.
3. Add your user to the `docker` group, log in again.

## itsaplan via Docker (about 30 min, plan 60 for a first time)

Why: the recommended tracker for Autopilot: status columns, comments and UAT checklists. Source: https://github.com/croffasia/itsaplan

1. Clone the repo on the server and start it with its compose file (follow its README for the current command).
2. Put it behind HTTPS with a domain, reachable from the dispatcher host and from the cloud environment of the work run. A localhost-only install does not work for cloud runs.
3. Create your account, a workspace and a project.
4. Create a **second account for the bot** and generate its API key. Comments by the bot account never count as your answers.
5. Create the status columns: `Backlog`, `Todo`, `In Progress`, `Action Required` (alias "Intervention needed"), `Wait for Merge`, `Testing`, `In Review`, `Done`.
6. Create a view "UAT ready" filtered by the label `AP: UAT ready` so all open UATs are in one place.
7. Set `ITSAPLAN_URL`, `ITSAPLAN_WEB_URL`, `ITSAPLAN_API_KEY` where the checklist says.
8. In the project repo: `node scripts/state-mirror.mjs --dry-run` must exit 0.

Alternative: `none`. Equal in function. Intervention answers go to `docs/answers/<unit>.md` with the line `Answer <unit>: ...` (or a payload), UAT approval is the line `UAT <unit> approved` in `docs/uat/<unit>.md`. You lose the phone-friendly overview.

## Linear (about 15 min)

Why: an existing Linear account can serve as the tracker mirror. No sub-issues are used.

1. Create or pick a team named after the project.
2. Create the statuses `Todo`, `In Progress`, `Wait for Merge`, `Testing`, `In Review`, `Done` (Team, Settings, Workflow).
3. Create an API key for a bot user or your own; set `LINEAR_API_KEY`.

## Dispatcher on the server (about 15 min)

Why: starts work runs without you. Lives in `dispatcher/` of the foreman repo and is not copied into the project.

1. Clone the foreman repo on the server.
2. Copy `dispatcher/config.example.json` to `config.json`: per project the repo, branch, check command, `fire_url_env`, `fire_token_env`, `enabled`, `max_tasks`.
3. Copy `dispatcher/dispatcher.env.example` to `dispatcher.env`, fill the variables (names are in the file). Mode 600.
4. Add a read-only deploy key to the project repo (GitHub: repo Settings, Deploy keys, leave "Allow write access" off).
5. Dry run: `dispatch.sh --dry-run`. The `TASK` lines must match the units you expect.
6. Install the systemd service and timer from `dispatcher/systemd/` (every 10 minutes). Enable lingering for the user (`loginctl enable-linger <user>`) so the timer runs after logout. Cron works too (see the dispatcher README).
7. To stop: disable the timer, or set `enabled` to false for one project.

## Work-run routine (about 15 min)

Why: this is what the dispatcher fires. Create it in the routines UI or from a Claude Code session in the cloud environment, never from chat.

1. Create a cloud environment with the project repo, network access to the worker provider and the tracker, and the environment variables for the profile.
2. Create a routine with an API trigger and the prompt from `docs/routines/work-run.md` in the project.
3. Generate the token in the UI (shown once). Put URL and token into `dispatcher.env` under the names from `config.json`.
4. Smoke test: fire it with the text "smoke test"; success is the reply "smoke test ok".

Other agents: no routine. Set `fire_command` in the dispatcher config instead.

## Ollama Cloud key (about 5 min)

Why: cheap workers for the `delegate` module. Create an account and an API key; set `OLLAMA_API_KEY` in the cloud environment. Alternative: Claude workers only, at higher quota use.

## Gateway with a ChatGPT subscription (about 45 min, optional)

Why: pay only subscription costs, no API billing. LiteLLM proxy with Ollama and a ChatGPT subscription (Codex sign-in, provider prefix `chatgpt/`) behind one endpoint. Fallback to `claude -p` when limits run out. Example: `gateway/litellm.config.example.yaml` in foreman.

1. Run the proxy in Docker on a machine reachable from the work run.
2. Avoid LiteLLM versions 1.82.7 and 1.82.8.
3. Create virtual keys for the `task-*` roles only. Do not log prompts.
4. Set `LLM_GATEWAY_URL` and `LLM_GATEWAY_KEY` in the cloud environment.

## No deploy knowledge

Why this matters: foreman never deploys from a cloud session. Production deploys are a separate, human-started step.

- Skip staging and production at first. Build and test locally (Quick or Repo).
- When the app is ready, use the second prompt of `foreman-quick` ("go live"): it sets up the hosting step by step with hard safety rules.
- Pick the simplest host that fits (a PaaS or a self-hosted deploy tool). Ask the agent for a comparison of two options for your stack before you choose.
- Plan about half a day for the first deploy, including domain and HTTPS.

## Domain (about 15 min)

Needed for a public app or a tracker reachable from the cloud. Buy a domain, add an A record to the server, let the proxy issue HTTPS. Skip it for local-only work.

## Test login in the app (part of the first milestone)

Why: the pretest cannot sign in through a third party. Pattern: own switch (for example `TEST_LOGIN=1`), active only on non-production hosts, host allowlist, secret of at least 32 characters, rate limiting, never an admin account. The app refuses to start on production with the switch on. Put it into the first milestone brief.

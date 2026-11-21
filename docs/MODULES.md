# Modules

The core needs git, Claude Code and a claude.ai account with skills. Everything else is a module. Turn modules on with `install.sh --modules ...`; they are recorded in `.foreman.json`, and skills read that file.

| Module | Adds | Needs |
|---|---|---|
| (core) | chat skills, repo skills, delegation wrapper with Claude workers, push guard (Claude hook and `.githooks/pre-push`), CI checks, batch branches, `STATE.md`, tracker `none` | git, Claude Code (or OpenCode and similar, see below) |
| `tracker-itsaplan` (recommended) | mirror to [itsaplan](https://github.com/croffasia/itsaplan): one ticket per unit, columns including "Action Required", `AP: ...` phase labels, UAT checklists, answers and approvals as comments | self-hosted itsaplan (about 30 min with Docker), `ITSAPLAN_URL`, `ITSAPLAN_API_KEY` of a bot account |
| `tracker-linear` (optional) | the same mirror to Linear, without sub-issues; done tickets archived after 7 days | `LINEAR_API_KEY`, a team with the states `In Progress`, `Wait for Merge`, `Testing`, `In Review`, `Done` (and `Action Required`, else `In Progress` is used) |
| none (no tracker module) | nothing to mirror; questions, answers and UAT approvals live in files: `docs/answers/<unit>.md` (`Answer <unit>: ...`), `docs/uat/<unit>.md` (`UAT <unit> approved` or all points ticked), or the chat payload | nothing |
| `delegate` | worker roles on Ollama Cloud models (Anthropic-compatible endpoint) | `OLLAMA_API_KEY` in the cloud environment, network access to `ollama.com` |
| `gateway` | optional LiteLLM proxy in front of Ollama Cloud and, optionally, a ChatGPT subscription (Codex OAuth, needs `--chatgpt-via-gateway accepted-risk`) as a second worker backend; falls back to `claude -p` on your Claude subscription | a small server, `FOREMAN_GATEWAY_KEY` (virtual key); `gateway/` docs are copied to `tools/gateway/` |
| `autopilot` | `scripts/autopilot-check.sh` (the dispatcher's check), the work-run routine docs, `foreman-dispatch-run`; the central dispatcher in this repo's `dispatcher/` runs on your server | GitHub or similar, Claude Code routines (API trigger), a machine that is on for the dispatcher (or Plan B, see below) |
| `pretest` | `foreman-pretest`, the headless pretest runner, UAT checklist script, test-login pattern doc | a test login in your app (`docs/test-login.md`), dev or staging environment, Playwright and axe-core installed in the worktree at run time |

`tracker-itsaplan` and `tracker-linear` exclude each other.

**Dispatcher settings** (module `autopilot`, see `dispatcher/README.md`):

- `webhook_format`: `auto` (default), `discord` or `slack`. Picks the body of the error webhook; `auto` decides by host.
- `pass_env`: per project in `dispatcher/config.json`. Only these variables plus `PATH`, `HOME` and `LANG` reach the check script and the command.
- `fire_command`: per project. Local run with Claude Code; template `dispatcher/fire-claude.example.sh`, details in `dispatcher/README.md`.
- `autopilot.mainAutoMerge`: in `.foreman.json`, default `false`. Only the boolean `true` lets the check start a batch for `main` on its own.

Upgrade note: before this version a check script inherited the whole environment, and `main` started in the merge window. Now variables must be listed in `pass_env`, and `main` needs `mainAutoMerge: true`. `FOREMAN_*` overrides (for example `FOREMAN_TZ`) set in `dispatcher.env` no longer reach the check script unless listed in `pass_env`; move them to `.foreman.json` or to `pass_env`. Proxy variables (`HTTP_PROXY`, `HTTPS_PROXY`) are not passed either. The check script also loses `GITHUB_TOKEN` unless the project lists it in `pass_env`; without it open batch PRs are not seen, so a `main` PR started by the human is not continued.

## Choosing

- First try, a demo or a prototype: core only, scope `repo` or `docs`, tracker none. No server, no GitHub remote, no deploy knowledge needed. The chat skill `foreman-quick` builds a one-session prompt for this.
- Solo, no budget for extra tools: core only. You trigger runs by hand.
- Claude quota is tight: add `delegate` (and `gateway` if you have a ChatGPT subscription and a server). Cheap roles move off Claude, Claude keeps planning and validation.
- You want to see progress on your phone: add `tracker-itsaplan` (recommended) or `tracker-linear`. Both are mirrors; nothing breaks when they are down or at a plan limit.
- You want it to run while you sleep: add `autopilot` (and `pretest`). It needs a GitHub repository and a machine for the dispatcher. Effort: repository 10 minutes, work-run routine 20 minutes, dispatcher 15 minutes, itsaplan 30 minutes, test login depends on your app. Without a server use Plan B (`docs/routines/delegation.md`, an hourly routine on the smallest model).

## Scopes

| Scope | Installs | Works without |
|---|---|---|
| `docs` | `docs/` only: versioning, release path, templates | remote, server, scripts |
| `repo` | everything except the autopilot files | remote, server, deploy knowledge (local git is enough) |
| `autopilot` | everything, needs module `autopilot` | nothing: needs GitHub, a routine and a dispatcher machine |

## Agents

Claude Code is the recommended agent: routines with API trigger are the dispatcher's fire target, and hooks guard pushes. `--agent opencode` or `--agent other` also writes `AGENTS.md` (the rules of `CLAUDE.md`, with the skills named by path). OpenCode discovers skills in `.claude/skills/`, `.opencode/skills/` and `.agents/skills/`, so the installed skills work unchanged. Such agents have no Claude hooks: `.githooks/pre-push` blocks pushes to `main` and `prod`, force pushes and deletion of `main`, `dev` and `prod`; `install.sh` sets `core.hooksPath` for it. For the dispatcher, such agents use `fire_command` (see `dispatcher/README.md`); resuming and parallel runs are then your responsibility.

## Recommended third-party skills

`skills.recommended.json` lists skills that improve the output (writing, design, accessibility). `install.sh --recommended-skills all|none|<names> --skills-scope global|project` installs them; the flag is the confirmation. Without a flag the installer asks when it runs in a terminal and installs nothing otherwise. Global means `~/.claude/skills`, project means `<repo>/.claude/skills`.

## Model distribution

`tools/delegate/config.toml` ships with a Claude-only preset, a commented Ollama preset and a commented gateway preset. Model IDs are placeholders until setup fills them. Before filling them, check the current model lists (Anthropic and, with `delegate`, Ollama Cloud or your gateway) for newer versions of the same family. Use exact IDs, never aliases that change silently, and never `opusplan`. No Anthropic API key is used: Claude workers run on your subscription (`CLAUDE_CODE_OAUTH_TOKEN`).

| Role | Claude-only preset | Ollama or gateway preset |
|---|---|---|
| research | small | Ollama or `task-research` (read only) |
| planning, validation | large (read only) | large Claude (read only) |
| execution | mid | mid Claude, or `task-normal` |
| execution_simple | small | Ollama or `task-simple` |
| completion, subagent | small | Ollama or `task-simple` |
| fallback on provider outage | – | small Claude through `claude -p` |

# Changelog

## Unreleased

### New

- **Gateway preset in the installer**: `--gateway-url`, `--fallback-model` and `--chatgpt-via-gateway accepted-risk` write the active gateway preset (`scripts/gateway-preset.py`), with a reachability check and a dry run; ChatGPT routing only after explicit acceptance.

- **Project mode for Claude Code projects.** New chat skill `foreman-project-mode` writes the foreman rules into the project instructions (project chat triages, the thread executes, same header, gates and branch rules, push and merge only on the human's go). Applied by the coordinator's settings tool or pasted by the human; the block is versioned, so a refresh after an update compares it. `foreman-fix`, `foreman-brief`, `foreman-setup` and `foreman-project` point to it; a thread runs a fix pack itself instead of handing it to a second session.

### Upgrade
- Files replaced by `--update`: `scripts/autopilot-check.*`, `scripts/check-config.sh`, `.claude/skills/foreman-dispatch-run/references/batch-run.md` and `.claude/skills/foreman-batch/`. `dispatcher/dispatch.mjs` is not in the project; it is updated on the dispatcher machine (see Steps). Project-owned files stay; `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` and `tools/delegate/config.toml` are never overwritten, the update prints a diff for them: merge by hand. The classes are in `update-classes.json`. New in `scripts/` and it comes with the update: `scripts/measure.mjs` and its test `scripts/test-measure.mjs`.
- Steps: run `./install.sh <project> --update --dry-run`, read the list, then `./install.sh <project> --update` (new). Update the dispatcher code on the dispatcher machine (pull the foreman checkout there), then reload the config. Check scripts and `fire_command` now see only `PATH`, `HOME`, `LANG` and the names in `pass_env`; if your check script needs `GITHUB_TOKEN`, `ITSAPLAN_*`, `FOREMAN_*` or proxy variables, list them in `pass_env`. A webhook whose host is neither Discord nor Slack needs `webhook_format` in `config.json`; otherwise nothing is sent. `main` in the merge window starts only with `autopilot.mainAutoMerge: true` in `.foreman.json` (default `false`); set it to keep the old behavior. Claude Code projects: refresh the project instructions with `foreman-project-mode` (block v2). Installations that use `LLM_GATEWAY_KEY` or `LLM_GATEWAY_URL` rename them to `FOREMAN_GATEWAY_KEY` and `FOREMAN_GATEWAY_URL` (names only; the values stay with you).
- Optional: run `bash scripts/check-config.sh`; it now warns when your check script does not support `--no-fetch`. A `timeout` per role in `tools/delegate/config.toml` (merge by hand from the template), and `node scripts/measure.mjs` for `docs/metrics.md`.

## 0.2.1 (2026-11-20)

- **Fix: Claude workers in cloud sessions.** `claude_login = "inherit"` is the default, so workers use the session's subscription login; other providers' keys, tracker keys and tokens are stripped. `ANTHROPIC_API_KEY` is no longer accepted. A login failure skips further Claude attempts and exits 5; the session hands the task to its own subagent.

### Upgrade
- Files: `tools/delegate/run_task.py` (replace).
- Steps: in `tools/delegate/config.toml` set `claude_login = "inherit"` under `[defaults]`; remove any `ANTHROPIC_API_KEY` from the environment of workers.
- Optional: none.

## 0.2.0 (2026-11-20)

- **Central dispatcher** (`dispatcher/`): a cron or systemd job checks every project every 10 minutes with `scripts/autopilot-check.sh` and starts work runs by API. No model in the loop, no tokens. The hourly delegation routine is now Plan B for people without a server.
- **Pretest inside the work run**: headless Playwright with a test login, screenshots against the approved boards, axe (WCAG 2.2 AA), five review roles, result file with a `Verdict:` line. No computer-bound routine any more.
- **Tracker modules**: `tracker-itsaplan` (recommended), `tracker-linear`, or none. Without a tracker, answers and UAT approvals live in `docs/answers/` and `docs/uat/`.
- **Intervention made visible**: tracker column "Action Required" plus a mandatory comment with question, options, recommendation and how to answer.
- **UAT checklists** in the ticket for every unit that is ready for UAT.
- **Gateway module**: LiteLLM example for Ollama plus a ChatGPT plan, Claude subscription as fallback.
- **Agent-neutral**: `--agent opencode|other` writes `AGENTS.md`; a git pre-push guard works without Claude hooks.
- **Recommended skills** (`skills.recommended.json`): installed only after confirmation, globally or per project.
- **Claude plugin and marketplace**: install with `/plugin marketplace add AndreasByr/foreman` or "Add marketplace" in claude.ai; no zip uploads.
- **New chat skills**: `foreman-setup` (guided interview with time estimates), `foreman-project` (full or quick), `foreman-quick` (one-shot prompt for demos).
- **Removed**: Notion module.

### Upgrade
- Files: the dispatcher (`dispatcher/`), `scripts/autopilot-check.*`, `scripts/pretest*`, `.claude/skills/foreman-dispatch-run/`, `docs/routines/` (all new or replaced).
- Steps: replace the module name `notion` by a tracker module or none; `--update` needs `"foreman"` (your installed version) in `.foreman.json`, so set it first if the file has none.
- Optional: modules `tracker-itsaplan`, `tracker-linear`, `gateway`, `autopilot`, `pretest`.

## 0.1.0 (2026-11-17)

First release.

### Upgrade
- None. First release.

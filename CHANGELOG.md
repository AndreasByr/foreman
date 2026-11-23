# Changelog

## Unreleased

### New

- **Local overlay `.foreman.local.json` for the pretest runner.** The runner merges an optional, git-ignored `.foreman.local.json` over `.foreman.json` (objects merge, arrays and values of the local file replace). Addresses and production hosts can stay out of the repository; the guards check the merged result. The installer adds the file to the project's `.gitignore`. A broken local file stops the run with exit code 2 and does not echo its content.

- **`base_url_env` for the gateway address.** `[gateway]` in `tools/delegate/config.toml` accepts `base_url_env`, the name of the variable that holds the gateway address (default `FOREMAN_GATEWAY_URL`). An installation whose environment already uses another name sets it once; `base_url` still wins.

### Upgrade
- Files replaced by `--update`: `tools/delegate/run_task.py`, `scripts/pretest-run.mjs`, `scripts/lib/pretest-run.mjs`, `scripts/test-pretest.mjs`; local edits there are lost, read the dry-run list first. `docs/test-login.md` stays yours.
- Steps: run `./install.sh <project> --update`; this version does not change the dispatcher, so no pull of the foreman checkout on the dispatcher machine is needed, and an update of the dispatcher is not required. To use the overlay, move the values out of `.foreman.json` into `.foreman.local.json`, add that file to `.gitignore` (new installs get the line) and make sure the file exists where the work run starts.
- Optional: the overlay; without the file nothing changes. `pass_env`, `webhook_format` and `mainAutoMerge` stay as in 0.2.2.

## 0.2.4 (2026-11-22)

### New

- **Model rule per thread category (block v3).** `.foreman.json` gets an optional `models` block: `threads` maps categories (`question`, `fixpack`, `milestone`, `brief`, `roadmap`, `architecture`, `bugRetry`, `release`, `docs`) to a class (`strong`, `standard`, `cheap`), plus `coordinator` and `effort`. Defaults: standard everywhere, strong for brief, roadmap, architecture and a bug after a failed first fix. The block carries the table and the project chat sets the class when it opens a thread. Classes, no version numbers. `scripts/check-config.sh` validates the block.

### Upgrade
- Files: `scripts/check-config.sh` is replaced by `./install.sh <project> --update` (validates the new `models` block). Nothing else changes.
- Steps: update the foreman plugin in claude.ai or with `/plugin update`, then run `foreman-project-mode` (refresh) in the project; it replaces the block v2 with v3 (2 min). Edit `models` in `.foreman.json` first if you want other classes. The dispatcher code does not change in this version, so no pull of the foreman checkout on the dispatcher machine is needed.
- Optional: `models` in `.foreman.json`; without it the defaults apply. `pass_env`, `webhook_format` and `mainAutoMerge` stay as in 0.2.2.

## 0.2.3 (2026-11-22)

### Fixed

- **`foreman-update` in chat finds the changelog itself.** The skill used to read `VERSION` and `CHANGELOG.md` only from a checkout the human names, and asked for it. It now fetches `VERSION`, `CHANGELOG.md`, `update-classes.json` and `docs/MODULES.md` from the public raw URLs of `AndreasByr/foreman`. The tag comes from the latest release (no `v` prefix), fallback `main`. It asks only when both lookups fail. The module list comes from the fetched `docs/MODULES.md`, so modules such as `docs-notion` are known in chat.

### Upgrade
- Files: none replaced by `--update` in this version; `./install.sh <project> --update` only sets the version number. The fix is in the plugin skill `foreman-update`.
- Steps: update the foreman plugin in claude.ai or with `/plugin update` (2 min). The dispatcher code does not change in this version, so no pull of the foreman checkout on the dispatcher machine is needed.
- Optional: nothing new. `pass_env`, `webhook_format` and `mainAutoMerge` stay as in 0.2.2.

## 0.2.2 (2026-11-22)

### New

- **One owner per rule, smaller work run.** Review gate, "hand nothing on", evidence rule and version number rule now have one owner each; the others point to them (the board check lives in the milestone skill and, because a fix pack run does not load that skill, in a guarded copy in the fix pack skill), and `scripts/test-rules.py` fails when one is repeated. `docs/PRINCIPLES.md` now says two review rounds, as the skills do. A work run reads no more than in 0.2.1 (`node scripts/measure-reads.mjs`, part of `scripts/test-all.sh`): milestone 42,714 B (was 43,065 B), fix pack 40,766 B (41,475 B), batch 32,276 B (32,320 B). The README shows these numbers and lists the setups that are not tested regularly.

- **Module `docs-notion`**: one-way mirror of the repo docs to Notion, one page per file, the overview as parent page of its parts. The repo wins: edits made in Notion are overwritten on the next run. Run with `node scripts/docs-notion.mjs [--dry-run]`; the batch run calls it after each merge through `scripts/post-merge.d/`. Needs `NOTION_API_KEY` and `docsNotion.rootPageId` in `.foreman.json`. No model writes to Notion; the script respects Notion's rate and size limits. The old name `notion` is refused with a hint to `docs-notion`.
- **`wiki` block in `.foreman.json`** (module `docs-notion`, default off): `enabled`, `language`, `audiences`, `rootPageId`, `forbidden`. The installer adds it without overwriting an existing block.
- **Skill `foreman-wiki`**: how to write and maintain the wiki pages in `docs/wiki/` (only from internal docs, one folder per audience, checked text, published by hand at release time).
- **Milestone wiki todo**: with `wiki.enabled`, milestones carry a "Check whether the wiki needs an update" todo and a `Wiki:` line in the STATE.md header. `state-mirror.mjs --unit <id>` requires that line in every status except `done`; without `--unit` a missing line is only a warning for closing statuses.

- **Wiki publishing** (`node scripts/docs-notion.mjs --wiki`): pages from `docs/wiki/` go to Notion under their audience page. A scan for internal terms, hosts, secrets and forbidden terms runs first; a hit stops the run before anything is sent, also in the dry run. The docs mirror never includes `docs/wiki/`.

- **Gateway preset in the installer**: `--gateway-url`, `--fallback-model` and `--chatgpt-via-gateway accepted-risk` write the active gateway preset (`scripts/gateway-preset.py`), with a reachability check and a dry run; ChatGPT routing only after explicit acceptance.

- **Project mode for Claude Code projects.** New chat skill `foreman-project-mode` writes the foreman rules into the project instructions (project chat triages, the thread executes, same header, gates and branch rules, push and merge only on the human's go). Applied by the coordinator's settings tool or pasted by the human; the block is versioned, so a refresh after an update compares it. `foreman-fix`, `foreman-brief`, `foreman-setup` and `foreman-project` point to it; a thread runs a fix pack itself instead of handing it to a second session.
- **itsaplan project template** the template file `itsaplan-project-template.json` (imported into itsaplan under the name `foreman`) (`plugins/foreman/skills/foreman-setup/references/itsaplan-project-template.json`): columns and labels in English. `foreman-setup` imports it once per workspace, `foreman-project` creates new projects from it. `scripts/check-config.sh` reports names that are not English.

- **Update notice from the dispatcher.** Once per project and version, the dispatcher sends a `foreman update available` webhook message when the project runs an older foreman version. With `tracker-itsaplan` it also creates a ticket in "Action Required". Config keys `foreman_version_source`, `foreman_repo` and `update_notice`; see `dispatcher/README.md`.

### Upgrade
- Files replaced by `--update` (this change): the repo skills `foreman-delegation`, `foreman-milestone`, `foreman-fixpack`, `foreman-batch`, `foreman-deploy`, `foreman-dispatch-run` (with `references/batch-run.md`). Local edits there are lost; read the dry-run list first. Rollout orders for installed projects: `docs/rollout/`.
- An existing docs-notion project gets the wiki files from `--update`, but the `wiki` block in `.foreman.json` only from `install.sh <project> --modules docs-notion` (the update never edits that file); the state-mirror, milestone template and skill files are replaced by `--update`.
- A template does not change projects that already exist; rename their columns and labels by hand to the English names (list in `docs/trackers.md`) or run `scripts/check-config.sh` to see which.
- Files replaced by `--update`: `scripts/autopilot-check.*`, `scripts/check-config.sh`, `.claude/skills/foreman-dispatch-run/references/batch-run.md` and `.claude/skills/foreman-batch/`. `dispatcher/dispatch.mjs` is not in the project; it is updated on the dispatcher machine (see Steps). Project-owned files stay; `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` and `tools/delegate/config.toml` are never overwritten, the update prints a diff for them: merge by hand. The classes are in `update-classes.json`. New in `scripts/` and it comes with the update: `scripts/measure.mjs` and its test `scripts/test-measure.mjs`.
- Steps: run `./install.sh <project> --update --dry-run`, read the list, then `./install.sh <project> --update` (new). Update the dispatcher code on the dispatcher machine (pull the foreman checkout there), then reload the config. Check scripts and `fire_command` now see only `PATH`, `HOME`, `LANG` and the names in `pass_env`; if your check script needs `GITHUB_TOKEN`, `ITSAPLAN_*`, `FOREMAN_*` or proxy variables, list them in `pass_env`. A webhook whose host is neither Discord nor Slack needs `webhook_format` in `config.json`; otherwise nothing is sent. `main` in the merge window starts only with `autopilot.mainAutoMerge: true` in `.foreman.json` (default `false`); set it to keep the old behavior. Claude Code projects: refresh the project instructions with `foreman-project-mode` (block v2). Installations that use `LLM_GATEWAY_KEY` or `LLM_GATEWAY_URL` rename them to `FOREMAN_GATEWAY_KEY` and `FOREMAN_GATEWAY_URL` (names only; the values stay with you).
- Optional: run `bash scripts/check-config.sh`; it now warns when your check script does not support `--no-fetch`. A `timeout` per role in `tools/delegate/config.toml` (merge by hand from the template), and `node scripts/measure.mjs` for `docs/metrics.md`.
- Update notice: the dispatcher machine needs the new dispatcher code (pull the foreman checkout there). For tickets, list `ITSAPLAN_URL` and `ITSAPLAN_API_KEY` in the project's `pass_env`. Optional keys in `dispatcher/config.json`, names only: `foreman_version_source`, `foreman_repo`, `update_notice`.

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

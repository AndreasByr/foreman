# Changelog

## Unreleased (patch)

### New

- **Links between wiki pages.** Relative `.md` links in `docs/wiki` (also across audiences) become Notion links at publish. A link to a folder (`./` or `../<slug>/`) points to the audience overview page. A link to a missing page stops the run with `broken link` and a line number (exit 4, before any request, also with `--dry-run`). Links to pages that do not exist yet are written in a second pass; links that stay open give `unresolved link` and exit 1. Anchors and link titles are dropped, code spans and code blocks are not touched. The comparison reads Notion's internal link form, so the next run reports `unchanged`. Projects that used a fixed Notion address for the overview can switch to the folder link.
- **A failed wiki run archives nothing.** If a page fails to create or update, no page is archived in that run and the run exits 1 (`archive skipped`). The next run archives as usual.

### Fixed

- **Wiki root that is a Notion wiki (database).** Creating pages under such a root answered 404, the sync archived the old pages first and ended with an empty wiki. The sync now tries a page parent first, and on 400/404 asks once whether the root is a database and creates the pages with its title property. Page roots cost no extra request.

### Upgrade
- Files: `./install.sh <project> --update` replaces `scripts/docs-notion.mjs`, `scripts/lib/docs-notion*.mjs`, `scripts/lib/docs-wiki*.mjs`, `scripts/test-docs-notion.mjs`, `scripts/test-docs-wiki.mjs` and the skill `foreman-wiki`; local edits there are lost, read the dry-run list first.
- Steps: run `./install.sh <project> --update`, then `node scripts/docs-notion.mjs --wiki --dry-run`. A wiki that links to missing pages now exits 4 until the link is fixed. This version does not change the dispatcher, so no pull of the foreman checkout on the dispatcher machine is needed (dispatcher update not required).
- Optional: replace fixed Notion addresses of the overview page with `[Overview](./)`. `pass_env`, `webhook_format` and `mainAutoMerge` stay as before.

## 0.2.6 (2026-11-27)

### New

- **Local overlay `.foreman.local.json` for the pretest runner.** The runner merges an optional, git-ignored `.foreman.local.json` over `.foreman.json` (objects merge, arrays and values of the local file replace). Addresses and production hosts can stay out of the repository; the guards check the merged result. The installer adds the file to the project's `.gitignore`. A broken local file stops the run with exit code 2 and does not echo its content.

- **`base_url_env` for the gateway address.** `[gateway]` in `tools/delegate/config.toml` accepts `base_url_env`, the name of the variable that holds the gateway address (default `FOREMAN_GATEWAY_URL`). An installation whose environment already uses another name sets it once; `base_url` still wins.

### Fixed

- **Model rule did not take effect (block v6).** The project instructions held the model table without an action, without model IDs and without the human's explicit request, so threads kept the project default. The block (v6) states the table as the human's standing choice and carries the IDs from `models.ids`; `foreman-project-mode` and `docs/WORKFLOW.md` name the platform limit and the fallback. `check-config.sh` validates `models.ids`. Upgrade steps: refresh the project instructions with `foreman-project-mode`; set `models.ids` in `.foreman.json` (keys `strong`, `standard`, `cheap`, values the exact model IDs).

### Upgrade
- Files: `./install.sh <project> --update` replaces `tools/delegate/run_task.py`, `scripts/pretest-run.mjs`, `scripts/lib/pretest-run.mjs` and `scripts/test-pretest.mjs`; local edits there are lost, read the dry-run list first. `docs/test-login.md` and `tools/delegate/config.toml` stay yours.
- Steps: run `./install.sh <project> --update`. This version does not change the dispatcher, so no pull of the foreman checkout on the dispatcher machine is needed. To use the overlay, move the values out of `.foreman.json` into `.foreman.local.json`, add that file to `.gitignore` (new installs get the line) and make sure the file exists where the work run starts.
- Optional: the overlay and `base_url_env` (merge it into your `[gateway]` table by hand); without them nothing changes. `pass_env`, `webhook_format` and `mainAutoMerge` stay as before.

## 0.2.5 (2026-11-23)

### New

- **Alarm when a module stops.** Every module now writes a heartbeat: one JSON file per module in `<workdir>/status/` or `FOREMAN_STATUS_DIR`. The dispatcher writes its own beat and one per project, `state-mirror.mjs` writes `tracker-sync`, and any script can use `node dispatcher/heartbeat.mjs beat`. A new watcher (`dispatcher/watch.sh`, every 15 minutes, own timer) judges the beats as error, stale or never reported. Alarms go to the webhook, a push URL or a tracker ticket (`alarm.channels`), once per problem, again after `alarm.repeat_hours`, with one recovery message. `dispatcher/status.sh` shows all modules and exits 1 when one is not ok. A failing step now ends in an error beat.
- **STATE.md is a gate (block v4).** Without autopilot, project threads let `STATE.md` drift. Now the update is a gate before every report and PR in `foreman-delegation`, `foreman-fixpack` and `foreman-milestone`, and the block (v4) says so. The project chat checks that the branch or PR changes `STATE.md` before it passes a UAT list or PR link on. New `scripts/check-state-touched.mjs` runs in the `foreman-guards` workflow: a PR that changes code or fix pack and milestone files without a unit `STATE.md` goes red (PRs from `main`, `dev`, `sync/*`, `dependabot/*`, `renovate/*` and `foreman-update*` and `agent/foreman-update*` are skipped; a deleted `STATE.md` does not count).
- **Slimmer STATE template.** The header gets `Branch:`, `PR:` and `Next:`. The fix pack table drops the Areas and Board columns and shows red and green runs in one column. The mirror script reads the same fields as before.
- **After-merge step also for manual threads (block v5).** The step "`STATE.md` to its next status, run the mirror, only then close the thread" lived only in the autopilot run. A project thread that merged on the human's "go" and closed skipped it, so the tracker kept the old status. Now `foreman-delegation` defines the After-merge step, `foreman-batch`, `foreman-fixpack` and `foreman-milestone` point to it, and the block (v5) carries one line.
- **Mirror and tracker client are tested together.** `state-mirror.mjs` names the client methods it needs. A test compares them with the real itsaplan and Linear clients and with the test fake, and scans the mirror source so the list cannot go stale. A client that lacks a method now stops the mirror at once with the file to check, not with `client.project is not a function`.
- **`install.sh --update` warns about files it does not ship.** The update report (also with `--dry-run`) lists scripts in `scripts/` and `scripts/lib/` that this foreman version does not ship, and the old folder `docs/fixpakete/`. Nothing is deleted or changed because of it; if such a file replaced a foreman script, remove or rename it by hand.
- **Dispatcher limits are asked for, not defaulted.** The cap of 3 starts per run is now `max_tasks_cap` in `dispatcher/config.json` (default 3, at most 10). Each project has `max_tasks`, and `cooldown_minutes` is set at top level (default 45) or per project. The dry run prints a `limits` line per project and an `Ask the human for this value` line for every value that is not set. Setup, project start and update ask for these values instead of keeping the defaults. `max_tasks: 0` is no longer a pause: it is invalid (warning, the cap is used); to pause a project, set `"enabled": false`. `cooldown_minutes` is capped at 24 h (1440 min); an invalid project value falls back to the top-level value, then to 45.

### Upgrade
- Files: `./install.sh <project> --update` replaces the three skills, the two `_TEMPLATE/STATE.md` files, `.github/workflows/foreman-guards.yml` and adds `scripts/check-state-touched.mjs` with its test. It also replaces `scripts/state-mirror.mjs` (client check). The update warning lives in the foreman checkout, not in your project. Nothing else changes.
- Steps: update the foreman plugin in claude.ai or with `/plugin update`, then run `foreman-project-mode` (refresh) in the project; it replaces the block (v3 or v4) with v5 (2 min). The dispatcher code changes in this version, so pull the foreman checkout on the dispatcher machine (see the alarm and limits entries below). Open PRs without a `STATE.md` change turn red after the update; add the state file to them. Put the update itself on a branch named `foreman-update-<version>`.
- Optional: nothing new to set. `pass_env`, `webhook_format` and `mainAutoMerge` stay as before. Existing `STATE.md` files keep working; the new header lines are optional there.
- Alarm files: new `dispatcher/heartbeat.mjs`, `dispatcher/watch.mjs`, `dispatcher/watch.sh`, `dispatcher/status.sh` and the systemd units `dispatcher/systemd/foreman-watcher.service` and `.timer`; `scripts/state-mirror.mjs` and `scripts/lib/heartbeat.mjs` via `./install.sh <project> --update`.
- Alarm steps: pull the foreman checkout on the dispatcher machine, install the watcher timer (or the cron line in `crontab.example`), set `alarm` in `config.json`, and set `FOREMAN_STATUS_DIR` for the tracker sync if you want its beat.
- Alarm optional: nothing changes without `alarm` in `config.json`; the watcher then uses the webhook only.
- Files (dispatcher limits): the dispatcher code changed, so pull the foreman checkout on the dispatcher machine.
- Steps/Optional (dispatcher limits): Before the pull: a project that uses `max_tasks: 0` as a pause must be set to `"enabled": false`, because 0 is now invalid and the cap applies. Answer the questions. Run `./dispatch.sh --dry-run`, set `max_tasks` and `cooldown_minutes` per project in `config.json`, and optionally `max_tasks_cap`. Otherwise nothing changes if you set nothing: the defaults stay 3 starts per run and 45 min cooldown.

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

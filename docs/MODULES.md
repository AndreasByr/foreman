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
| `docs-notion` | one-way mirror of repo docs to Notion, one page per file, the overview as parent page; run by the batch run, never by a model; it runs after each merge in the batch run via `scripts/post-merge.d` | Notion integration token in `NOTION_API_KEY`, a root page id in `.foreman.json` `docsNotion.rootPageId`, Node 20 |

`tracker-itsaplan` and `tracker-linear` exclude each other. itsaplan projects are created from the template file `itsaplan-project-template.json` (imported into itsaplan under the name `foreman`); only the bot account is added by hand, and `check-config.sh` reports names that are not English.

**docs-notion** (module `docs-notion`):

- Setup: create an internal Notion integration, share the root page with it, put the root page id into `.foreman.json` `docsNotion.rootPageId`, export `NOTION_API_KEY` (the token stays out of the repo).
- Existing project: run `./install.sh <repo> --project <slug> --modules docs-notion`; it adds the module and the `docsNotion` block to `.foreman.json` without touching other keys. Set `docsNotion.rootPageId` afterwards.
- Pages the mirror created (they carry the marker) are overwritten from their repo file, moved under the right parent when the file layout changes (old page archived, new page created), and archived when the file is gone. Pages without marker are never changed or archived; they are listed on stderr.
- Known limit: a page without marker that sits below a mirror page which moves to a new parent is archived by Notion together with that page and not reported. Do not put your own pages below mirrored pages.
- Run time: the script stops after `NOTION_MAX_RUN_S` seconds (default 600) and exits 1; a rerun continues.
- Defaults: `include` `docs/**/*.md`; `exclude` `docs/agent-reports/**`, `docs/answers/**`, `docs/uat/**`, `docs/wiki/**`, `**/STATE.md`.
- Limits: at most 3 requests per second; on 429 it waits for `Retry-After` and retries at most 5 times; 100 blocks per request; 2000 characters per text.
- Trigger: the batch run (module `autopilot`) and the manual batch PR flow run `scripts/post-merge.d/*.sh` after each merge; without either, run `node scripts/docs-notion.mjs` by hand or from your own CI.
- `wiki` block in `.foreman.json` (added with the module, default off): `enabled` (true or false, default `false`), `language` (falls back to `context.language`), `audiences` (list of objects with a unique `name`, optional `description`), `rootPageId` (the wiki root page id), `forbidden` (list of non-empty strings, terms that must not appear in wiki pages). When `enabled` is `true`, language, audiences and rootPageId are required; `scripts/check-config.sh` reports what is missing. The installer never overwrites an existing `wiki` block.

**Dispatcher settings** (module `autopilot`, see `dispatcher/README.md`):

- `webhook_format`: `auto` (default), `discord` or `slack`. Picks the body of the error webhook; `auto` decides by host.
- `pass_env`: per project in `dispatcher/config.json`. Only these variables plus `PATH`, `HOME` and `LANG` reach the check script and the command.
- `fire_command`: per project. Local run with Claude Code; template `dispatcher/fire-claude.example.sh`, details in `dispatcher/README.md`.
- `autopilot.mainAutoMerge`: in `.foreman.json`, default `false`. Only the boolean `true` lets the check start a batch for `main` on its own.
- `foreman_version_source`: `release` (default, newest GitHub release of `foreman_repo`) or `local` (the `VERSION` file of the foreman checkout that holds `dispatch.mjs`, for a private repository or offline). Feeds the `foreman update available` notice, see `dispatcher/README.md`.
- `foreman_repo`: `owner/name` of the foreman repository for the release lookup. Default `AndreasByr/foreman`.
- `update_notice`: `true` (default) or `false`. Set `false` to switch off the `foreman update available` notice for all projects, or in a project's entry for that project only.
- `autopilot.batchHours`: in `.foreman.json`, the local hours (in `context.timeZone`) of the merge window in which the check starts the batch PR. Default 3, 7, 11, 15, 19, 23.
- `autopilot.waitHours`: in `.foreman.json`, the wait time in hours after which the check starts the batch PR outside the merge window. Default 4. `FOREMAN_WAIT_SECONDS` still overrides the wait time.

Upgrade note: before this version a check script inherited the whole environment, and `main` started in the merge window. Now variables must be listed in `pass_env`, and `main` needs `mainAutoMerge: true`. `FOREMAN_*` overrides (for example `FOREMAN_TZ`) set in `dispatcher.env` no longer reach the check script unless listed in `pass_env`; move them to `.foreman.json` or to `pass_env`. Proxy variables (`HTTP_PROXY`, `HTTPS_PROXY`) are not passed either. The check script also loses `GITHUB_TOKEN` unless the project lists it in `pass_env`; without it open batch PRs are not seen, so a `main` PR started by the human is not continued. Upgrade note for the update notice (`foreman update available`): a dispatcher that should send it needs the new dispatcher code (pull the foreman checkout on the dispatcher machine). For the ticket, `ITSAPLAN_URL` and `ITSAPLAN_API_KEY` must be in the project's `pass_env`. The optional keys `foreman_version_source`, `foreman_repo` and `update_notice` need no change for the defaults.

## Choosing

- First try, a demo or a prototype: core only, scope `repo` or `docs`, tracker none. No server, no GitHub remote, no deploy knowledge needed. The chat skill `foreman-quick` builds a one-session prompt for this.
- Solo, no budget for extra tools: core only. You trigger runs by hand.
- Claude quota is tight: add `delegate` (and `gateway` if you have a ChatGPT subscription and a server). Cheap roles move off Claude, Claude keeps planning and validation.
- You want to see progress on your phone: add `tracker-itsaplan` (recommended) or `tracker-linear`. Both are mirrors; nothing breaks when they are down or at a plan limit.
- You want it to run while you sleep: add `autopilot` (and `pretest`). It needs a GitHub repository and a machine for the dispatcher. Effort: repository 10 minutes, work-run routine 20 minutes, dispatcher 15 minutes, itsaplan 30 minutes, test login depends on your app. Without a server use Plan B (`docs/routines/delegation.md`, an hourly routine on the smallest model).
- Your team reads the docs in Notion: add `docs-notion`. The repo stays the source; Notion only gets a read-only copy.

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

## Gateway options

`install.sh --gateway-url <url> --fallback-model <claude/id>` writes the gateway preset into `tools/delegate/config.toml` and adds modules `delegate` and `gateway` if they are missing. The URL must be `https://`; plain `http` is accepted only for `localhost` or `127.0.0.1`. The fallback model is the exact Claude model ID that the wrapper uses when the gateway is down. ChatGPT routing (`task-normal`) happens only with `accepted-risk`, given as `--chatgpt-via-gateway accepted-risk` or stored as `chatgptViaGateway` in the workspace file; read the risk notice in `gateway/README.md` first. `declined` overrides a stored value, and without a gateway no preset is written. The URL rule is strict (https, plain host, no query, no secret-like path segment) and the preset needs `--scope repo` or `autopilot`. For an existing install (config.toml is kept without `--force`), run by hand: `python3 <foreman-repo>/scripts/gateway-preset.py tools/delegate/config.toml --url <url> --key-env FOREMAN_GATEWAY_KEY --fallback-model <claude/id> [--chatgpt]`. A changed workspace file updates only the `infra` block of an existing `.foreman.json` when you re-run the installer with `--workspace`. Defaults for URL, key variable (`FOREMAN_GATEWAY_KEY` unless set) and the ChatGPT choice come from `--workspace` when `gateway.running` is `yes`; flags win. The installer never reads or prints the key value: the config holds only the variable name.

## Measurement (M011)

`scripts/measure.mjs` measures a period. Per unit (milestone or fix pack): run minutes, minutes waited on a human, and reports. Per intervention: its cause. Per worker attempt: role, model and fallbacks. It reads `docs/milestones/*/STATE.md`, `docs/fixpacks/*/STATE.md`, `docs/agent-reports/` and the worker result files in `tools/delegate/tasks/`. No network, no environment variables, and no writes except its output.

```
node scripts/measure.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--root <dir>] [--results <dir>] [--strict]
```

The default period is the last 7 days, the root is the current directory. The output is `docs/metrics.md`: the whole file is regenerated on every run, and it covers one project only. For a fixed period (`--since` and `--until` both given) two runs differ only in the `Erzeugt:` line. A unit belongs to the period by its newest log time; worker result files belong to it by file modification time (copying them without keeping the time shifts them). The file holds numbers, unit ids, cause categories, role and model names, and gap texts; never titles, questions or cause sentences. `--strict` exits 1 when gaps exist (the file is still written). An invalid date or option exits 2 and writes nothing. A worker answer that quotes a well-formed `## Attempt N: role (provider/model) - ok` line is counted as an attempt, so the attempt numbers are a guide, not proof; a wait is only subtracted when the log line's event field starts with `needs-input`.

Every "Open question" section of a STATE.md carries one cause line, `**Cause:** <category> · <one sentence>`. Categories: `missing-requirement`, `open-decision`, `missing-infra`, `merge-conflict`, `ui-deviation`, `limit-exceeded`, `security`, `other`. An intervention without a valid category counts as "without valid cause" and is listed as a gap.

The result files (`tools/delegate/tasks/*.result.md`) exist only on the machine where the workers ran. On any other machine the report shows them as a gap, not as zero.

## Updating a project

Run `./install.sh <target> --update --dry-run` first. It lists what would change. Then run `./install.sh <target> --update` to apply it. The `foreman-update` chat skill guides both steps.

Every file in `template/` has one class in `update-classes.json`:

- `foreman`: replaced by the current version.
- `project`: kept as it is.
- `mixed`: `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `tools/delegate/config.toml`. Never overwritten, because a project's own edits must survive. A missing one is created. For the ones that differ, the update prints a diff against the rendered template.

`version` in `.foreman.json` is written last. A failed update leaves it unchanged, so a rerun finishes the work. `--update` never adds modules. It stops when foreman-owned files have uncommitted changes. Foreman-owned files that a project patched and committed are replaced too, so read the `update` lines before you run it for real.

The steps for each version are in the `### Upgrade` part of its section in `CHANGELOG.md`.

Whoever adds a file to `template/` also adds it to `update-classes.json`. A test enforces this.

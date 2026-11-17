# foreman

A way of building software with Claude where you decide, Claude plans and checks, and cheaper workers write the code. Packaged as skills, a delegation wrapper and guard rails you install into any repo.

foreman came out of running one real product through several releases with one developer and agents doing nearly all of the coding. Everything here exists because something went wrong without it. The reasons are in [docs/learnings.md](docs/learnings.md).

## How it works

```
you ──► chat (claude.ai) ──► Claude Code session ──► workers ──► checks ──► batch PR ──► pretest ──► you (UAT) ──► release
        roast, roadmap,       cuts slices, writes     write code   scope,     every 4 h     browser +
        design, briefs        task files, accepts     (no git)     tests,                   5-role review
                                                                   review
```

- **Plan expensive, execute cheap.** The session model plans and accepts; workers run as separate `claude -p` processes with a role (`research`, `execution`, …). Roles map to models in one file.
- **Hand off through files.** Briefs, `STATE.md`, task files and reports live in the repo. A fresh run picks up where the last one stopped.
- **One source of truth.** `STATE.md` holds each unit's status. Linear and Notion are optional mirrors written by a script, never by a model.
- **Check mechanically first.** Scope check, tests, a red-then-green test, then a review. A security finding escalates after one failed fix.
- **Guard rails are code.** A PreToolUse hook blocks pushes to `main`/`prod`, force pushes and remote deletions; CI rejects `opusplan` and oversized rule files.
- **Small fixed load.** `CLAUDE.md` stays under 2 KB, hooks inject only a short core, skills load details on demand, worker files are git-ignored.

Read [docs/PRINCIPLES.md](docs/PRINCIPLES.md) for the full set and [docs/WORKFLOW.md](docs/WORKFLOW.md) for the lifecycle.

## Install

### 1. Chat skills (claude.ai)

```bash
git clone https://github.com/AndreasByr/foreman && cd foreman
./scripts/package-chat-skills.sh        # writes dist/foreman-<name>.zip
```

Upload each zip in claude.ai under **Settings → Capabilities → Skills**. Start a new project chat and say "set up a new project with foreman" (`foreman-setup`).

| Skill | Use it to |
|---|---|
| `foreman-setup` | set up a project: scope, modules, install, routines |
| `foreman-roast` | challenge an idea and end with `docs/requirements.md` |
| `foreman-roadmap` | versions, milestones, slices, human test flows |
| `foreman-design-file` | token-based `docs/design.md` for agents |
| `foreman-brief` | milestone briefs, situation report, hand-off to Claude Code |
| `foreman-fix` | bugs and fix packs (one session for many findings) |
| `foreman-pretest` | test a milestone in the browser before UAT |
| `foreman-role-review` | UX, UI, bugs, pentest, accessibility review of a running app |
| `foreman-release` | release with monitoring until the deploy is green |
| `foreman-orchestrator` | save tokens in chat by delegating big mechanical work |

### 2. Repo side

```bash
./install.sh ../my-app --project my-app --name "My App" \
  --modules ollama,linear,notion,autopilot --session-model <exact-opus-model-id>
```

Leave out the modules you don't want. The installer never overwrites files without `--force`, merges an existing `.claude/settings.json`, and writes `CLAUDE.foreman.md` if you already have a `CLAUDE.md`. Then:

```bash
cd ../my-app
# fill exact model IDs in tools/delegate/config.toml, then
python3 tools/delegate/run_task.py --dry-run --role execution
bash scripts/check-config.sh && python3 scripts/test-guard.py
```

### 3. Modules

| Module | Adds |
|---|---|
| `ollama` | worker roles on Ollama Cloud |
| `linear` | ticket mirror and auto-archive (free plans count active issues) |
| `notion` | pretest handoff rows and UAT list |
| `autopilot` | hourly delegation, work runs by API trigger, pretest routine |

Details: [docs/MODULES.md](docs/MODULES.md).

## What gets installed

```
CLAUDE.md                       rules, under 2 KB
.foreman.json                   scope, modules, branches, mirror config
.claude/settings.json           session model, hooks, deny rules
.claude/hooks/                  inject-core.sh, session-setup.sh, guard-git.py
.claude/skills/foreman-*        delegation, milestone, fixpack, batch, deploy, dispatch-run
.githooks/pre-commit            no commits on main/prod
tools/delegate/                 run_task.py, config.toml (roles → models), tests
scripts/                        batch-branch.mjs, state-mirror.mjs, autopilot-check.sh, check-config.sh, tests
docs/                           milestone and fix pack templates, routines, release path, versioning, learnings
.github/workflows/foreman-guards.yml
```

## Credits

Some ways of working were sharpened after reading [scalex-os/atlas](https://github.com/scalex-os/atlas): roles with forbidden actions, numbered handoff files, scope checks per commit, a reflect step after each sprint.

## License

MIT, see [LICENSE](LICENSE).

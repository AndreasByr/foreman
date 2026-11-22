# Rollout: project A

Installed version: <from the project's .foreman.json>
Target: <foreman version or commit to update to>
Tracker: <none|itsaplan|linear>
Modules: <from .foreman.json>

## Order for Claude Code

```
1. In <foreman checkout>: run ./install.sh <project path> --update --dry-run
   and read the list.
2. In <foreman checkout>: run ./install.sh <project path> --update
3. In <project path>: run bash scripts/check-config.sh
4. Merge every file marked "keep ... (mixed: merge by hand)" by hand:
   CLAUDE.md, AGENTS.md, .claude/settings.json, tools/delegate/config.toml
5. Commit on a fresh branch. Push only to dev, batch/* or an agent/* branch,
   never main.
6. First run all of this on a copy of the project, never first on the live project.
```

## Checklist outside the repo

- [ ] Read the Upgrade part of every version between the installed one and the target in `CHANGELOG.md` and do each item (for example `autopilot.mainAutoMerge`, the `FOREMAN_GATEWAY_*` variable names, `webhook_format`, the `wiki` block)
- [ ] Update the foreman plugin in claude.ai or with `/plugin update` (2 min)
- [ ] Refresh the project instructions with `foreman-project-mode` (2 min)
- [ ] Check the model IDs in `tools/delegate/config.toml` and merge new keys by hand (5 min)
- [ ] Set the dispatcher variable names it now needs (names only, no values) in `pass_env` (5 min)
- [ ] Update the dispatcher code on the dispatcher machine and reload the config (5 min)
- [ ] With itsaplan: rename columns and labels to the English names listed in `docs/trackers.md` by hand (10 min), then run `bash scripts/check-config.sh`
- [ ] Optional: `node scripts/measure.mjs` for `docs/metrics.md` (2 min)

## After the update

- [ ] `version` in `.foreman.json` is new
- [ ] Own edits in `CLAUDE.md`, `AGENTS.md`, `tools/delegate/config.toml` are still there
- [ ] `bash scripts/check-config.sh` is ok
- [ ] The next dispatcher run ends without error
- [ ] `node scripts/measure.mjs` writes `docs/metrics.md` and the numbers go to the maintainer for the README

## Go / no-go

Start only after project C got a go.

- [ ] If any box above fails: stop and report. Do not retry the update on a live project.

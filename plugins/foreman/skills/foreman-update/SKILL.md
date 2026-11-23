---
name: foreman-update
description: "Use when the human wants to bring an installed project to the current foreman version ('update foreman', 'upgrade', 'new version'): compares versions, lists the changes, writes the order for Claude Code and a checklist for steps outside the repo, refreshes the project instructions."
---

# foreman-update

The update itself runs in the repo with `install.sh --update`. The chat compares versions, explains the changes and writes the order. This skill never edits a project repo from chat and never asks for tokens or key values (variable names only).

Answer in the preferred language (`.foreman.json` `context.language`), else the language the human writes in.

## 1. Read versions

### Source of the target version

In chat there is no checkout. Fetch these files yourself with the web fetch tool. Never ask the human for the changelog.

- `https://raw.githubusercontent.com/AndreasByr/foreman/<tag>/VERSION`
- `https://raw.githubusercontent.com/AndreasByr/foreman/<tag>/CHANGELOG.md`
- `https://raw.githubusercontent.com/AndreasByr/foreman/<tag>/update-classes.json`
- `https://raw.githubusercontent.com/AndreasByr/foreman/<tag>/docs/MODULES.md` (list of modules)

Tag: release tags have no `v` prefix (0.2.2, not v0.2.2). Find the newest tag at `https://api.github.com/repos/AndreasByr/foreman/releases/latest` (field `tag_name`). Fallback if that fails: use `main` as <tag>.

Use a local checkout's files only if the human names one or the session runs in one; then the local files win.

Ask only if both the release lookup and the `main` fallback failed; then say which URL failed.

- Installed: the `foreman` value in the project's `.foreman.json`.
- Available: the target version from the fetched `VERSION` (or the local checkout's).
- Equal: say "up to date" and go to step 7. Exception: if the fetched `CHANGELOG.md` has an `## Unreleased` section, still run the dry run (step 4) and show its list.
- Project newer than the release: stop and say so.
- `.foreman.json` or its `foreman` value missing: stop and ask for the installed version.

## 2. List the changes

Read the fetched `CHANGELOG.md`: every version after the installed one, up to the target. The `### Upgrade` part of each version is the source for files, steps and optional items. Show them as **Files**, **Steps**, **Optional**, grouped by version, at most 12 lines in total. The rest: "N more in CHANGELOG.md".

## 3. Explain what happens to files

From `update-classes.json`:

- foreman-owned files are replaced.
- project-owned files stay.
- mixed files (`CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `tools/delegate/config.toml`) are never overwritten. The update prints a diff of each one against the rendered template. The human merges by hand.

## 4. Write the order for Claude Code

One code block. Give it to the human; run nothing yourself.

```
On a clean working tree, on a fresh branch named `foreman-update-<version>` (the STATE.md check skips it) or the batch branch:
Steps 1-2 run in the foreman checkout (cd <foreman checkout>), the rest after cd <project path>.
1. ./install.sh <project path> --update --dry-run
   Read the list.
2. ./install.sh <project path> --update
3. cd <project path>
4. bash scripts/check-config.sh
5. Merge every file marked "keep ... (mixed: merge by hand)" by hand.
6. Commit (inside <project path>). Push only to dev, batch/* or an agent/* branch, never main.
```

Run it first on a test project, never first on a live project. Never run the update on a project without the human's go.

## 5. New modules

The modules of the target version come from the fetched `docs/MODULES.md`. List those that are not in `.foreman.json` `modules`. One line each: what it does. Add a module only after the human says yes. Adding a module is a separate `install.sh --modules ...` call, not part of `--update`.

## 6. Checklist for steps outside the repo

Numbered, each with minutes, built from the Upgrade parts. Mark an item as applying only if the Upgrade parts name it.

1. Update the foreman plugin in claude.ai, or `/plugin update` (2 min).
2. Set the environment variable names the dispatcher or workers now need, names only (5 min).
3. Check the model IDs in `tools/delegate/config.toml` and merge new keys by hand, after the merge in the order above (5 min).
4. Dispatcher: reload the config and run a dry run (5 min). Read the `limits` lines: every `default used` line is a question to the human (`max_tasks`, `cooldown_minutes`, each with the recommendation from `dispatcher/README.md`, Limits). The answer goes into the dispatcher `config.json`.

Then one line per Upgrade item of the versions in between, with minutes.

## 7. Project instructions

In a Claude Code project, the status comes from `block-status.py` of `foreman-project-mode` (run on the project instructions; without code execution, compare the marker version by eye). Put one line into the checklist:

- `current`: `Project instructions up to date`
- `outdated` or `missing`: call `foreman-project-mode` in refresh mode (it shows the result and applies it only after a yes). Checklist line: `Project instructions outdated: run foreman-project-mode (2 min)`
- `newer`: tell the human the skill is older than the instructions and to update the plugin.
- `error:`: compare the marker version by eye.

Outside a project: skip this step.

## 8. Close

One line: what was done (versions, list written, checklist, project instructions state) and what the human does next.

## Rules

- Chat never edits a project repo and never runs the update.
- Names of variables only, never values or tokens.
- Dry run before the real update; test project before a live project.
- Files and steps come from `CHANGELOG.md` and `update-classes.json`, not from memory.
- Every `update` line replaces a foreman-owned file; local patches there are lost, so read the list and `git diff` first.
- Reasons for these rules: `docs/learnings.md`.

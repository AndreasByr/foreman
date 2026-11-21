---
name: foreman-update
description: "Use when the human wants to bring an installed project to the current foreman version ('update foreman', 'upgrade', 'new version'): compares versions, lists the changes, writes the order for Claude Code and a checklist for steps outside the repo, refreshes the project instructions."
---

# foreman-update

The update itself runs in the repo with `install.sh --update`. The chat compares versions, explains the changes and writes the order. This skill never edits a project repo from chat and never asks for tokens or key values (variable names only).

Answer in the preferred language (`.foreman.json` `context.language`), else the language the human writes in.

## 1. Read versions

- Installed: the `foreman` value in the project's `.foreman.json`.
- Available: the `VERSION` file of the foreman checkout or release the human names (in claude.ai: the plugin version).
- Equal: say "up to date" and go to step 7.
- Project newer than the release: stop and say so.
- `.foreman.json` or its `foreman` value missing: stop and ask for the installed version.

## 2. List the changes

Read `CHANGELOG.md`: every version after the installed one, up to the target. The `### Upgrade` part of each version is the source for files, steps and optional items. Show them as **Files**, **Steps**, **Optional**, grouped by version, at most 12 lines in total. The rest: "N more in CHANGELOG.md".

## 3. Explain what happens to files

From `update-classes.json`:

- foreman-owned files are replaced.
- project-owned files stay.
- mixed files (`CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `tools/delegate/config.toml`) are only reported. The human merges them by hand.

## 4. Write the order for Claude Code

One code block. Give it to the human; run nothing yourself.

```
On a clean working tree, on a fresh branch or the batch branch:
1. ./install.sh <project path> --update --dry-run
   Read the list.
2. ./install.sh <project path> --update
3. bash scripts/check-config.sh
4. Merge every file marked "keep ... (mixed: merge by hand)" by hand.
5. Commit. Push only to dev, batch/* or an agent/* branch, never main.
```

Run it first on a test project, never first on a live project. Never run the update on a project without the human's go.

## 5. New modules

List the modules that exist in the target version and are not in `.foreman.json` `modules`. One line each: what it does. Add a module only after the human says yes. Adding a module is a separate `install.sh --modules ...` call, not part of `--update`.

## 6. Checklist for steps outside the repo

Numbered, each with minutes, built from the Upgrade parts. Mark an item as applying only if the Upgrade parts name it.

1. Update the foreman plugin in claude.ai, or `/plugin update` (2 min).
2. Set the environment variable names the dispatcher or workers now need, names only (5 min).
3. Check the model IDs in `tools/delegate/config.toml` and merge new keys by hand (5 min).
4. Dispatcher: reload the config and run a dry run (5 min).

Then one line per Upgrade item of the versions in between, with minutes.

## 7. Project instructions

In a Claude Code project, call `foreman-project-mode` in refresh mode. It compares the version of the `foreman-project-block` marker. Put one line into the checklist:

- block current: `Project instructions up to date`
- otherwise: `Project instructions outdated: run foreman-project-mode (2 min)`

Outside a project: skip this step.

## 8. Close

One line: what was done (versions, list written, checklist, project instructions state) and what the human does next.

## Rules

- Chat never edits a project repo and never runs the update.
- Names of variables only, never values or tokens.
- Dry run before the real update; test project before a live project.
- Files and steps come from `CHANGELOG.md` and `update-classes.json`, not from memory.
- Reasons for these rules: `docs/learnings.md`.

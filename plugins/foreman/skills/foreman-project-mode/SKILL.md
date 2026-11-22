---
name: foreman-project-mode
description: "Use in a Claude Code project (project chat plus one thread per work package): write or refresh the foreman rules in the project instructions, so threads run fixes and milestones themselves under the same gates. Also for update, 'project instructions', 'project mode'."
---

# foreman-project-mode

A Claude Code project has a project chat (the coordinator) and one thread per work package. A thread holds the repo itself. So a fix does not need a hand-off to a second session: the thread runs it under the same foreman rules. This skill puts those rules into the **project instructions**, so every thread of the project follows them.

Answer in the preferred language (`.foreman.json` `context.language`), else the language the human writes in. The block you write is English; only its `Language:` line follows the project.

## 1. Detect the mode

Project mode is on when one of these holds:

- tools of the project host are present (`mcp__hearthbot__*`, a coordinator tool such as `update_project_settings`, `message_coordinator`)
- the session context starts with a project block ("Project instructions", "Where you are")
- the human says "project", "thread" or "project chat"

Otherwise there is no project instruction field. Stop and say so in one line; the other foreman skills work as before.

## 2. Pick your role

| You are | Do |
|---|---|
| The coordinator (project chat) with a settings tool | Write the block yourself (step 4, path A) |
| The coordinator without a settings tool | Give the block to the human (path B) |
| A thread | You cannot edit project settings. Ask the coordinator with `message_coordinator` to apply the block (path A), or give the block to the human (path B). Do not stop your work for it |

## 3. Build the block

Read `references/instruction-block.md`. Fill the placeholders from `.foreman.json`:

- `<dev>` and `<main>` from `branches.dev` and `branches.production` (no staging or prod branch unless `.foreman.json` has one)
- `Language:` from `context.language`
- the module line: tracker `none` or the tracker name, `autopilot` yes or no

- the `Models` line from `.foreman.json` `models`: `threads` maps each category to a class (`strong`, `standard`, `cheap`), `coordinator` and `effort` are single values. Categories: `question` (answer only), `fixpack`, `milestone` (run of a brief), `brief` (milestone brief or slice), `roadmap`, `architecture`, `bugRetry` (bug after a failed first fix), `release`, `docs`. Missing keys use the defaults in the block: `standard` everywhere, `strong` for `brief`, `roadmap`, `architecture`, `bugRetry`. Classes, never version numbers: the coordinator maps a class to the host's current model when it opens the thread (its model-switch tool). No such tool or mapping: it says so once and the thread runs on the project default.

Leave out lines for modules that are off. Keep the block under 2 KB. Never put secrets, tokens, tenant names or URLs into it.

## 4. Apply it

**Path A, tool.** Read the current instructions first. If a `foreman-project-block` marker exists, replace only the text between the marker lines. Otherwise append the block after the human's own text. Never delete the human's text. Show the human the result in one message.

**Path B, paste.** Give the block in one code fence plus one line: open the project's settings, field "Project instructions", paste at the end. If a marker block already exists, tell the human to replace everything between the two marker lines.

Either path ends with one line: `Project instructions: block v<N> written | pasted by the human | offered, not applied`.

## 5. Refresh (update path)

The first marker line carries a version: `<!-- foreman-project-block v3 -->`. Run steps 1 to 4 again whenever:

- foreman was updated (`foreman-update`, or a new plugin version) and the block version in `references/instruction-block.md` is higher than the one in the instructions
- `.foreman.json` changed branches, language or modules
- the human asks

The version comparison is done by `python3 <skill dir>/scripts/block-status.py <file with the current instructions>`, which prints `current vN` (exit 0), `outdated vK (current is vN)` (exit 1), `newer vK (this skill knows vN)` (exit 0), `missing` (exit 3) or `error: ...` (exit 2). In a chat without code execution, compare the number in the marker with the reference by eye.

Compare the version and the filled values. Same: say "up to date" and stop. Different: show what changes in two lines, then apply.

## 6. Rules

- The block must say in its first lines that this project works with foreman and name the skills to use. Never drop that paragraph when you fill in the block.
- The block states the rules; the skills state the steps. Do not copy skill text into the block.
- One block per project. Never a second copy in a thread or a file that agents must also read.
- Applying instructions changes the project for every thread. Show the human the final text, and apply it only after a yes, unless the human asked for it in this conversation.
- No new permissions: the block never allows a push to `main` or `prod`, a merge, or a deploy that the repo rules forbid.

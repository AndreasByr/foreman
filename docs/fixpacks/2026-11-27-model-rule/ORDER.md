Target: dev
Milestone: -
Batch-branch: batch/dev (work branch of this thread: claude/project-thread-7ynkm4, PR to dev)
Urgent: no
Mode: project thread
Fix-pack: 2026-11-27-model-rule
Version: -
Tracker: none

## A1 Analysis: why the model rule in the project block does not take effect

Problem: Threads still start on the default model although the block's Models section lists a class per category.
Expected: cause proven with file and line (and platform limits named), no change.
Board: no interface
Acceptance: cause named, platform limit separated from text defects.

## F1 Fix: block v6, model rule as the human's explicit standing choice

Problem: See A1.
Expected: `instruction-block.md` becomes v6. The Models section (a) states that the table is the human's own, permanent model request for every thread and the coordinator, no new confirmation needed; (b) names the action: set `model` to the ID when opening a thread; (c) carries the model IDs directly per category (grouped by ID), filled from a new optional `.foreman.json` `models.ids` (`strong`, `standard`, `cheap` to model ID); (d) lets a thread that finds itself on another model switch once with its own model-switch tool and say so in one line. No ids in `.foreman.json`: block keeps class names and the line says "no IDs set, thread runs on project default".
Hints: `plugins/foreman/skills/foreman-project-mode/{SKILL.md,references/instruction-block.md}`, `scripts/check-config.sh` + `template/scripts/check-config.sh` (identical), `scripts/test-check-config.sh`, `scripts/test-project-block.sh`, `.foreman.json`, `docs/CONVENTIONS.md`, `docs/WORKFLOW.md`, `CHANGELOG.md` (Unreleased).
Board: no interface
Acceptance: new assertions red before, green after; `bash scripts/test-all.sh` green.

## F2 Fix: document the platform limit and the fallback

Problem: Nothing says that the host sets or switches a model only on the human's own words, nor what to do when it does not.
Expected: `docs/WORKFLOW.md` and SKILL.md step 3 name the limit and the fallback: set the default model for new threads in the project settings (human, once), or tell the coordinator in the human's own words ("use <id> for <category> threads").
Board: no interface
Acceptance: assertion in `scripts/test-project-block.sh` for both texts.

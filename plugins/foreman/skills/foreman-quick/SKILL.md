---
name: foreman-quick
description: Write one complete prompt file for a single coding agent session that sets up and builds a whole project alone (one-shot, no dispatcher, routines or tracker), plus an optional second prompt to go live. Use for demos, prototypes and small projects.
---

# foreman-quick: one prompt, one session, whole project

You produce a prompt file. One Claude Code (or OpenCode) session reads it, sets up the repo, writes requirements, roadmap and rules, builds every milestone, and ends with a report. No dispatcher, no routines, no tracker, no second session needed. The human reads the report and tests.

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. Say "the Agent" inside prompts. Describe what the project must do; put the how-to-work rules into the `CLAUDE.md` the prompt tells the Agent to write.

## When Quick fits

Demo, prototype, throwaway or under two weeks, one developer, no release process. If the human describes users, updates, staging and production or a team, say so and suggest `foreman-project` (full path). The human decides.

## Step 1: questions (at most 3 per round)

Ask only what is missing. Use AskUserQuestion when available, recommended option first.

Round 1:
1. The idea in the human's words: what does it do, for whom, what must work at the end?
2. Stack: a stack they want, or "recommend one". If they have no preference, recommend the simplest stack that fits the goal and the agent's strengths, with one sentence of reason.
3. Target platform: web app, PWA, desktop, CLI, mobile, static site.

Round 2:
4. Deploy: yes (then offer the second prompt) or no (local only).
5. Workers: do cheap workers do the coding (module `delegate`, needs the installer first) or does the Agent build everything itself? Default: the Agent builds itself.
6. Agent: Claude Code (recommended) or OpenCode. Language of the documents.

Only if relevant:
- Accessibility: must it meet WCAG? Which version and level (suggest WCAG 2.2 AA)? Always ask for anything with a screen.
- Login through a third party: then the first milestone needs a test login (switch, non-production only).
- Design rules the human insists on (fonts, no sliders, and so on). Record only what they state.
- House rules for every slice.

Never invent requirements to avoid a question. A missing core answer stops the prompt.

## Step 2: write the prompt

Read `references/prompt-template.md` and fill it. Output one file named `PROMPT-<slug>.md` (a download or a file in the repo; in chat as a single code block if neither is possible). The file is complete: the Agent needs nothing else.

Fill:
- project name, one-sentence goal, audience, platform, stack, agent;
- the requirements content from the answers (must-have, out of scope, constraints, success, accessibility line);
- the rule set for `CLAUDE.md`: with workers, the delegation block; without, the self-build block;
- an initial milestone outline when the human already has one; otherwise the Agent derives it.

Size: the whole prompt stays under about 12 KB. Reference files the Agent will write; do not paste them in.

Before you hand it over, check it against `references/checklist.md`.

## Step 3: optional second prompt (go live)

Ask once after the first prompt: "Do you want a second prompt that puts the finished app on a server?" If yes, ask the minimum: host access (how the Agent reaches the server), deploy tool, domain, DNS provider. Then read `references/golive-prompt-template.md` and produce `PROMPT-<slug>-go-live.md`. The hard rules in that template are not optional and not shortened.

If the human has no deploy knowledge: say that the second prompt does the steps with a log file and stops after two failures; recommend half a day for a first deploy and that the human is present for the approval points.

## Step 4: hand-off

Tell the human, in this order:
1. Where the prompt file is.
2. How to start: open the project folder in a terminal, start the agent, and give it the file ("Read `PROMPT-<slug>.md` and execute it."). With workers: run the foreman installer first (`./install.sh <repo> --project <slug> --scope repo --modules delegate`) and set the worker key.
3. How to resume after an interruption: "Continue per `CLAUDE.md` and `STATE.md`."
4. What the human gets at the end: working code on branch `dev`, one commit per slice, `docs/roadmap-*.md` with a Human Testing section per milestone, a closing report.
5. Time: a small project runs hours to a day of agent time. Name the cost drivers, not a promise.

## What a one-shot produces

Requirements, a roadmap with milestones and slices, `CLAUDE.md` with the rules, a `STATE.md` per milestone with a slice table (status, commit), a brief per milestone, tests and a quality gate (lint, typecheck, test, build; end-to-end for the core flows), a Human Testing checklist per milestone, a closing report. Not produced: tracker tickets, schedules, PRs, deploys, tags.

## Rules

- Quick never deploys. Going live is the separate second prompt.
- The prompt never contains a secret, a token or a real hostname that the human did not give for this purpose.
- The Agent pushes only to `dev`. No PRs, no merges, no tags, no workflows.
- One commit per accepted slice.
- If the human later wants more process (tracker, dispatcher, staging), `foreman-setup` and the Repo or Autopilot profile continue from the same repo; the `docs/` files carry over unchanged.

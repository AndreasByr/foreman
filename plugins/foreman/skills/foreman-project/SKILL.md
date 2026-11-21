---
name: foreman-project
description: Guide a new project from idea to first milestone with foreman. Use when the human starts a project. Asks Quick or full first with a recommendation; full path runs roast, requirements, roadmap, design, repo setup, tracker, dispatcher entry and first milestone.
---

# foreman-project

You guide a new project. First decision: Quick or full. Then you delegate each step to the matching foreman skill and keep the thread: where we are, what is next, how long.

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. Say "the Agent" in agent prompts. At most 3 questions per round; use AskUserQuestion when available. Start each reply with the next action and end with the status line: `Done: ... Now: ... Left: ... (about N min)`.

## 1. Quick or full?

Ask this first, with a recommendation from the criteria. Do not ask the human to decide blind.

| Quick (recommend when most hold) | Full (recommend when most hold) |
|---|---|
| demo, prototype, throwaway | real users, updates, a product that stays |
| under 2 weeks | longer than 2 weeks |
| one developer | team, or someone else tests and approves |
| no release process | staging and production, release rhythm |
| no server, no tracker wanted | tracker, unattended runs, pretest wanted |

Mixed signals: recommend Quick and say that the same repo can move to full later, because requirements and roadmap carry over.

- **Quick:** hand over to `foreman-quick` and stop. Mention that recommended skills can be installed by `foreman-setup`.
- **Full:** continue below.

## 2. Collect project data once

Read `.foreman.json` in the repo (if the repo exists), the chat project's files and `docs/`. Ask only what is missing, one round of at most 3:

- project name and slug, one-sentence goal
- repo (or "none yet"), stack, hosting
- who tests and approves; test environment URL and test tenant or account; what is off limits (production data, other tenants)
- release day, time zone, document language
- tracker: itsaplan, linear or none (from `.foreman.json` modules)

Offer to record the answers under `context` in `.foreman.json` (keys: `name`, `goal`, `stagingUrl`, `devUrl`, `testTenant`, `offLimits`, `language`, `timeZone`, `releaseDay`, `workRun`). Never store tokens or secrets there.

If foreman is not installed in the repo yet, run `foreman-setup` first (or at least give the install command) and return here.

## 3. Check what exists

Look for `docs/requirements.md`, `docs/roadmap-0.N.0.md`, `docs/design.md`. Create only missing ones in the order below. Read existing ones, never regenerate them.

## 4. The path

Present the steps once as a numbered list with minutes, then work through them one at a time.

1. **Roast and requirements (30 to 60 min).** Run `foreman-roast`. Result: `docs/requirements.md` with the accessibility line.
2. **Roadmap (20 to 40 min).** Run `foreman-roadmap` on the requirements. One file per version, `docs/roadmap-0.N.0.md`. The tracker question is already answered by the modules.
3. **Design file and boards (30 to 90 min), for projects with a UI.**
   1. Run `foreman-design-file` for `docs/design.md`.
   2. Build a design system artifact from it (tokens, components, README). A default design system of the human has priority; otherwise ask.
   3. Build design boards for screens and flows. They are the reference for which functions and layouts exist. Boards are made only in chat and approved there by the human.
   4. Export the reference canvas as HTML to `docs/design-reference/` so the Agent can read it.
   5. If the repo has a token file with a CI check, every later change to `design.md` updates that file in the same commit.
   Write the conflict order into the repo: requirements > design.md > roadmap > milestone brief.
4. **Repo setup (10 min with the command ready).** Check scope and modules in `.foreman.json`. Branches `main` and `dev`; with staging and production separated also `prod`; with Autopilot also the batch branches. Guards active (`git config core.hooksPath .githooks`). `tools/delegate/config.toml` has its model IDs filled in (see `foreman-setup`). `CLAUDE.md` carries the `Workflow:` line.
5. **Recommended skills for this project (5 min).** Ask again, per project: which of the recommended skills (`foreman-setup`, `references/recommended-skills.md`), and global or project scope. Skills already installed globally are not asked again. Run or print the command only after a yes.
6. **Tracker project (10 to 20 min).** Read `references/tracker-and-dispatcher.md`.
   - itsaplan: a project with the status columns and labels, bot account key as `ITSAPLAN_API_KEY`.
   - linear: one project per version in the team.
   - none: nothing to create; `docs/answers/` and `docs/uat/` carry answers and approvals.
7. **Dispatcher entry (10 min), Autopilot only.** Add the project to the dispatcher's `config.json` on the human's machine, set the fire URL and token variable names, run `--dry-run`. Read `references/tracker-and-dispatcher.md`. Creating the work-run routine is the human's step in the routines UI or from a Claude Code session in the cloud environment, never from chat.
8. **First milestone (20 to 40 min).** Run `foreman-brief` for the first milestone (design first for UI, role review in briefing mode). For a login through a third party, put the test login into this milestone's brief now.

After each step: one line of what is done, then the next step with minutes.

## 5. Rules

- Do not skip requirements. A project without them is not started.
- Boards are made and approved in chat, never by the Agent.
- Deploy never runs from a cloud session. It is a separate step started by the human.
- Tokens and secrets never go into chat, files or `.foreman.json`.
- The Agent pushes to `dev` or a batch branch, never to `main` or `prod`.
- If the human wants to stop after any step, summarize the state in a short list so the next session can resume with `foreman-brief` or `foreman-project`.

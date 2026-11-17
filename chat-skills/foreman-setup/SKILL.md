---
name: foreman-setup
description: Set up a new software project with the foreman workflow: requirements, roadmap, design file, then optionally the repo workflow or full autopilot. Use when the human starts a new project or asks to install foreman.
---

# foreman setup

Goal: a new project where orders run without copy-paste. Chat plans and sends orders. A Claude Code session in the cloud plans the work, cheap workers code, the session accepts. Results come back as files in the repo.

Agent prompts you write describe WHAT, not how, and say "the Agent". Ask at most 3 questions per round. Ask only what is missing.

## 0. Facts, scope, existing files

Facts to collect: project name and slug, GitHub repo, stack, hosting, who tests, test environment, what is off limits (production data and tenants), who deploys. Deploys never run from a cloud session.

**Always ask scope first** (one choice question, never skip):

- **Docs only:** requirements, roadmap, design file (sections 1 to 3). No repo setup, no tracker.
- **Repo workflow:** docs plus cloud coding with workers, a dispatcher on demand, milestones (sections 4 to 8). No tracker, no schedule.
- **Full autopilot:** everything, plus scheduled routines, batch branches, release day (section 9).

The answer is the order for everything that scope creates. Create nothing beyond it.

Then ask which optional modules apply (`references/repo-setup.md` lists them):

- `ollama`: workers on Ollama Cloud. Without it, workers are Claude models.
- `linear`: tracker mirror in Linear.
- `notion`: pretest handoff and UAT list in Notion. Without it, the handoff is a file.
- `autopilot`: scheduled routines. Implied by the scope "Full autopilot".

Scope and modules are recorded in the repo by foreman's installer (`.foreman.json`) and in the `Workflow:` line of `CLAUDE.md`, so later skills do not ask again.

Check which files exist (project context, repo `docs/`, files the human names): `requirements.md`, `roadmap-0.N.0.md`, `design.md`. Create only missing ones, in the order below. Read existing ones, never regenerate them.

## 1. requirements.md

Missing: run skill `foreman-roast`. Put the result in the repo under `docs/`.

## 2. Roadmap

Missing: run skill `foreman-roadmap` on `docs/requirements.md`. One file per version (`roadmap-0.N.0.md`) under `docs/`. Its tracker question is already answered by the scope: with module `linear` it creates the version's tracker project, otherwise it records no tracker.

## 3. design.md and design boards

1. Missing `design.md`: run skill `foreman-design-file`. Put it under `docs/`.
2. From `design.md` build a design-system artifact (tokens, components, README). A default design system of the human has priority; otherwise ask.
3. From it build design artifacts for screens and flows. These are the **design boards**: the reference for which functions and layouts exist. Boards are made only in chat and approved there by the human.
4. Export the reference canvas as HTML to `docs/design-reference/` in the repo so the cloud Agent can read it.
5. If the repo has a machine-readable token file with a check in CI, every later change to `design.md` from chat updates that file in the same commit.

Write the conflict order into the repo: requirements > design.md > roadmap > milestone brief.

Scope "docs only" ends here.

## 4. How the session and the workers cooperate

Rules for every order in the repo:

1. The session plans and accepts. Workers research and code, through `tools/delegate/run_task.py`. Models are set only in `tools/delegate/config.toml`, never in a task, prompt or skill.
2. Never push to `main` or `prod`. Push to `dev`, a batch branch or the given work branch.

Read `references/delegation.md` before you propose the model distribution, write the delegation rules, or change them. It holds the role table, the model template, the check for newer versions, and the order of a coding task.

## 5. Repo setup

Read `references/repo-setup.md`. Short form: foreman's `install.sh` creates everything (`git clone https://github.com/AndreasByr/foreman`, then `./install.sh <target-repo> --project <slug> --modules <list> --session-model <exact id>`). Tell the human to run it, or run it yourself if you have a shell with the target repo. Do not describe the files one by one.

## 6. Environment and dispatcher

Read `references/repo-setup.md`, part "Environment and dispatcher". Hard rule: routines are created from a Claude Code session in the cloud environment, never from chat.

## 7. Milestones

1. The brief lives at `docs/milestones/Mnnn/Mnnn-CONTEXT.md`: goal, starting point, capabilities (3 to 8, from the user's view), binding documents, fixed decisions, out of scope, testable success criteria, verification commands (no pipes), risks. No task list, no implementation details, no secrets, no deploy. Reference documents, do not copy them. Over about 10 capabilities: split the milestone.
2. Hand-off without autopilot: the human pastes one line into a Claude Code session: "Run milestone Mnnn". With autopilot: commit the brief to `batch/mnnn` with `Status: planning`; the delegation run picks it up.
3. The Agent splits the milestone into slices and tasks, delegates to workers, accepts, commits per slice, keeps `STATE.md` current. Each call does one slice.
4. A browser pretest runs before UAT (skill `foreman-pretest`). Bugs it finds go back as one fix pack.
5. Login through a third party (OAuth): a pretest cannot sign in there. The milestone that adds the login also adds a test login that is active only in dev/test and only with its own switch (for example `TEST_LOGIN=1`), independent of whether OAuth is configured. In staging and production the app refuses to start with that switch. Write this into the brief, do not discover it at pretest time.
6. UAT and approval are the human's. Deploy is separate, never from the cloud session.

## 8. Bugs

Analysis first (investigate only, prove the cause), then the fix order. One concern per fix, minimal change. No deploy, no browser verification inside the fix. Several findings at once: one fix pack (F1, F2, ...) for one session. With autopilot every fix is a fix pack, even a single one. A finding about a milestone that is not `done` yet (also after merge, before UAT approval) goes into that milestone's `STATE.md` as `Status: rework`. Chat writes to a `STATE.md` only when its `Lock:` is `free` and never during `batch-pr`; otherwise check again later.

## 9. Autopilot (scope "Full autopilot")

Read `references/autopilot.md`. Show the list of what will be created once, then create it without further questions. If an access is missing (tracker, routines), create the rest and say what is missing.

## Finish

Report briefly: what was created, which model distribution is set, what is missing, and the one next action (usually: write the first milestone brief with skill `foreman-brief`).

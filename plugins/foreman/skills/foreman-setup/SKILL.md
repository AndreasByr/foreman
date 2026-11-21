---
name: foreman-setup
description: "Guided setup of the foreman workflow. Use at first setup or when the environment changed (machines, plans, gateway, tracker), not for every new project; new projects use foreman-project. Asks a short adaptive question catalog, recommends Quick, Repo or Autopilot, and returns the install command and a checklist."
---

# foreman-setup

You lead the human through setting up foreman. The result is a profile (Quick, Repo or Autopilot), a module list, the exact `install.sh` command, a checklist of manual steps and a list of environment variable names without values.

Ask for the preferred language first (step 0) and use it for every reply and every document from then on. Until it is answered, reply in the language the human writes in. Never ask for secrets and never print one.

## How you talk

The human may have trouble holding a long plan in their head. Keep the session easy to follow:

1. Start every reply with the next action or the next question, not with background.
2. Number steps. Give each step a time estimate ("about 10 min"). Be honest: a first itsaplan install takes longer than the label on the box.
3. Repeat the status in one line in each reply: `Done: A, B. Now: C. Left: D, E (about 25 min).`
4. Show wins. When a step is finished, say so in one line before the next one.
5. Ask at most 3 questions per round, 1 when the answer decides the path. Use the AskUserQuestion tool when it exists, with 2 to 4 options and the recommended one first. Otherwise a numbered list the human answers with digits.
6. Skip what earlier answers already settle. Never ask the same thing twice.
7. Lists have at most 5 items. Move the rest to a file or a follow-up.
8. A focus or ADHD mode skill is optional. Mention it once at the start if the human says they want shorter, more structured answers; never install it for them.

## Flow

### 0. Language (under 1 min)

Ask one question: "Which language do you prefer, for our conversation and for the project documents?" Offer the language the human writes in first, English second, "other" third. Use the answer from now on. It goes into `.foreman.json` as `context.language`; every foreman skill and every work-run report reads it. Skill files stay in English; only their output follows this setting.

### 1. Orient (1 min)

Say in three lines what happens: questions (about 10 min), a recommendation, then the command and the checklist. Ask which of the three outcomes the human wants if they already know: a quick prototype, a repo with the workflow, or a project that runs on its own while they sleep. Unknown: continue with the catalog. Only the human's own statement "quick prototype" skips block C and step 2b. It is not a recommendation and is never inferred from the answers of block B.

### 2. Question catalog (about 10 min)

Read `references/question-catalog.md`. Four blocks, adaptive:

- A. What do you know (decides how deep you explain)
- B. What do you need (decides the profile)
- C. What do you have (full inventory for every profile except Quick; decides modules and missing prerequisites)
- D. How do you work (decides schedule, release day, notifications)

Ask block A first. Its answers set your explanation depth for the rest of the session. Ask one block per round, at most 3 questions; block C takes three rounds (nine questions, C1 to C9). After each block, say what you now know in one line. Every "I don't know" or "weiß nicht" is recorded as `unbekannt`, never guessed, and named later as a gap.

### 2b. Summary and confirmation (about 2 min)

1. Collect all answers in the workspace.json format (`references/workspace-format.md`) as `<answers.json>`. The consent decision (C9, `chatgptViaGateway`) is part of the answers, so it appears in the summary and is written with `workspace.json`.
2. Show the summary in exactly the layout of `scripts/setup-summary.py`. The scripts live in the foreman repo clone. With a shell and a clone, run `python3 scripts/setup-summary.py <answers.json>`; without a clone, print the same layout yourself.
3. Every line comes from an answer. Nothing is inferred. `unbekannt` stays `unbekannt`. Below the summary, name each gap in one line with what it blocks.
4. Ask the human to confirm or correct. Give no recommendation, no profile and no install command before the human confirms. Corrections go back into the answers, and the summary is shown again.
5. After confirmation, write `workspace.json`. With a shell: `python3 scripts/setup-summary.py <answers.json> --write workspace.json --confirmed`. Otherwise output the JSON for the human to save. Never write secrets into it.
5b. Tell the human to store the confirmed `workspace.json` in the project documents (project files) of the foreman project; the chat reads it there. Stored once, refreshed after every change of the environment.
6. Put the same content into the `infra` block of `.foreman.json` through `install.sh --workspace <file>`.

Quick: for a quick prototype no workspace.json is written and the summary step is skipped; the block B and A answers go straight to step 3 (recommendation). Everything else about the summary stays as described above.

### 3. Recommend a profile

Only after the human confirmed the summary of step 2b. Read `references/profiles-and-modules.md`. State one recommendation and the reason in two sentences, then the two alternatives in one line each:

| Profile | For | Needs |
|---|---|---|
| Quick | demo, prototype, throwaway, under two weeks, one person | a coding agent, nothing else |
| Repo | a product that lives longer, one or few people, no unattended runs | agent, git; GitHub recommended |
| Autopilot | work runs without you: dispatcher, tracker, pretest, release day | agent with routines, GitHub, a machine or server for the dispatcher |

The human decides. A smaller profile than recommended is fine.

### 4. Modules and agent

From `references/profiles-and-modules.md`: pick modules and the `--agent`.

- `tracker-itsaplan`: strongly recommended for Autopilot. Self-hosted, REST. No tracker (`none`) is fully supported: questions, answers and UAT approvals then run through files in the repo.
- `tracker-linear`: optional alternative. Only one tracker module at a time.
- `delegate`: cheap workers via Ollama Cloud or a gateway. Optional.
- `gateway`: LiteLLM proxy for workers. Optional. If a gateway is running (the summary says `Gateway: running`), the installer writes the preset (`--gateway-url`, `--fallback-model`; see `docs/MODULES.md`). With a running gateway and consent (`accepted-risk`), the installer writes `task-normal`. If none runs and the human has a ChatGPT plan, the optional block in `references/gateway-block.md` (about 45 minutes) is available.
- `autopilot`: dispatcher side in the project. Needs GitHub and a machine for the dispatcher.
- `pretest`: browser pretest in the cloud work run.
- Claude Code is the recommended agent (routines and API trigger are the dispatcher's target). OpenCode and others work through `AGENTS.md`; resuming and parallel runs are then the human's job.

### 5. Missing prerequisites

Compare "what you have" with the modules. For each gap read the matching part of `references/prerequisites.md` and give: why it is needed, steps, duration, and the cheaper alternative. Typical gaps: no GitHub, no server, no deploy knowledge, no itsaplan, no Docker. Say openly when a gap blocks a profile ("Autopilot needs a machine that runs every 10 minutes; without one, Repo plus a manual start is the honest choice, or the hourly fallback routine as plan B").

Order the gaps as numbered steps with minutes. Do not start installing for the human unless they ask and you have a shell.

### 6. Recommended skills (ask, then act)

Read `references/recommended-skills.md`. Ask per skill or "all recommended", and global or per project. Run a command only after a yes and only if you have a shell; otherwise print it. Do this once here and again per project in `foreman-project`.

### 7. Output

Produce, in this order, as one message (a file when you can write files):

1. **Install command**, complete, copy-ready. Flags in `references/profiles-and-modules.md`. The command includes `--workspace workspace.json` and, with a running gateway, `--gateway-url` and `--fallback-model`.
2. **Checklist** of manual steps, numbered, each with minutes.
3. **Environment variables**, names only, grouped by where they are set (dispatcher host, cloud environment, CI).
4. **First action**: the single next thing to do, usually "run the command", then "start `foreman-project`".

Close with the status line and the list of what is already done.

### 8. After install

When the human reports the install ran: check `.foreman.json` (version `0.2.0`, agent, modules), run the repo's checks if you have a shell (`bash scripts/check-config.sh`), then hand over to `foreman-project`. Model IDs in `tools/delegate/config.toml`: propose a distribution by role from `references/delegation.md` after checking the current model lists for newer versions; the human decides per row.

### 9. Claude Code project (optional, 2 min)

If you run in a Claude Code project (project chat plus threads), run `foreman-project-mode` after the install: it writes the foreman rules into the project instructions, so every thread works the same way. It is also the update path for projects that already have foreman.

## Rules

- Routines are created in the Claude Code routines UI or from a Claude Code session in the cloud environment, never from chat.
- API tokens and fire tokens are generated by the human in the UI and set as environment variables. They never appear in chat, files or logs.
- Without GitHub or a server a working path exists: Quick, or Repo with local git and no remote.
- Never `opusplan` as session model for autonomous runs.
- Do not set up what the chosen profile does not include.
- Never infer an answer. A fact in the summary, the profile or the command that no answer gave is a defect.

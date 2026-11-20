# Quick prompt template

Fill the angle-bracket parts. Delete the block that does not apply (workers or self-build). Keep the rest in this order. The result is `PROMPT-<slug>.md`.

````markdown
# Order: set up and build <Project name> in one session

You are the Agent for the project **<Project name>**. This prompt is your only order. Read it completely before the first command. Work without questions; when something is unclear, decide the smallest reasonable thing, write the decision into `docs/decisions.md` and continue.

## 1. The project

- Goal: <one sentence, no marketing>
- Audience: <who uses it>
- Platform and stack: <web app / PWA / CLI ...; stack>
- Must-have (v1): <list, each testable>
- Out of scope (v1): <list>
- Constraints: <time, budget, hosting, libraries the human fixed, with a short reason each>
- Success: <how the human knows it works>
- Accessibility: <WCAG 2.2 AA required | not required>
- Design rules (stated by the human): <list or "none">
- Language: documents in <language>; user-facing texts in <language(s)>.

## 2. Set up the repo (first)

1. If the folder is not a git repository: `git init`. Create branches `main` and `dev`; work only on `dev`.
2. Install a git hook that blocks commits on `main` and pushes to `main`: `.githooks/pre-commit`, `.githooks/pre-push`, then `git config core.hooksPath .githooks`.
3. Write `CLAUDE.md` (at most about 2 KB, rules only, no dates or explanations) from section 5 below. Include the line `Workflow: repo` and the resume line.
4. Write `docs/requirements.md` from section 1: goal, audience, core hypothesis, must-have, nice-to-have, out of scope, non-functional (including the accessibility line), constraints, success, open questions.
5. If the project has a UI and `docs/design.md` is missing: write a short token-based `docs/design.md` (colors, type in `rem`, spacing, radius, component states, focus and motion rules) from the stated design rules. Contrast pairs meet the required level.
6. Write `docs/roadmap-0.1.0.md`: milestones in dependency order, each with slices (one bounded unit of work, a checkable done state) and a **Human Testing** section: test goal, acceptance criteria, a flow checklist with expected results, error cases, a marked go/no-go criterion. Mark criteria you can verify yourself `[agent]`; only what needs a second real account, real hardware or a product decision is `[human]`.
7. Write `docs/milestones/_TEMPLATE/STATE.md` and, per milestone, `docs/milestones/Mnnn/Mnnn-CONTEXT.md` (goal, starting point, capabilities, binding documents, fixed decisions, out of scope, testable success criteria, verification commands, risks) when you start that milestone.
8. Commit: `chore: project setup`.

## 3. Work loop

For each milestone in order:

1. Write the brief `docs/milestones/Mnnn/Mnnn-CONTEXT.md` and `STATE.md` with the slice table (slice, title, status, commit).
2. Per slice: implement, run the quality gate, fix until green, commit once (`feat(Mnnn/Snn): <title>`), set the slice to `accepted` in `STATE.md` with the commit.
3. When the last slice is accepted: write `docs/agent-reports/<date>-Mnnn.md` (what was built, how it was checked, open findings, Human Testing steps), then continue with the next milestone.
4. Stop only when blocked: a product decision you cannot reasonably make, a missing access, or the same step failing twice. Write the cause and the question into `STATE.md` under "Open findings", finish what does not depend on it, and report.

A slice is done when lint, typecheck, tests and build are green and every core flow has an end-to-end test that fails without the change.

## 4. End of the session

Write `docs/agent-reports/<date>-final.md`: what exists, how to run it locally (exact commands), the check results, per milestone the Human Testing steps, open findings, and the suggested next steps. Push `dev` only. Do not open PRs, merge, tag, release or deploy.

## 5. Rules for `CLAUDE.md`

Precedence on conflict: `docs/requirements.md` > `docs/design.md` > `docs/roadmap-0.1.0.md` > milestone brief.

Resume after an interruption: "Continue per `CLAUDE.md` and `STATE.md`": read the roadmap and the `STATE.md` of the open milestone and continue with the next open slice.

Git: work and push only on `dev`. Never push to `main`. Check `git rev-parse --abbrev-ref HEAD` and the target before every push. No force push, no deletions, no PRs, no merges, no tags, no releases, no workflows, no deploys. One commit per accepted slice.

Safety: never touch production data or servers. No SSH, no deploys. Operations come only as files under `infra/` and `docs/ops/`. Secrets never in files, logs or commits; `.env.example` holds placeholders only.

Quality: lint, typecheck, tests and build green per slice; end-to-end tests for core flows. <WCAG line: accessibility is binding for every slice at the required level>.

<DELETE ONE OF THE TWO BLOCKS>

[Workers block]
Plan and accept, workers execute. The Agent splits each slice into small, independent tasks and writes task files under `tools/delegate/tasks/`. Every task file names a `role`; models are set only in `tools/delegate/config.toml`, never by the Agent, a task or a prompt. Code changes use `execution_simple` or `execution`, never `completion` or `subagent`. Run `python3 tools/delegate/run_task.py <task-file>`. Accept without trusting the worker's report: read the diff, run tests, typecheck and lint, check that only intended files changed; on defects write a new, more precise task. The Agent codes itself only after exit code 1, in task files and config, or for merge conflicts. No Claude subagents for coding; parallel work means several wrapper calls. Workers never commit. The closing report names role and model per task.
Prerequisite check before the first slice: `tools/delegate/run_task.py` exists and the worker key variable is set. If not, stop and report.

[Self-build block]
The Agent builds every slice itself, test first where it fits: write the test, see it fail, implement, see it pass. Small commits only at slice end. If a delegation setup exists in the repo, ignore it.

UI and text: for UI work read the design skills installed in `.claude/skills/` or `~/.claude/skills/` if any; every visible text follows the installed writing skills; `docs/design.md` and the stated design rules win on conflict. Keep buttons clickable instead of `disabled`: show a loading state with `aria-busy`, ignore repeated clicks in the handler. Font sizes in `rem`.

<IF third-party login> The milestone that adds the login also adds a test login: its own switch (for example `TEST_LOGIN=1`), active only on non-production hosts, never as admin; the app refuses to start on production with the switch on.
````

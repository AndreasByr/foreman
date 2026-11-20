# {{PROJECT_NAME}} – rules for coding agents

Workflow: {{SCOPE}} · Modules: {{MODULES}} · Agent: {{AGENT}} (see `.foreman.json`). Same rules as `CLAUDE.md`, written for agents that read `AGENTS.md` (OpenCode and others).

Skills live in `.claude/skills/<name>/SKILL.md`. OpenCode discovers that folder itself (it also reads `.opencode/skills/` and `.agents/skills/`); if your agent does not, read the named file before the matching work.

1. **Plan and accept; workers code** through `tools/delegate/run_task.py` when module `delegate` is on (every task names a `role`; models live only in `tools/delegate/config.toml`). Without workers, you code yourself and accept your own work with the same checks. Read `.claude/skills/foreman-delegation/SKILL.md` before any coding order or push.
2. **Accept mechanically first:** scope check (only files the task names), tests, typecheck, lint, a test red before and green after the fix. Only then a review.
3. **Push only** to `dev`, `batch/*` or `agent/*`. Never `main` or `prod`, never force push, never delete `main`/`dev`/`prod`. This agent has no Claude hooks: `.githooks/pre-push` enforces it (run `git config core.hooksPath .githooks` once per clone; `install.sh` did it). Never use `--no-verify`.
4. **Nothing outward-facing without an order:** no PR, merge, tag, release, deploy or branch deletion unless the human or the batch and deploy skills allow it.
5. **State lives in `STATE.md`.** Never set tracker statuses by hand; `node scripts/state-mirror.mjs` mirrors them.
6. **Orders:** milestone `.claude/skills/foreman-milestone`; fix pack `foreman-fixpack`; batch PR `foreman-batch`; release `foreman-deploy`; work run `foreman-dispatch-run`; pretest `foreman-pretest`.
7. **Bugs:** analysis first (prove the cause, change nothing), then the fix. One concern per fix, minimal change.
8. **Never touch production tenants or data.** Test only against test tenants.
9. **No UI without an approved design board** (`docs/design-reference/`). Missing board: `needs-input`.
10. **Learnings go to `docs/learnings.md`,** not into skills or this file.

Document order on conflict: `docs/requirements.md` > `docs/design.md` > roadmap > milestone brief > fix pack.

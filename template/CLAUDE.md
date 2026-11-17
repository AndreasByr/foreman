# {{PROJECT_NAME}} – rules for Claude Code

Workflow: {{SCOPE}} · Modules: {{MODULES}} (see `.foreman.json`)

1. **Plan and accept, don't code.** Workers code through `tools/delegate/run_task.py`; every task names a `role`, models live only in `tools/delegate/config.toml`. You code yourself only after exit code 1. Read `.claude/skills/foreman-delegation/SKILL.md` before any coding order or push.
2. **Accept mechanically first:** scope check (only files the task names), tests, typecheck, lint, a test red before and green after the fix. Only then the `validation` role.
3. **Push only** to `dev`, `batch/*` or your `agent/*` branch. Never `main` or `prod`, never force push, never delete `main`/`dev`/`prod`. A guard hook enforces this.
4. **Nothing outward-facing without an order:** no PR, merge, tag, release, deploy or branch deletion unless the human or the batch/deploy skills allow it. Finished work is not an order.
5. **State lives in `STATE.md`.** Never set tracker statuses by hand; `scripts/state-mirror.mjs` mirrors them.
6. **Orders:** milestone → `foreman-milestone`; fix pack → `foreman-fixpack`; batch PR → `foreman-batch`; release → `foreman-deploy`; routine run → `foreman-dispatch-run`.
7. **Bugs:** analysis first (prove the cause, change nothing), then the fix. One concern per fix, minimal change.
8. **Never touch production tenants or data.** Test only against test tenants.
9. **No UI without an approved design board** (`docs/design-reference/`). Missing board → `needs-input`.
10. **Learnings go to `docs/learnings.md`,** not into skills or this file. Keep this file under 2 KB.

Document order on conflict: `docs/requirements.md` > `docs/design.md` > roadmap > milestone brief > fix pack.

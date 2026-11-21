# Project instruction block (v1)

Copy everything between the two marker lines into the project instructions. Fill the `<...>` values from `.foreman.json`; drop lines whose module is off.

````markdown
<!-- foreman-project-block v1 -->
## foreman (workflow rules)

Workflow: foreman, repo `<scope>`. Language: `<language>`. Tracker: `<none|itsaplan|linear>`.

**Roles**
- Project chat (coordinator): triage only. Sorts each request into a question, a fix pack or a milestone, opens one thread per work package, passes UAT lists and PR links to the human. Does not edit code.
- Thread: owns the repo. Runs the work itself with the repo skills (`foreman-fixpack`, `foreman-milestone`, `foreman-delegation`). No second session, no hand-off.

**Fix flow in a thread**
1. Header first: Target, Milestone, Batch-branch, Urgent, Mode, Fix-pack id, Version, Tracker. If unclear, ask once.
2. Write `docs/fixpacks/<id>/ORDER.md` and `STATE.md`, then work the items. Analysis first (prove the cause, change nothing), then the fix. One concern per fix, minimal change, a test that fails before and passes after.
3. Gates before reporting: scope check, tests, typecheck, lint. Then a UAT checklist for the human.
4. A small fix during a running milestone goes on that milestone's batch branch, in the same thread, with an entry in `STATE.md`.

**Branches and approval**
- Push only to `<dev>`, `batch/*` or the thread's own `agent/*` or `fix/*` branch. Never `<main>` or `prod`. No force push.
- PR, merge, tag, release, deploy and branch deletion only on the human's explicit go. Finished work is not an order.
- Never touch production tenants or data. No UI without an approved design board.

**State**
- `STATE.md` is the record. Tracker statuses are written by the mirror script only.
- Learnings go to `docs/learnings.md`.
<!-- /foreman-project-block -->
````

## Notes for the maintainer

- Change the version number in both marker lines whenever the block's rules change. `foreman-project-mode` step 5 compares it.
- Keep the block under 2 KB. Rules that need steps belong in a skill.

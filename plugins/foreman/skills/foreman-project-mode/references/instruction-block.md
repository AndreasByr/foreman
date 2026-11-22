# Project instruction block (v2)

Copy everything between the two marker lines into the project instructions. Fill the `<...>` values from `.foreman.json` (`models` too; missing keys keep the defaults shown); drop lines whose module is off.

````markdown
<!-- foreman-project-block v3 -->
## foreman (workflow rules)
Workflow: foreman, repo `<scope>`. Language: `<language>`. Tracker: `<none|itsaplan|linear>`.

**This project works with foreman.** Use the matching foreman skill for every request: `foreman-roast`, `-roadmap`, `-design-file`, `-brief` for planning, `-fix` for bugs, `-pretest` and `-role-review` for tests, `-release` for releases (all `foreman-` prefixed). Repo sessions load `foreman-delegation` before code or pushes.

**Roles**
- Project chat (coordinator): triage only. Sorts requests into question, fix pack or milestone, opens a thread per work package, passes UAT lists and PR links on. No code edits.
- Thread: owns the repo. Runs the work with `foreman-fixpack`, `foreman-milestone`, `foreman-delegation`.

**Models** (class per thread category, set at thread start)
`<question=standard fixpack=standard milestone=standard brief=strong roadmap=strong architecture=strong bugRetry=strong release=standard docs=standard>`; coordinator `<standard>`, effort `<medium>`. `bugRetry`: bug after a failed first fix. Cheap class never default.

**Fix flow in a thread**
1. Header first: Target, Milestone, Batch-branch, Urgent, Mode, Fix-pack id, Version, Tracker.
2. Write `docs/fixpacks/<id>/ORDER.md` and `STATE.md`, then the items. Analysis first (prove the cause, change nothing), then the fix: one concern, minimal change, a test red before and green after.
3. Gates before reporting: scope check, tests, typecheck, lint. Then a UAT list.
4. A small fix during a running milestone goes on its batch branch with a `STATE.md` entry.

**Branches and approval**
- Push only to `<dev>`, `batch/*` or the thread's own `agent/*`/`fix/*` branch. Never `<main>` or `prod`. No force push.
- PR, merge, tag, release, deploy, branch deletion only on the human's explicit go. Finished work is no order.
- Never touch production tenants or data. No UI without an approved design board.

**State:** `STATE.md` is the record. Tracker statuses come from the mirror script only.
<!-- /foreman-project-block -->
````

## Notes for the maintainer

- Change the version number in both marker lines whenever the block's rules change. `foreman-project-mode` step 5 compares it.
- Keep the block near 2 KB (v3: just over 2 KB with the model table). Rules that need steps belong in a skill.

Status: fixpack · since 2026-11-23T08:50Z · F1 to F4 done, review open
Target: dev
Branch: claude/project-thread-hyupfn
PR: -
Next: review, final run, PR
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-state-gate

Start commit: 949ca60

## Points

| # | Type | Title | Status | Areas | Check | Board | Red run (SHA) | Green run (SHA) | Commit |
|---|---|---|---|---|---|---|---|---|---|
| A1 | analysis | Why STATE.md drifts in project threads | done | skills, block, CI | code paths | no interface | - | - | see Analysis |
| F1 | fix | CI check: STATE.md must change with code | done | template/scripts, guards workflow | node scripts/test-check-state-touched.mjs | no interface | rc=1 on 367d1ef (module missing) | rc=0, 9 tests | 265272f |
| F2 | fix | STATE.md update is a gate in the skills | done | delegation, fixpack, milestone skills | bash scripts/test-state-gate.sh | no interface | rc=1 on 265272f + test | rc=0, batch-run -23 B vs baseline | 22036c1 |
| F3 | fix | Slimmer STATE template | done | _TEMPLATE/STATE.md | bash scripts/test-state-gate.sh | no interface | rc=1 on 22036c1 (template check) | rc=0, mirror 23/23, measure 64/64 | dd2196d |
| F4 | fix | Block v4: gate and coordinator rule | done | instruction-block.md, SKILL.md | bash scripts/test-project-block.sh | no interface | rc=1 on dd2196d + test | rc=0 | see git log |

## Analysis A1

Cause: nothing makes the `STATE.md` update a condition, and nothing reads it without autopilot.
1. The only rule is a mid-flow step: `foreman-fixpack/SKILL.md:43` ("Update STATE.md after every point"). `foreman-delegation/SKILL.md` has 0 mentions of `STATE.md`, so its acceptance order and closing report never ask for it.
2. The block's gate list (`instruction-block.md:22`, v3) is "scope check, tests, typecheck, lint". `STATE.md` is not a gate, so a thread can report done with a stale one.
3. No check: the workflows (`.github/workflows/*.yml`) test the mirror script but never whether a PR touched a `STATE.md`. Autopilot reads it every run and corrects it; project threads get no such feedback.
4. The coordinator rule in the block says "passes UAT lists and PR links on" with no check of `STATE.md`.
5. The fix pack table has 10 columns per point, more to keep current.
Proposal: F1 to F4 of the order.

## Review

## Inherited red

## Log

- 2026-11-23T08:50Z · plan · analysis first, F1 to F4 in order
- 2026-11-23T09:05Z · A1 analysis written · -
- 2026-11-23T09:15Z · F1 script, test, workflow, test-all, install test green · see git log
- 2026-11-23T09:35Z · F2, F3 done · 22036c1, dd2196d
- 2026-11-23T09:50Z · F4, changelog, WORKFLOW line · see git log

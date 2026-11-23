Status: fixpack · since 2026-11-23T08:50Z · plan written
Target: dev
Branch: claude/project-thread-hyupfn
PR: -
Next: A1 analysis, then F1
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-state-gate

Start commit: 949ca60

## Points

| # | Type | Title | Status | Areas | Check | Board | Red run (SHA) | Green run (SHA) | Commit |
|---|---|---|---|---|---|---|---|---|---|
| A1 | analysis | Why STATE.md drifts in project threads | open | skills, block, CI | code paths | no interface | - | - | - |
| F1 | fix | CI check: STATE.md must change with code | open | template/scripts, guards workflow | node scripts/test-check-state-touched.mjs | no interface | - | - | - |
| F2 | fix | STATE.md update is a gate in the skills | open | delegation, fixpack, milestone skills | bash scripts/test-state-gate.sh | no interface | - | - | - |
| F3 | fix | Slimmer STATE template | open | _TEMPLATE/STATE.md | bash scripts/test-state-gate.sh | no interface | - | - | - |
| F4 | fix | Block v4: gate and coordinator rule | open | instruction-block.md, SKILL.md | bash scripts/test-project-block.sh | no interface | - | - | - |

## Review

## Inherited red

## Log

- 2026-11-23T08:50Z · plan · analysis first, F1 to F4 in order

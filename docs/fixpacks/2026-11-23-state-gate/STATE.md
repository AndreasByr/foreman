Status: uat-ready · since 2026-11-23T10:00Z · review pass, waiting for UAT
Target: dev
Branch: claude/project-thread-hyupfn
PR: <number>
Next: UAT by the human, then release only on go
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-state-gate

Start commit: 949ca60

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| A1 | analysis | Why STATE.md drifts in project threads | done | code paths, see Analysis | - | - |
| F1 | fix | CI check: STATE.md must change with code | done | node scripts/test-check-state-touched.mjs | rc=1 on 367d1ef (module missing) → rc=0 on 265272f; R2 rc=0 on e175b06 | 265272f, bab7b4d, e175b06 |
| F2 | fix | STATE.md update is a gate in the skills | done | bash scripts/test-state-gate.sh | rc=1 on 265272f → rc=0 on 22036c1 | 22036c1, bab7b4d |
| F3 | fix | Slimmer STATE template | done | bash scripts/test-state-gate.sh | rc=1 on 22036c1 → rc=0 on dd2196d | dd2196d |
| F4 | fix | Block v4: gate and coordinator rule | done | bash scripts/test-project-block.sh | rc=1 on dd2196d → rc=0 on 34f3aa2 | 34f3aa2, bab7b4d |

## Analysis A1

Cause: nothing makes the `STATE.md` update a condition, and nothing reads it without autopilot.
1. The only rule was a mid-flow step: `foreman-fixpack/SKILL.md:43` and `foreman-milestone/SKILL.md:37` ("Update STATE.md"). `foreman-delegation/SKILL.md` had 0 mentions, so its acceptance order never asked for it.
2. The block's gate list (`instruction-block.md:22`, v3) was "scope check, tests, typecheck, lint". A thread could report done with a stale `STATE.md`.
3. No check: `.github/workflows/foreman-guards.yml` tested the mirror script, never whether a PR touched a `STATE.md`. Autopilot reads it every run; project threads get no such feedback.
4. The coordinator rule in the block named no check of `STATE.md`.
5. The fix pack table had 10 columns per point.

## Review

Round 1 (validation, opus class): `needs-attention`. Medium: false-red for update, bot and sync PRs (F1); rule text lost in delegation skill (F2); fixpack skill table text not matching the template (F3); coordinator checked "the PR" before a PR exists (F4); missing SHAs in this file. All fixed in bab7b4d and this file.
Round 2: `pass`. Three low findings (update branch name vs push rule, changelog wording, delete test not real) fixed in e175b06.

## Inherited red

None.

## Log

- 2026-11-23T08:50Z · plan · 367d1ef
- 2026-11-23T09:05Z · A1 analysis · -
- 2026-11-23T09:15Z · F1 done · 265272f
- 2026-11-23T09:35Z · F2, F3 done · 22036c1, dd2196d
- 2026-11-23T09:50Z · F4 done, changelog, WORKFLOW line · 34f3aa2
- 2026-11-23T10:00Z · review round 1, rework R1 · bab7b4d; full run test-all rc=0
- 2026-11-23T10:10Z · review round 2 pass, R2 lows · e175b06

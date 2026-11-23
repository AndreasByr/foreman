# Fix pack 2026-11-23-state-gate

Summary: 4 of 4 fixes done, 1 analysis done, 0 blocked. Review: round 1 `needs-attention` (5 medium), round 2 `pass` (3 low, all fixed). Work branch `claude/project-thread-hyupfn`, PR to `dev`.

| # | Title | Type | Result | Cause | Commit | Test |
|---|---|---|---|---|---|---|
| A1 | Why STATE.md drifts | analysis | done | The update was a mid-flow step, not a gate; nothing checked it; the coordinator did not look | - | code paths in STATE.md |
| F1 | CI check STATE.md changes with code | fix | done | no check existed | 265272f, R1 bab7b4d, R2 e175b06 | `node scripts/test-check-state-touched.mjs` |
| F2 | Gate in skills | fix | done | gate list had no STATE.md | 22036c1, R1 bab7b4d | `bash scripts/test-state-gate.sh` |
| F3 | Slimmer STATE template | fix | done | 10 columns per point | dd2196d | `bash scripts/test-state-gate.sh` |
| F4 | Block v4 | fix | done | block had no gate or coordinator check | 34f3aa2, R1 bab7b4d | `bash scripts/test-project-block.sh` |

Evidence: full `bash scripts/test-all.sh` rc=0 on bab7b4d and on e175b06; `node scripts/measure-reads.mjs` exit 0 (milestone -212 B, fix pack -569 B, batch -2 B against 0.2.1).

Re-test list for the human: see `docs/uat/2026-11-23-state-gate.md`.

## Learned

- Skills read in every run have a hard byte limit (batch run -2 B). A new rule must replace text: first cut filler, never rule content (round 1 caught two cut rules).
- A workflow file must not contain `{{`: the installer treats it as an unrendered placeholder. Use `$GITHUB_*` variables in `run:` instead.
- A check that fires on every PR needs a skip list for bot, sync and update branches from the start.

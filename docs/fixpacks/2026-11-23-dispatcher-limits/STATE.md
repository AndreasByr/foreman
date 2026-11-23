Status: batch-pr · since 2026-11-23T15:25Z · all gates green, batch PR to dev opened
Target: dev
Branch: batch/dev
PR: pending
Next: merge the PR to dev, then UAT by the human; release 0.2.5 only on go
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-dispatcher-limits

Start commit: 84dd33c

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | analysis | Where the limit defaults come from, what to change | done | see Analysis F1 | - | - |
| F2 | fix | Dispatcher: configurable cap, per-project cooldown, limit lines in dry run | done | `node dispatcher/tests/test-dispatch.mjs` | rc=1 (9 failed) on c9e61a3 → rc=0 (87) on 07c880f; R1 rc=1 (2 failed) on 357630f → rc=0 (89) on e6a397c | 07c880f, e6a397c |
| F3 | fix | Setup, project start and update ask for the limits | done | `bash scripts/test-dispatcher-docs.sh` | rc=1 on 07c880f (new test script, docs unchanged) → rc=0 on 1f56b04 | 1f56b04, ecbe7c7, 37973c5, 7898f58, 8886831 |

F2 and F3 share the cause (limits are never asked); two commit series because code and docs are separate concerns.

## Analysis F1

Cause: nothing in setup asks for the limits, and the cap cannot be configured.
1. `dispatcher/dispatch.mjs` had `const HARD_MAX_TASKS = 3` (line 17) and `Math.min(max, HARD_MAX_TASKS)` in `selectTasks`: the config could only lower the cap. A local edit is lost at the next update of the foreman checkout.
2. `cooldown_minutes` was read once at top level (`config.cooldown_minutes ?? 45`): one value for all projects, silent default 45.
3. `dispatcher/config.example.json` shipped `cooldown_minutes: 45` and `max_tasks: 3` / `1`. `foreman-setup/references/prerequisites.md:69` and `foreman-project/references/tracker-and-dispatcher.md:32` only said "fill ... `max_tasks`"; no step asked the human. `foreman-update/SKILL.md:76` said "reload the config and run a dry run", with nothing to read from it.
4. The dry run printed nothing about limits, so a default was never visible.

Decision (recommendation for UAT): cap configurable as `max_tasks_cap` in the config, default 3, at most 10 (safe maximum); cooldown per project with the top-level value as fallback, at most 1440 minutes; dry run prints the effective values and a question line per unset value; setup, project start and update ask; the example config leaves the keys out so a copied example is flagged.

## Review

- Round 1: F2 needs-attention (medium: `max_tasks: 0` no longer a pause; medium: no question line for missing cap; low: invalid project cooldown, no cooldown bound), F3 needs-attention (medium: example config bypassed the dry-run check; low: update/setup notes). Rework R1 (F2 e6a397c, F3 ecbe7c7, 37973c5); `max_tasks: 0` stays invalid by decision, documented; no question line for the cap by decision, documented.
- Round 2: F2 pass, F3 needs-attention (medium: changelog upgrade text hid the `max_tasks: 0` trap and contradicted itself). Rework R2 (7898f58).
- Round 3 (docs only): pass. Its claim that the removed changelog sentence broke no test was wrong: `test-changelog.sh` required the words dispatcher and pull in the Steps bullet; fixed in R3 (8886831).

## Inherited red

None. Start commit 84dd33c: `node dispatcher/tests/test-dispatch.mjs` rc=0, 78 tests.

## Final run

`bash scripts/test-all.sh` rc=0 on 8886831 (includes dispatcher tests 89, docs tests, changelog, privacy scan, skill size limits). No typecheck, lint or build exists in this repo; `test-all.sh` is the gate.

## Log

- 2026-11-23T14:55Z · plan · written · f4bff4a
- 2026-11-23T15:10Z · F2 · red tests, then code · c9e61a3, 07c880f
- 2026-11-23T15:13Z · F3 · docs · 1f56b04
- 2026-11-23T15:30Z · review rounds 1 to 3, rework R1 to R3 · 8886831
- 2026-11-23T15:25Z · test-all rc=0 · 8886831

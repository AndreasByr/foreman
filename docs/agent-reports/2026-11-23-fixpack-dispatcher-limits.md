# Fix pack 2026-11-23-dispatcher-limits

Summary: 3 of 3 done (1 analysis, 2 fixes), 0 blocked. Review verdict: pass after 3 rounds. Final run `bash scripts/test-all.sh` rc=0 on 8886831. Batch branch `batch/dev`, PR to `dev`.

| # | Title | Type | Result | Cause | Commit | Test |
|---|---|---|---|---|---|---|
| F1 | Limit defaults | analysis | done | The cap was a code constant, the example config set defaults, no step asked the human | - | - |
| F2 | Dispatcher limits | fix | done | see F1 | 07c880f, e6a397c | `dispatcher/tests/test-dispatch.mjs` (red 9 on c9e61a3, red 2 on 357630f) |
| F3 | Setup, project start, update ask | fix | done | see F1 | 1f56b04, ecbe7c7, 37973c5, 7898f58, 8886831 | `scripts/test-dispatcher-docs.sh` |

## Analysis F1

See `docs/fixpacks/2026-11-23-dispatcher-limits/STATE.md`, section Analysis F1.

## What changed for users

- `max_tasks_cap` (top level, default 3, at most 10) replaces the fixed cap of 3. It lives in `config.json`, so an update does not overwrite it.
- `cooldown_minutes` per project, top-level value as fallback, default 45, at most 1440.
- Dry run: `limits` line per project and an `Ask the human for this value` line per unset value.
- `max_tasks: 0` is now invalid (warning, cap applies). Pause a project with `"enabled": false`.
- Setup, project start and update ask for `max_tasks` and `cooldown_minutes`; the cap only on request. The example config leaves the keys out on purpose.

## Re-test list (human only)

1. Dry run on a real dispatcher machine after pulling: the `limits` lines show the expected values (needs the real config).
2. Answer the questions in a real setup or update thread (needs the human's choice of values).

## Learned

A fixed cap in code cannot be changed without a local edit that the next update overwrites; limits that change behavior belong in the config, with a safe maximum, and the dry run must make unset values visible. A reviewer's claim that a change breaks no test needs a test run: the changelog test caught what the review missed.

Status: fixpack · since 2026-11-23T14:55Z · plan written
Target: dev
Branch: batch/dev
PR: -
Next: F1 analysis, then F2 tests (red)
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-dispatcher-limits

Start commit: 84dd33c

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | analysis | Where the limit defaults come from, what to change | open | code path with lines (report) | - | - |
| F2 | fix | Dispatcher: configurable cap, per-project cooldown, limit lines in dry run | open | `node dispatcher/tests/test-dispatch.mjs` | - | - |
| F3 | fix | Setup, project start and update ask for the limits | open | `bash scripts/test-dispatcher-docs.sh` | - | - |

F2 and F3 share the cause (limits are never asked); they stay two commits because code and docs are separate concerns.

## Review

Not started.

## Inherited red

None. Start commit 84dd33c: `node dispatcher/tests/test-dispatch.mjs` exit 0, 78 tests.

## Log

- 2026-11-23T14:55Z · plan · written · -

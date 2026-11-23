Status: fixpack · since 2026-11-23T16:30Z · plan written
Target: dev
Branch: fix/local-overlay-gateway-env
PR: -
Next: write the red tests, then the code
Batch-branch: fix/local-overlay-gateway-env
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-local-overlay

Start commit: a64cb2b

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | fix | Local overlay `.foreman.local.json` for the pretest runner | open | `node template/scripts/test-pretest.mjs` | - | - |
| F2 | fix | `base_url_env` for the gateway address | open | `python3 tools/delegate/test_run_task.py` | - | - |

Two causes, two concerns, two commit series.

## Review

Not run yet.

## Inherited red

None known. Start commit a64cb2b: to be proven by the first run.

## Log

- 2026-11-23T16:30Z · plan · F1 and F2 from closed PR #38, rebuilt on dev · -

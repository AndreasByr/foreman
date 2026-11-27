Status: uat-ready · since 2026-11-23T16:50Z · PR #39 merged to dev (0ab1013), waiting for UAT
Target: dev
Branch: fix/local-overlay-gateway-env
PR: #39
Next: UAT by the human, then release only on go
Batch-branch: fix/local-overlay-gateway-env
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-local-overlay

Start commit: a64cb2b

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | fix | Local overlay `.foreman.local.json` for the pretest runner | done | `node template/scripts/test-pretest.mjs` | rc=1 (missing export `mergeConfig`) on 54ff77a → rc=0 (10 tests) on b589a3c; R1 rc=1 on af1c015 → rc=0 (11 tests) on 111b899 | b589a3c, 111b899 |
| F2 | fix | `base_url_env` for the gateway address | done | `python3 tools/delegate/test_run_task.py` | rc=1 (`test_gateway_base_url_env_name`) on 54ff77a → rc=0 on 471cb95; R1 rc=1 (`test_gateway_url_env_name_is_kept_from_workers`) on af1c015 → rc=0 on 111b899 | 471cb95, 111b899 |

Two causes, two concerns, two commit series.

## Review

- Round 1 (validation, opus): F1 needs-attention, F2 needs-attention. Medium: the test for "broken overlay is not echoed" used a scrubbed secret and proved nothing. Low: no test for the .gitignore line; custom address variable passed to workers; `__proto__` in mergeConfig; overlay can replace `productionHosts`. Rework R1 (af1c015 red, 111b899 green) fixed all of those.
- Round 2: pass for F1 and F2. Three low notes stay open (default and custom address variable treated differently; the address value is now masked in logs; test name says more than it checks).
- Open low from round 1, left on purpose: existing installs do not get the `.gitignore` line by `--update` (the changelog tells them to add it); overlay JSON `null` or an array at top level gives a poor error text; read errors say "not valid JSON".

## Inherited red

None. `bash scripts/test-all.sh` rc=0 before the first change (commit a64cb2b, same suite green in CI of PR #37).

## Final run

`bash scripts/test-all.sh` rc=0 on 111b899 (includes pretest tests, wrapper tests, installer test, changelog, privacy scan). No typecheck, lint or build exists in this repo; `test-all.sh` is the gate.

## Log

- 2026-11-23T16:30Z · plan · F1 and F2 from closed PR #38, rebuilt on dev · -
- 2026-11-23T16:45Z · F1, F2 red tests 54ff77a, code b589a3c, 471cb95, changelog 7124481 · test-all rc=0
- 2026-11-23T16:55Z · review round 1 needs-attention, R1 af1c015 → 111b899 · test-all rc=0
- 2026-11-23T17:00Z · review round 2 pass · -
- 2026-11-23T16:50Z · PR #39 merged to dev (0ab1013), CI test and guards green; #38 closed · -

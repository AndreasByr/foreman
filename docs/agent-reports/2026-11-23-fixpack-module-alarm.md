# Fix pack 2026-11-23-module-alarm

Summary: 6 of 6 fixes done, 1 analysis done, 0 blocked. Review: round 1 needs-attention, round 2 needs-attention (medium findings fixed in R1 and R2). The third review was not run; the final full run is green.

| # | Title | Type | Result | Cause (one sentence) | Commit | Test |
|---|---|---|---|---|---|---|
| A1 | Why a stopped module stays silent | analysis | done | Only the dispatcher reports, only while it runs and only with a webhook; nothing records or judges run age. | - | see STATE.md |
| F1 | Heartbeat files and judging | fix | done | No module recorded that it ran. | d764dad | `dispatcher/tests/test-heartbeat.mjs` |
| F2 | Dispatcher beats, loud failures | fix | done | A failed project or lost failure message left no trace. | 6669898, 65dab93 | `dispatcher/tests/test-dispatch.mjs` |
| F3 | Watcher and alarm channels | fix | done | Nothing ran when the dispatcher did not run. | 830382f, 65dab93, R2 | `dispatcher/tests/test-watch.mjs` |
| F4 | `status` command | fix | done | No overview of all modules. | d764dad | `test-heartbeat.mjs` |
| F5 | Tracker sync beat | fix | done | `state-mirror.mjs` printed ERROR or SKIP and recorded nothing. | d764dad, 65dab93 | `template/scripts/test-state-mirror.mjs` |
| F6 | Docs, examples, changelog | fix | done | New behaviour needs setup steps. | 4ba13bc | `scripts/test-dispatcher-docs.sh` |

## Analysis A1

Five causes with file and line are in `docs/fixpacks/2026-11-23-module-alarm/STATE.md`. The most likely cause of the 14 hour standstill: a hung run keeps the lock PID alive, so every timer tick skips with exit 0 (`dispatcher/dispatch.mjs`, lock check before the project loop). This fix pack makes that visible (no beat, so the dispatcher turns stale), it does not kill the hung process.

## Evidence

- Final run: `bash scripts/test-all.sh`, exit 0, on the final commit of branch `claude/project-thread-p86kk4`. This includes the production-relevant checks of this repository: rules lint, read budget (`measure-reads`), privacy scan, docs tests. There is no separate typecheck, lint or build step in this repository.
- Red then green: SHAs per point in STATE.md.
- Workers: `execution_simple` (heartbeat, tracker beat, docs), `execution` (dispatcher integration, watcher, R1, R2), `validation` (two reviews). No escalation, no fallback. The first wrapper starts ended with exit 4 because the red anchor was not runnable; stubs fixed that.

## Decisions to confirm in UAT

- Alarm channel: built as webhook, push (HTTPS POST, ntfy style) and tracker, chosen in the dispatcher `config.json` under `alarm.channels` (not in `.foreman.json`, because the watcher runs outside any project). Default is the webhook only.
- The tracker-sync beat is written only where `state-mirror.mjs` runs next to the status directory (`FOREMAN_STATUS_DIR`, or the default directory when it exists). A run inside a cloud session cannot reach the dispatcher machine; for that case the beat has no effect.
- `state-mirror.mjs` keeps its exit codes. A skipped mirror because of missing credentials is an `error` beat, not a new exit code.

## What only the human can prove

1. The watcher timer on the real dispatcher machine fires every 15 minutes and an alarm reaches the chosen channel (needs the real webhook, push URL and machine).
2. A real stopped timer produces an alarm within about 45 minutes (needs the real machine).

## Learned

A red anchor for the delegation wrapper must fail by an assertion, not by a missing file, otherwise `verify` counts as not runnable (exit 4). Stub modules solve it.

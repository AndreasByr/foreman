Status: fixpack · since 2026-11-23T10:05Z · plan written, analysis done, tests next
Target: dev
Branch: claude/project-thread-p86kk4
PR: -
Next: write red tests, then delegate F1 to F5
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-module-alarm

Start commit: 7b90bf7

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| A1 | analysis | Why a stopped module stays silent | done | code paths, see Analysis | - | - |
| F1 | fix | Heartbeat files and judging | open | node dispatcher/tests/test-heartbeat.mjs | | |
| F2 | fix | Dispatcher beats, loud failures | open | node dispatcher/tests/test-dispatch.mjs | | |
| F3 | fix | Watcher and alarm channels | open | node dispatcher/tests/test-watch.mjs | | |
| F4 | fix | status command | open | node dispatcher/tests/test-heartbeat.mjs | | |
| F5 | fix | Tracker sync beat | open | node scripts/test-state-mirror.mjs | | |
| F6 | fix | Docs, config examples, changelog | open | bash scripts/test-dispatcher-docs.sh | | |

## Analysis A1

Cause: the dispatcher is the only part that reports problems, and it reports only while it runs and only when a webhook is set. Nothing records that a module ran, and nothing runs outside the dispatcher.

1. A run that does not happen leaves nothing behind. Timer stopped, machine off or process hung: no code runs, no line is written, no message goes out. `dispatcher/dispatch.sh` has no companion and no state file says "last successful run".
2. A hung run blocks every later run quietly. `dispatcher/dispatch.mjs:455` returns exit code 0 with "another dispatcher run is active; skipping" while the lock PID is alive; the lock holds only the PID (`acquireLock`, line 169), no time. A stuck run (for example a git or network call that never returns) makes every following timer tick a silent skip, exit 0, for as long as the process lives.
3. Failures go out only through an optional webhook. `notify` returns "none" when `DISPATCHER_ERROR_WEBHOOK_URL` is unset or unusable (`dispatch.mjs:213-216`), and the three call sites (`:439`, `:492`, `:503`) ignore the return value. Without a webhook the only trace is stdout in the journal or a log file; a failed delivery is dropped the same way.
4. The tracker sync has no record either. `scripts/state-mirror.mjs:253-260` prints `ERROR|itsaplan|...` and exits 1; the caller sees one line in one run's output, no timestamp of the last good run exists anywhere.
5. Nothing judges age. No code compares "last run" with "should have run by now", so a 14 hour standstill looks exactly like a quiet project.

Fix direction (this pack): heartbeat file per module, a watcher that does not depend on the dispatcher, an alarm with since-when, failures that end the run with an error beat, and a status command.

## Review

Not run yet.

## Inherited red

None known. Baseline run follows with F1.

## Open question

Where should the alarm go? Recommendation: tracker comment plus push (webhook or ntfy). Built configurable; UAT asks the human.

## Log

- 2026-11-23T10:05Z · plan, ORDER.md, A1 · done

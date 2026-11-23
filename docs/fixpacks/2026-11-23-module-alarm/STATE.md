Status: needs-input · since 2026-11-23T11:45Z · fourth rework round built, waiting for the human's go on round 4 before the PR
Target: dev
Branch: claude/project-thread-p86kk4
PR: -
Next: human answers the round 4 question, then PR to dev, merge, UAT
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
| F1 | fix | Heartbeat files and judging | done | node dispatcher/tests/test-heartbeat.mjs | rc=1 on 1885beb (module missing) → rc=0 on d764dad | d764dad |
| F2 | fix | Dispatcher beats, loud failures | done | node dispatcher/tests/test-dispatch.mjs | rc=1 on d764dad (5 new cases) → rc=0 on 6669898 | 6669898, 65dab93 |
| F3 | fix | Watcher and alarm channels | done | node dispatcher/tests/test-watch.mjs | rc=1 on 1885beb → rc=0 on 830382f; R1 and R2 cases red then green | 830382f, 65dab93, R2 commit |
| F4 | fix | status command | done | node dispatcher/tests/test-heartbeat.mjs | rc=1 on 1885beb → rc=0 on d764dad | d764dad |
| F5 | fix | Tracker sync beat | done | node template/scripts/test-state-mirror.mjs | rc=1 on 1885beb (beat file missing) → rc=0 on d764dad; R1 default dir and crash beat red → green on 65dab93 | d764dad, 65dab93 |
| F6 | fix | Docs, config examples, changelog | done | bash scripts/test-dispatcher-docs.sh | rc=1 on 830382f (README lacks heartbeat) → rc=0 on 4ba13bc | 4ba13bc |

## Analysis A1

Cause: the dispatcher is the only part that reports problems, and it reports only while it runs and only when a webhook is set. Nothing records that a module ran, and nothing runs outside the dispatcher.

1. A run that does not happen leaves nothing behind. Timer stopped, machine off or process hung: no code runs, no line is written, no message goes out. `dispatcher/dispatch.sh` has no companion and no state file says "last successful run".
2. A hung run blocks every later run quietly. `dispatcher/dispatch.mjs:455` returns exit code 0 with "another dispatcher run is active; skipping" while the lock PID is alive; the lock holds only the PID (`acquireLock`, line 169), no time. A stuck run (for example a git or network call that never returns) makes every following timer tick a silent skip, exit 0, for as long as the process lives.
3. Failures go out only through an optional webhook. `notify` returns "none" when `DISPATCHER_ERROR_WEBHOOK_URL` is unset or unusable (`dispatch.mjs:213-216`), and the three call sites (`:439`, `:492`, `:503`) ignore the return value. Without a webhook the only trace is stdout in the journal or a log file; a failed delivery is dropped the same way.
4. The tracker sync has no record either. `scripts/state-mirror.mjs:253-260` prints `ERROR|itsaplan|...` and exits 1; the caller sees one line in one run's output, no timestamp of the last good run exists anywhere.
5. Nothing judges age. No code compares "last run" with "should have run by now", so a 14 hour standstill looks exactly like a quiet project.

Fix direction (this pack): heartbeat file per module, a watcher that does not depend on the dispatcher, an alarm with since-when, failures that end the run with an error beat, and a status command.

## Review

Round 1 (validation, opus): F1, F4, F6 pass; F2, F3 needs-attention; F5 needs-remediation. Fixed in R1 (65dab93): default status directory for the tracker-sync beat, error beat when `state-mirror` crashes, ticket retry on partial delivery (`ticketPending`, `recoveredNotified`), `peer.json` atomic and cleared.

Round 4 (after the third rework): needs-remediation, one medium finding: after the delivery cap gave up, the watcher beat flipped back to ok while the module was still down. Fixed in R4 (`undelivered` flag keeps the beat on error); R4 was built in advance while the human's go for a fourth round was pending (decision card in the thread). No review after R4; mechanical gates green.

Round 3: needs-attention (comment spam when a tracker-only delivery keeps failing, two cases; test isolation gap). Fixed in R3 with a generic cap of 5 failed deliveries per module and `FOREMAN_STATUS_DIR` removed from test children.

Round 2: needs-attention, two medium findings: tests wrote into the real status directory (HOME now set in tests and in `test-install.sh`), tracker retries without limit (now 5 tries, then give up); two low: a returning problem now reuses the old ticket; a flapping watcher alarms again at once (kept, intended).

Left on purpose (low): stale to error does not re-alarm before the repeat time, no lock for the watcher, `project:a` and `project_a` share a file, the first error line of a failed update step is not in the project beat, `status` knows the default dispatcher limit only from the config, beat files of removed projects stay (documented).

## Inherited red

None. `bash scripts/test-all.sh` was green on the start commit 7b90bf7 (CI state) and is green again at the final commit.

## Open question

Round 4: the review after R3 still found one medium defect (fixed in R4, not re-reviewed). Start round 4 officially and re-review, ship as is with the note, or stop? Recommendation: start round 4 (one flag, one test).
**Cause:** limit-exceeded · fourth rework round needs the human's go

Alarm channel: where should the alarm go? Recommendation: tracker comment plus push (webhook or ntfy). Built configurable; UAT asks the human.

## Log

- 2026-11-23T10:05Z · plan, ORDER.md, A1 · done · ee49bd8
- 2026-11-23T10:10Z · red tests · 1885beb
- 2026-11-23T10:25Z · F1 F4 F5 · d764dad
- 2026-11-23T10:27Z · F2 · 6669898
- 2026-11-23T10:30Z · F3 · 830382f
- 2026-11-23T10:40Z · F6, full run rc=0 · 4ba13bc
- 2026-11-23T10:50Z · review 1, R1, full run rc=0 · 65dab93
- 2026-11-23T11:05Z · review 2, R2, full run rc=0 · 94a82c1
- 2026-11-23T11:20Z · review 3, R3 (delivery cap, test isolation), full run rc=0

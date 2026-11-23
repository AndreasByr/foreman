Target: dev
Milestone: -
Batch-branch: batch/dev (work branch of this thread: claude/project-thread-p86kk4, PR to dev)
Urgent: no
Mode: project thread
Fix-pack: 2026-11-23-module-alarm
Version: -
Tracker: none

Origin: a dispatcher stood still for 14 hours and nobody noticed until a ticket status did not move. The same holds for the tracker sync and any other module: a stopped or failing module raises no alarm, the run just goes on. The human approved all five measures ("alle Punkte umsetzen"). The alarm channel was not named; the recommendation applies (tracker comment plus push) and goes into UAT as an open question.

## A1 Analysis: why a stopped module stays silent

Problem: dispatcher, tracker sync or any other module can stop or fail and nobody is told.
Expected: cause proven with code paths and lines, nothing changed.
Board: no interface
Acceptance: causes named with file and line.

## F1 Fix: heartbeat files per module

Problem: no module records that it ran.
Expected: `dispatcher/heartbeat.mjs` writes one JSON file per module (module, last_run, result `ok`/`error`, note, optional max_age_min), atomically, into `<workdir>/status/`. It also reads them and judges each one: ok, stale (older than its limit), error, never. Limits come from the config first, then from the beat, else no age check (modules that only run after work, like the tracker sync, alarm on `error` only).
Board: no interface
Acceptance: `node dispatcher/tests/test-heartbeat.mjs` red before, green after.

## F2 Fix: dispatcher beats and fails loudly

Problem: a failed project, a lost failure message or a webhook that is not set leaves no trace.
Expected: every dispatcher run (not `--dry-run`) writes a beat for `dispatcher` and one per project (`project:<name>`), `error` with the first error line when anything failed. A failed failure-message delivery is itself a failure (exit 1, noted in the beat). A skipped run because of an active lock writes no beat (so a hung run turns stale).
Board: no interface
Acceptance: new cases in `dispatcher/tests/test-dispatch.mjs` red before, green after.

## F3 Fix: independent watcher with alarm

Problem: nothing runs when the dispatcher does not run.
Expected: `dispatcher/watch.mjs` plus `dispatcher/watch.sh` (own cron entry or systemd timer, every 15 minutes, no dependency on the dispatcher run). It judges all beats, writes its own beat `watcher`, and alarms once per problem (module and since when), repeats after `alarm.repeat_hours` (default 6), and sends a recovery message. Channels in the dispatcher config under `alarm`: `webhook` (existing), `push` (HTTPS POST to a URL from an env variable, ntfy style), `tracker` (itsaplan ticket in "Action Required", comment on repeat, Done on recovery). The dispatcher alarms when the `watcher` beat is stale, so the two watch each other.
Board: no interface
Acceptance: `node dispatcher/tests/test-watch.mjs` red before, green after.

## F4 Fix: `status` command

Problem: no overview of all modules.
Expected: `dispatcher/status.sh` (and `node dispatcher/heartbeat.mjs status`) prints all modules with last run, result and state, exit 1 when anything is not ok.
Board: no interface
Acceptance: covered in `test-heartbeat.mjs`.

## F5 Fix: tracker sync beat

Problem: `state-mirror.mjs` prints `ERROR|...` and exits 1, nothing is recorded.
Expected: `state-mirror.mjs` (repo and template copy) writes the beat `tracker-sync` (`ok`/`error`) when `FOREMAN_STATUS_DIR` is set or the default status directory exists; never fails the run because of the beat.
Board: no interface
Acceptance: new case in `test-state-mirror.mjs` red before, green after.

## F6 Fix: docs, config example, changelog

Expected: `dispatcher/README.md`, `config.example.json`, `dispatcher.env.example`, `crontab.example`, systemd timer for the watcher, `docs/MODULES.md`, `docs/learnings.md`, CHANGELOG (Unreleased, with Upgrade section). `bash scripts/test-all.sh` green, read budget unchanged (`node scripts/measure-reads.mjs` exit 0).
Board: no interface
Acceptance: `bash scripts/test-dispatcher-docs.sh` extended and green.

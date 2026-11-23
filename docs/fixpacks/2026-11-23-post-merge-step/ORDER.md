Target: dev
Milestone: -
Batch-branch: batch/dev (work branch of this thread: claude/project-thread-3cdeih, PR to dev)
Urgent: no
Mode: project thread
Fix-pack: 2026-11-23-post-merge-step
Version: -
Tracker: none

Context: a project thread merged on the human's "go", closed the thread, and nobody set `STATE.md` to its next status or ran the mirror. The tracker kept the old status. The after-merge step existed only in the autopilot run (`foreman-dispatch-run`, step 6). Separately, a project's `state-mirror.mjs` called client methods that its (older) tracker client did not have, and nothing tested that the two fit.

## F1 Fix: after-merge step for manual threads

Problem: a manual thread that merges on "go" has no rule to set `STATE.md`, run the mirror and only then close the thread.
Expected: `foreman-batch` (step after the merge), `foreman-fixpack` and `foreman-milestone` say it; `foreman-delegation` names it in the Git rules. After a merge: `STATE.md` to its next status, commit and push, run `node scripts/state-mirror.mjs` (tracker on), then `--check` exit 0, only then close the thread. Block v5 carries one line. Version test and changelog follow.
Board: no interface
Acceptance: `bash scripts/test-state-gate.sh` (extended) red before, green after; `bash scripts/test-project-block.sh` green; `node scripts/measure-reads.mjs` exit 0.

## F2 Fix: contract test mirror to tracker client

Problem: `state-mirror.mjs` calls methods on the tracker client. No test checks that the real client has them; a wrong or old client stops the mirror late with "client.project is not a function".
Expected: the mirror names the methods it needs per tracker; a test compares them with the real clients and with the test fake, and scans the mirror source for `client.<name>(` calls so the list cannot go stale. At run time a client with missing methods fails at once with a clear message.
Board: no interface
Acceptance: `node template/scripts/test-state-mirror.mjs` red before, green after.

## F3 Analysis (fix directly if the cause is clear): should `install.sh --update` warn about old files?

Problem: after an update from 0.2.x, files that foreman once shipped or that replaced foreman scripts (an older client with other method names, an older mirror that reads `docs/fixpakete/` instead of `docs/fixpacks/`) can stay in the project. Update only looks at files that exist in the template.
Expected: proven answer with code path; if warranted, a warning in the update report (also in `--dry-run`). Nothing is deleted automatically.
Board: no interface
Acceptance: if a warning is added: test in `scripts/test-update.sh` red before, green after; the tree stays unchanged by the warning.

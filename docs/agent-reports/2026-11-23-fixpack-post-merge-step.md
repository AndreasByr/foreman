# Fix pack 2026-11-23-post-merge-step

Summary: 3 of 3 done (F3 analysis with fix, F1, F2), 0 blocked. Review: round 1 two medium findings, fixed in R1; round 2 pass. Base: `origin/dev` 7b90bf7.

| # | Title | Type | Result | Cause (one sentence) | Commit | Test |
|---|---|---|---|---|---|---|
| F3 | Update warns about files it does not ship | analysis + fix | done | `update.py` walks only `template/`, so leftovers are never seen | a77a60c, a0db486 | `bash scripts/test-update.sh` (block 18) |
| F1 | After-merge step for manual threads, block v5 | fix | done | the step existed only in the autopilot run (`foreman-dispatch-run` step 6) | c61be58, a0db486 | `bash scripts/test-state-gate.sh` |
| F2 | Contract test mirror to tracker client | fix | done | no test tied `state-mirror.mjs` to the tracker client's methods | 135b95b | `node template/scripts/test-state-mirror.mjs` |

## Analysis F3

See `STATE.md`. Foreman never shipped the old names; the project's own older files stay because update only handles template files. A client at the same path is overwritten and listed as `update`. Warning added, nothing deleted.

## Evidence

- Red on 7b90bf7 plus the new tests: `test-state-gate.sh` rc=1, `test-state-mirror.mjs` rc=1, `test-update.sh` rc=1. Green on 34b2834: `bash scripts/test-all.sh` rc=0. No app code changed, so no production build; the repo has no typecheck or lint step beyond `test-all.sh`.
- Read budget (`node scripts/measure-reads.mjs`, exit 0): milestone 42,928 B, fix pack 40,981 B, batch 32,312 B, all below 0.2.1. The new rule cost bytes, so R1 shortened wording elsewhere in `foreman-delegation` and `foreman-batch` (a rule about an open "main to dev (conflict)" PR stays in `foreman-batch` and `foreman-deploy`; the example list in "Hand nothing on" is gone).
- Workers: three first attempts by `execution_simple` produced the F1 edits and the F3 test; the worker had no shell, so F2 and the F3 code went to `execution` with the tests as `verify`. Skill copies under `.claude/skills/` were synced by the session (workers may not write there).

## What only the human can prove

- Run `./install.sh <project> --update --dry-run` on the real project and read the warning (needs the real project).
- Refresh the project instructions to block v5 (needs the project settings).

## Learned

- Parallel wrapper runs on one tree report each other's changes as "outside scope"; read `git diff --stat`, not the findings, to judge scope.
- Workers in this setup cannot run shell commands: give them a `verify` that is the real test, and write the red run yourself against the start commit in a worktree.

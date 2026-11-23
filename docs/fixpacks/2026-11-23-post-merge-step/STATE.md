Status: uat-ready · since 2026-11-23T10:20Z · review pass (round 2), waiting for UAT
Target: dev
Branch: claude/project-thread-3cdeih
PR: pending
Next: PR to dev, merge when CI is green, then After-merge step; UAT by the human, release only on go
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-23-post-merge-step

Start commit: 7b90bf7

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F3 | analysis + fix | Update warns about files it does not ship | done | bash scripts/test-update.sh | rc=1 on 7b90bf7 (+new test) → rc=0 on a77a60c; R1 rc=0 on a0db486 | a77a60c, a0db486 |
| F1 | fix | After-merge step for manual threads, block v5 | done | bash scripts/test-state-gate.sh | rc=1 on 7b90bf7 (+new test) → rc=0 on c61be58 | c61be58, a0db486 |
| F2 | fix | Contract test mirror to tracker client | done | node template/scripts/test-state-mirror.mjs | rc=1 on 7b90bf7 (+new test) → rc=0 on 135b95b (39 tests) | 135b95b |

## Analysis F3

Cause: `scripts/update.py` builds its file list only from `template/` (the `sources` loop over `os.walk(TEMPLATE)`). Anything the template does not contain is never looked at, so leftovers (an older mirror under another name, `docs/fixpakete/`) stay silently. Foreman itself never shipped German method names or `docs/fixpakete/` in any version (git history); those came from a project's own older scripts. Update cannot replace what it never shipped, so it warns. A client file at the same path as a template file is already overwritten and listed as `update`. Decision: warn (stdout, also `--dry-run`), delete nothing, exit code unchanged.

## Review

Round 1 (validation, opus): F1 needs-attention (medium: close order differed from `batch-run.md`, "round" dropped; low: `--check` passes on SKIP), F2 pass, F3 needs-attention (medium: `scripts/session-setup.local.sh` was listed although foreman recommends it). R1 commit a0db486 fixes both medium findings and the SKIP wording; read budget table updated (34b2834).
Round 2: pass. Open, low: the SKIP wording has no way out when a session has no tracker credentials (the thread says so in its report); the scan in the contract test only sees `client.x(` calls in the two mirror functions; a client file without the `itsaplanClient` export fails at import, before the new message.

## Inherited red

none

## Open question (when `needs-input`)

none

## Log

- 2026-11-23T09:50Z · plan · F3, F1, F2 · 20108a2
- 2026-11-23T10:05Z · F1, F2, F3 done, red then green · c61be58, 135b95b, a77a60c
- 2026-11-23T10:12Z · review round 1, rework R1 · a0db486, 34b2834
- 2026-11-23T10:20Z · review round 2 pass, `scripts/test-all.sh` rc=0 · 34b2834

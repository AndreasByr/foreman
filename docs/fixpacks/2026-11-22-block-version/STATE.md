Status: awaiting-merge · since 2026-11-22T18:25Z · all done
Target: dev
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-22-block-version

Start commit: 0ed456d

## Points

| # | Type | Title | Status | Areas | Check | Board | Red run (SHA) | Green run (SHA) | Commit |
|---|---|---|---|---|---|---|---|---|---|
| F1 | fix | Block version in heading and SKILL.md example stale (v2, should be v3) | done | foreman-project-mode (reference, SKILL.md), scripts/test-project-block.sh | bash scripts/test-project-block.sh | no interface | rc=1 on a6d28e6 + test diff | rc=0 on fix commit (see git log) | see git log |

## Review

validation (opus): pass, no finding medium or higher.

## Inherited red

## Log

- 2026-11-22T18:15Z · plan · F1 only; same cause covers heading and SKILL.md example

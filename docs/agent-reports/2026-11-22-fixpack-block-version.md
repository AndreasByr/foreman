# Fix pack 2026-11-22-block-version

Summary: 1 of 1 done, 0 analyses, 0 blocked, review verdict pass.

| # | Title | Type | Result | Cause | Test |
|---|---|---|---|---|---|
| F1 | Block version in heading and SKILL.md example | fix | done | v3 bump left `(v2)` heading and example marker unchanged | `scripts/test-project-block.sh` section 10, red before, green after |

Roles: execution_simple (test, fix), validation (review). No escalation, no fallback.
Final run: `bash scripts/test-all.sh` rc=0. No package.json, so no typecheck or build.
Re-test list for the human: none.

## Learned

The project-block test now compares heading and SKILL.md example with the marker version, so a future bump cannot leave them stale.

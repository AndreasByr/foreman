Status: uat-ready · since 2026-11-27T11:00Z · review reworked, gates green, waiting for UAT
Target: dev
Branch: claude/project-thread-7ynkm4
PR: #40 (merged to dev f93a439)
Next: UAT by the human: refresh project instructions to block v6, open a new thread, check its model; release only on go
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-27-model-rule

Start commit: e9917c6

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| A1 | analysis | Why the model rule does not take effect | done | see Analysis | - | - |
| F1 | fix | Block v6: explicit standing model choice with IDs | done | bash scripts/test-project-block.sh; bash scripts/test-check-config.sh | rc=1 on 6b4641a → rc=0 on final commit | see git log |
| F2 | fix | Document platform limit and fallback | done | bash scripts/test-project-block.sh | rc=1 on 6b4641a → rc=0 on final commit | see git log |

## Analysis A1

Cause: three text defects plus one platform limit.
1. `references/instruction-block.md` "Models": "class per thread category, set at thread start" is a description without addressee or action. It never says "set the `model` parameter to ID X".
2. The table holds classes only. `SKILL.md` step 3 forbids version numbers and leaves the class-to-ID mapping to the coordinator's guess. The project text got a "Classes here: ..." tail only because the coordinator appended it.
3. The block never says the table is the human's own request. 
4. Platform limit (not fixable in text): the host's coordinator and thread tools set or switch `model` only when the human names a model in their own words; a table in project instructions is read as configuration, not as that request. Same limit applies to a thread's own switch tool.
Proposed fix: F1 + F2. Residual risk: the host may still ignore the text; fallback is the project default model (settings) or one sentence from the human to the coordinator.

## Review

Validation round 1: needs-attention (filled block over 2600 bytes, stale 2 KB line, missing SKILL.md assertion). R1 rework: block trimmed to at most 2560 bytes filled, line fixed, assertion added. Medium finding on IDs in `.foreman.json`: kept on purpose; worker-model IDs stay only in `config.toml`, thread-model IDs need a place (noted in the report). `bash scripts/test-all.sh` rc=0 after rework.

## Inherited red

## Open question (when `needs-input`)

## Log

- 2026-11-27T10:50Z · plan + analysis · pushed

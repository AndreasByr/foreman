# Fix pack 2026-11-27-model-rule

Summary: 2 of 2 fixes done, 1 analysis, 0 blocked. Review verdict: needs-attention in round 1 (size, stale 2 KB line, test gap), reworked in R1.

| # | Title | Type | Result | Cause | Test |
|---|---|---|---|---|---|
| A1 | Why the model rule did not take effect | analysis | done | Table without action or IDs, not worded as the human's own request; host sets or switches a model only on the human's own words | see below |
| F1 | Block v6 with standing choice and IDs | fix | done | same | `scripts/test-project-block.sh`, `scripts/test-check-config.sh` |
| F2 | Platform limit and fallback documented | fix | done | same | `scripts/test-project-block.sh` |

## Analysis A1

1. `instruction-block.md` (v5) "Models": "class per thread category, set at thread start" has no addressee and no action.
2. Classes only, no IDs. `SKILL.md` step 3 said "never version numbers", so the class-to-ID mapping was left to the coordinator.
3. Nothing marks the table as the human's own request.
4. Platform limit: the host's coordinator and thread tools set or switch a model only when the human names it in their own words. No repo text can force this.

## Fix

Block v6: Models section is the human's standing choice, tells the coordinator to set `model` to the category's ID, a thread on another model switches once. IDs come from new optional `.foreman.json` `models.ids` (validated by `check-config.sh`, both copies identical). `SKILL.md` and `docs/WORKFLOW.md` document the platform limit and the fallback.

## Evidence

- Red: `bash scripts/test-project-block.sh` rc=1 and `bash scripts/test-check-config.sh` rc=1 on 6b4641a (tests only).
- Green: both rc=0 on the final commit; `bash scripts/test-all.sh` rc=0 (see STATE.md for SHA).
- Block size filled with example values: at most 2560 bytes (checked by the trim task).

## Open for the human

Only the human can prove: after refreshing the project instructions to v6, the next thread starts on the table's model. If not, the platform ignores project text; fallback in `docs/WORKFLOW.md`.

## Learned

The rules lint rejects a second statement of the Model ID rule ("exact model IDs") in any skill; word thread-model text differently. Thread-model IDs live in `.foreman.json` `models.ids`, worker-model IDs stay only in `config.toml`.

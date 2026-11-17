# Reflect after UAT approval

Runs after every UAT approval, once per approved unit, after the approval is complete in all places. Purpose: what went wrong becomes a lesson, and skills get shorter instead of longer.

## Gather

Read, for the unit: its `STATE.md` log, the agent reports, `VALIDATION.md` (milestone), pretest results and fix packs, the human's UAT findings (the "Bugs found only in UAT" line, which the human fills), and rework rounds.

## Find

Look for:

- findings the mechanical checks or `validation` missed and that pretest or UAT found;
- rework rounds, escalations (exit code 1, security findings), blocked points and why;
- questions the Agent had to ask that a rule could have answered;
- rules in a skill that were ignored, were in the way, or cost effort without ever mattering.

## Write

1. Append to `docs/learnings.md` one entry per real lesson, in the format given there. No entry when nothing new was learned; write "nothing new" in the report only.
2. Propose, in the report under "Skill proposals", at most 3 changes of the form: skill, rule, change (shorten, merge, delete, sharpen) and the reason in one sentence. Prefer shortening and deleting. A lesson that needs a new rule must name the rule it replaces or the rule it makes redundant.
3. Do not edit skills in this run. The human decides on the proposals.
4. Commit `docs/learnings.md` and the report to the unit's batch branch; push. No separate PR.

## Limit

Reflect takes one short pass. No new files, no restructuring, no history in skills.

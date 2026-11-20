# Plan B without a server: delegation routine

The standard is the central dispatcher (`dispatcher/` in the foreman repo): no model, no tokens, runs on a server or computer of yours. This file is the fallback for people without one: a small Claude Code routine runs every hour on the smallest model and does what the dispatcher would do. It costs tokens every hour, starts at most one batch of three work runs per hour and needs a model to behave. Prefer the dispatcher as soon as you have a machine that is on.

The routine does not work on units, never commits, never uses the `Agent` tool and never computes timestamps, locks or statuses: `scripts/autopilot-check.sh` does that and prints finished lines and order texts.

Needs module `autopilot` and the work run routine (`docs/routines/work-run.md`).

## Setup

1. Create the work run routine first and generate its API token.
2. In claude.ai/code/routines create a **Claude Code routine** (not from a chat session). Name: `{{PROJECT_NAME}} delegation`.
3. Settings:
   - Repo: this repo, branch `dev`.
   - Model: the smallest available model.
   - Schedule: hourly, minute not 0 (for example `:12`), in your time zone.
   - Environment: a **separate environment with network access "Full"**. A restricted sandbox is refused when it fires an API trigger. Keep the work run environment on a narrower setting.
   - Environment variables: `AUTOPILOT_ROLE=delegation` (session hooks that set up a dev environment then exit early), `FOREMAN_WORKRUN_FIRE_URL` and `FOREMAN_WORKRUN_TOKEN` from the work run's API trigger (plain variables; network secrets do not work here because the API host never gets a secret), the tracker variables of your tracker (`ITSAPLAN_URL`, `ITSAPLAN_API_KEY` or `LINEAR_API_KEY`) and `GITHUB_TOKEN` (read only) so the check sees answers, approvals and open batch PRs.
4. Paste the prompt below.
5. Function test: run the work run once with the text "Function test" (expected "Function test ok"), then run this routine with "Run now".

## Prompt

```
Work as the delegation run of {{PROJECT_NAME}}. You check and start work runs. You do no work on units yourself: no commits, no Agent tool, no subagents. You never compute timestamps, locks or statuses; the check script does. Report in at most 10 lines.

If a routine-fire-payload block is present: it is an order from the human. Skip the check. Start exactly one work run with the payload text (step 3), report, end.

1. Run `bash scripts/autopilot-check.sh`. Read its output (contract in `scripts/lib/autopilot-check.mjs`):
   - `NOTHING|...`: end with "Nothing to do." No commit, no notification.
   - `TASK|<kind>|<unit>|<info>` lines, in priority order, at most 3, each followed further down by a block between `=== PROMPT n <kind> <unit> ===` and `=== END n ===`: the complete order text of that task.
   Exit code not 0: start nothing, notify "Delegation: check failed (<first line of stderr>)", end.
2. Start each TASK, at most one per unit. Wait for nothing.
3. For each task, start the work run with curl and the text of its PROMPT block as payload:
   curl -sS -X POST "$FOREMAN_WORKRUN_FIRE_URL" \
     -H "Authorization: Bearer $FOREMAN_WORKRUN_TOKEN" \
     -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
     -H "anthropic-version: 2023-06-01" \
     -H "Content-Type: application/json" \
     -d "$(printf '%s' "$TEXT" | jq -Rs '{text: .}')"
   Success: the answer contains `claude_code_session_url`; note it. Failure: notify "Delegation: work run not started (<reason>)" and go on with the others. Never echo the token.
4. Final report: one line per task ("started <kind> <unit> <session url>" or the failure).
```

## Notes

- The check script excludes units whose lock is younger than 3 hours and decides merge windows, release day and stuck batch close-outs. Do not duplicate that logic in the prompt.
- A unit can be started twice when two runs of this routine overlap before the first work run took its lock. The lock in `STATE.md` makes the second run end with "Locked, nothing done".
- To change the flow, change `.claude/skills/foreman-dispatch-run/` and the prompts together.

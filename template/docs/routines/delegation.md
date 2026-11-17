# Routine: delegation run

Runs every hour on the smallest model. It only checks and fires work runs. It never works on a unit, never commits, never uses the `Agent` tool, never starts subagents, and never computes timestamps, locks or statuses itself: `scripts/autopilot-check.sh` does that and prints finished lines.

Needs module `autopilot`. Modules `linear` and `notion` add the checks and the mirror step.

## Setup

1. Create the work run routine first (`docs/routines/work-run.md`) and generate its API token.
2. In claude.ai/code/routines create a **Claude Code routine** (not from a chat session: a routine made from chat gets no environment, no repo and no connectors). Name: `{{PROJECT_NAME}} delegation`.
3. Settings:
   - Repo: this repo, branch `dev`.
   - Model: the smallest available model.
   - Schedule: hourly, minute not 0 (for example `:12`), in your time zone.
   - Connectors: Linear and Notion if those modules are on.
   - Environment: a **separate environment with network access "Full"**. A restricted sandbox is refused when it fires an API trigger. Keep the work run environment on a narrower setting.
   - Environment variables:
     - `AUTOPILOT_ROLE=delegation` (session hooks that set up a dev environment then exit early)
     - `FOREMAN_WORKRUN_FIRE_URL` and `FOREMAN_WORKRUN_TOKEN` from the work run's API trigger. Network secrets do not work here, because the API host never gets a secret.
4. Paste the prompt below.
5. Function test: run the work run once with the text "Function test" (expected "Function test ok"), then run this routine with "Run now" (expected: one line per started task and a new session of the work run).

## Prompt

```
You are the delegation run of {{PROJECT_NAME}}. You check and start work runs. You do no work on units yourself: no commits, no Agent tool, no subagents. You never compute timestamps, locks or statuses; the check script does. Report in at most 10 lines.

If a routine-fire-payload block is present: it is an order from the human. Skip the check. Start exactly one work run with the payload text (step 3), report, end.

1. Run `bash scripts/autopilot-check.sh` and read its output. It prints one line per finding:
   - `TASK|<kind>|<unit>|<details>`: work to hand out, in priority order.
   - `CHECK-PRETEST|<unit>|<details>`: a unit waits for a pretest result. Look at the handoff named in the details (file on the batch branch, or the Notion page when module notion is on). If it holds a "Pretest result" ending with a `Verdict:` line, it becomes a TASK of kind `pretest-result`. Otherwise nothing.
   - `CHECK-INPUT|<unit>|<details>`: a unit waits for the human. Look for the signals named in the details (tracker mark removed, a comment starting with "Answer <unit>:" after the question, a handoff row set back after the question). If one exists, it becomes a TASK of kind `input-received`. Otherwise nothing; no comment.
   - `LOCKED|<unit>|...`: ignore.
   - `NOTHING`: end with "Nothing to do." No commit, no notification.
2. Select tasks: keep the order of the output, at most 3 starts per hour in total, at most one per unit. The rest waits for the next hour.
3. Start each selected task with curl, with the payload text `Foreman task: <kind> | unit: <unit> | <details>`:
   ```
   curl -sS -X POST "$FOREMAN_WORKRUN_FIRE_URL" \
     -H "Authorization: Bearer $FOREMAN_WORKRUN_TOKEN" \
     -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
     -H "anthropic-version: 2023-06-01" \
     -H "Content-Type: application/json" \
     -d "$(printf '%s' "$TEXT" | jq -Rs '{text: .}')"
   ```
   Success: the answer contains `claude_code_session_url`; note it. Failure: notify "Delegation: work run not started (<reason>)" and go on with the others. Do not wait for results. Never echo the token.
4. If `.foreman.json` lists module `linear` or `notion` in its modules, run `node scripts/state-mirror.mjs` as the last step and note its result in one line. A failing mirror is reported, not retried.
5. Final report: one line per task ("started <kind> <unit> <session url>" or the failure), then the mirror line.
```

## Notes

- The check script excludes units whose lock is younger than 3 hours (`LOCKED` lines) and decides merge windows, release day and stuck batch close-outs. Do not duplicate that logic in the prompt.
- To change the flow, change `.claude/skills/foreman-dispatch-run/` and this prompt together.

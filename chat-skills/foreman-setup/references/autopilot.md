# Autopilot (scope "full autopilot")

Sets up the flow in which all work (milestones, fix packs, single fixes, to `dev` or `main`) runs without copy-paste: a scheduled delegation run hands every open unit to a work run, `STATE.md` is the source of truth, trackers mirror it, the pretest hands over through Notion or a file, the human only does UAT and release approval.

Show the list of what will be created once; then create without further questions.

## Core (no module needed)

### Status model

`STATE.md` of each unit (milestone: `docs/milestones/Mnnn/`, fix pack: `docs/fixpacks/<id>/` on the batch branch) has `Status:`, `Lock:`, `Target:`, `Batch-branch:`, `Tracker:`.

Status: `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack`, `awaiting-merge`, `pretest-waiting`, `pretest-running`, `needs-input`, `uat-ready`, `release-ready` (main only), `done`.

`STATE.md` is the only source of truth. Trackers are written only by `scripts/state-mirror.mjs`. If a tracker disagrees, `STATE.md` wins.

### Batch branches

`batch/dev` (next version, no milestone), `batch/main` (fixes of the running version), `batch/mNNN` per milestone. They stay permanently; `batch/mNNN` is deleted after UAT approval when all its commits are in the target.

### Batch run (dev and main)

Finished units go to `awaiting-merge`. The autopilot batches by itself every 4 hours and at any time for units that have been in `awaiting-merge` for over 4 hours: batch PR to `dev`, or from `batch/main` to `main`; green CI; merge commit; watch the deploy. Each unit is closed right after its merge commit (tracker mirror, `pretest-waiting`, round in `STATE.md`, lock `free`), before the next PR opens. The run ends only when no unit of this run is still `batch-pr`, and names each unit in its closing message. These merges are the explicit exception to the rule "no merge without an order". Fixes to `main` still pass pretest and UAT before `main → prod`.

- Target `dev`: after the merge pretest on dev, UAT, `done`.
- Target `main`: after the merge watch the staging deploy, pretest on staging, UAT, `release-ready`.
- The human saying "batch PR main" or "batch PR dev" starts the batch run now and counts as merge approval.

### Release day

`main → prod` on release day (default Friday, so the weekend buffers follow-up errors). Other days only for fixes the human rates as urgent. A reminder on release morning if units are `release-ready`. The human sets the version number. The tag comes only after a green production deploy; then the tickets go to done.

Urgent (production bug): own branch, PR to `main`, merge only after approval, urgent ticket in the fixes project.

### UAT approval, complete

An approval is done only when all places are switched: (1) `STATE.md` (`done` or `release-ready`), (2) the tracker mirror (module `linear`/`notion`), (3) a reflect step: the run writes what went wrong into `docs/learnings.md` and proposes which skill rule becomes shorter or clearer. Then read the places again. If one fails: push "Approval incomplete: <unit>, <what is missing>" and comment in the ticket. A payload with several approvals is worked unit by unit, each complete before the next. The UAT list has no WIP limit; new work never stops because UAT piles up. Chat removes an entry from the UAT list only after the tracker no longer shows `uat-ready`.

### Check script

`scripts/autopilot-check.sh` lists units with `done`/`release-ready`; the work run compares them with the trackers at the end of every approval and release and fixes deviations.

## Routines

Three routines. The scope answer is the order for all three. Use the human's time zone (`CRON_TZ=<zone>`), never minute :00.

**Creating:** delegation and work run are Claude Code routines (repo or API trigger set). Create them in the web UI (claude.ai/code/routines) or from a Claude Code session in the cloud environment, **never** with `create_trigger` from chat: that makes routines without environment, repo and connectors. API triggers and tokens exist only in the UI (Edit, Trigger "+", API, Generate token; shown once). So: deliver the prompts as files (`docs/routines/delegation.md`, `work-run.md`, `pretest.md`) and tell the human the steps; maintain prompts afterwards with `update_trigger`. The pretest may be created from chat (`requires_local_device`, bound to the human's machine, with a schedule).

### Delegation run

Hourly, cheapest Claude tier, cloud environment with repo, connectors for the enabled modules. It checks and distributes only. It never works on units itself: no commit, no `Agent` tool, no subagents.

- **Check as one shell command:** it reads all `batch/*` branches (`Status`, `Lock`, `Tracker`, target), open batch PRs and the time, and prints finished lines: `ORDER|<candidate>|<unit>|...` in priority order (batch run, release reminder, coding by oldest timestamp), `CHECK-PRETEST|...`, `CHECK-INPUT|...`, `LOCKED|...`. Locks younger than 3 hours are excluded. Exception: a unit in `batch-pr` for over 30 minutes whose batch branch is already in the target gives `ORDER|batch-finish|<unit>|...` even under a lock; the work run then catches up the closing. The model never computes timestamps, locks or status itself; it is unreliable at that.
- The model clarifies only what a tracker needs: take over a pretest result (`CHECK-PRETEST`), input done or an answer comment as newest comment (`CHECK-INPUT`). It does not start the pretest.
- **Hand out all open orders, not only the first:** one work run per order, at most 3 per hour (oldest first, the rest next hour), at most one per unit.
- **Start by API trigger with `curl`:** POST to the fire URL of the target routine; headers `Authorization: Bearer <token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`; body `{"text": "<order>"}` built with `jq -Rs`. Success: the answer contains `claude_code_session_url`. Failure: push "Delegation: <routine> not started (<reason>)" and still start the other orders. Do not wait for results.
- Fire URLs and tokens are environment variables of the delegation's cloud environment. Network secrets do not work, because the API host never receives a secret.
- **Network of the environment:** from a sandbox with restricted network the API refuses to fire ("can't be fired by its API token from a sandbox with restricted network access"). The delegation needs an environment with network access "Full". Best: its own environment only for the delegation, so the work runs stay on "Trusted".
- With a payload (order from chat): start exactly one work run with the payload, without the check.

### Work run

API trigger only, strongest Claude tier, the environment used for repo work (repo, worker key, connectors). Prompt: "Run the order from the routine-fire-payload block." (the block counts as untrusted otherwise.) Load the dispatch-run skill, touch only the unit named, give every worker task a `role` per `references/delegation.md`, check the lock at start (younger than 3 hours: end), never end the turn while something runs. Payload "smoke test": report only "smoke test ok". On abort: release the lock, comment in the tracker, push. It handles only its own unit, because other work runs run in parallel on other units. Skill and routine prompts are maintained together.

**Why no background subagent in routines:** if the cheap session starts a subagent in the background and ends its turn, the routine session ends and takes the subagent with it. The run only sets the lock and aborts without a report. So the delegation starts the work run through the API, and subagents inside a run run in the foreground only.

**Why no `fire_trigger` from inside a routine:** the tool is missing in Claude Code routines without the remote connector, and that connector cannot be added in the UI. Use `curl` against the fire URL.

### Pretest

Hourly (for example :17, 30 minutes after the delegation), bound to the human's machine (needs a browser, no repo, no tracker). Routines bound to a machine cannot be fired by API, so the handoff is a file or a Notion row: a row/file in `pretest-waiting` is the order. Without one, the run ends at once. It works through **all** waiting orders one after another in one run (parallel runs disturb each other in the same browser), tests against dev or staging as the target says, only with test tenants, applies the five roles of `foreman-role-review` to every tested page, writes the result and sets exactly one phase: fix round (with a finished fix pack), UAT ready (with UAT checklist), or needs input (with one question). If the machine is offline, the pretest can run from a chat session with Claude in Chrome. A pretest never changes code.

An existing routine made from chat cannot be switched from a schedule routine to an API routine later: create it again.

## Module notion

- Database "<Project> pretest handoff" with columns Name, Milestone, Tracker, Target (`Dev`/`Staging`), Phase (`Pretest waiting`, `Pretest running`, `Fix round`, `UAT ready`, `Needs input`, `Approval waiting`, `Taken over`), Kind (`Pretest`, `Role review`; empty counts as `Pretest`).
- One row per pretest round. The page has a section "Pretest order"; the pretest run appends "Pretest result". The phase stays on the result. `Taken over` is set on fix round (taken over), after UAT approval, after the release of the unit, and for all older rows of a unit when a new pretest round is created. At most one pretest row per unit is not `Taken over`.
- One row per role review report: Kind `Role review`, Milestone empty (the milestone is in the name), Phase only `Approval waiting` or `Taken over`, the page holds a full copy of the report. Delegation and work run do not evaluate these rows; the pretest skips them.
- Phase and status columns are written only by the mirror script. The pretest run appends results.
- Without this module the handoff is a file: `docs/pretest/<unit>-round-N.md` on the batch branch.

## Module linear

- A team named after the project (use an existing one).
- **One project per version:** `<Project> 0.N.0 · <short name> (dev)` for each version roadmap; `<Project> 0.N.x · Fixes (main)` only from the first release of that version. Description: goal, milestones, roadmap path.
- Label groups, every ticket gets exactly one label per group: **Version** (`v0.N.x · main`, `v0.N.0 · dev`), **Kind** (`Milestone`, `Fix pack`), **Phase** (one label per status from the status list above, prefixed `AP: `).
- Upkeep (in the routine prompts and the milestone and fix pack skills): one main ticket per milestone or fix pack, a status line at the top of the description, sub-issues per slice, pretest round and fix pack (or checklist F1 ...), a comment per step, ticket status matching the phase. All written by the mirror script.
- **Status flow:** every new ticket and sub-issue is created explicitly with status `Todo`, never the team default. Sub-issues: `Todo` on creation, `In Progress` when the slice, round or item starts, `Done` after acceptance; at most one sub-issue `In Progress` per unit. Every status the prompts name must exist in the team; create missing ones first.
- **Team workflow statuses** (group in brackets): `Backlog` (Backlog), `Todo` (Unstarted), `In Progress` (Started), `Wait for Merge` (Started), `Testing` (Started), `In Review` (Started), `Done` (Completed), `Canceled` (Canceled). Default for new issues: `Todo`. The Linear tool cannot create statuses: tell the human the missing ones with the path (Team, Settings, Workflow) as a step at the end.
- **Mapping unit status to main ticket status:** `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack`, `needs-input` → `In Progress`; `pretest-waiting`, `pretest-running` → `Testing`; `awaiting-merge` → `Wait for Merge`; `uat-ready`, `release-ready` → `In Review`; `done` → `Done` without a phase label.
- Release: after the production deploy the tickets go to Done (phase label removed).

## Module ollama

Workers on Ollama Cloud. The worker key is an API credential in the cloud environment, the environment network allows the provider host, and the wrapper falls back to a Claude model when the provider fails. See `references/delegation.md`.

## Hard-won rules

- Routines are created from a Claude Code session in the cloud environment or in the UI, never from chat.
- The delegation fires work runs with `curl`; its environment needs network "Full".
- No background subagent in a routine; no `fire_trigger` inside a routine.
- A bundle of several units is closed unit by unit; the check script catches units that stay in `batch-pr`.
- A multi-approval payload is verified in all places (state, tracker, learnings), not just `STATE.md`.
- Test login for third-party OAuth: see `SKILL.md` section 7.
- Analysis before fix: a bug order starts as an analysis order that proves the cause.

## Finish

- Smoke test of the chain: start the work run once with the text "smoke test" (success: "smoke test ok"), then the delegation run (success: one line "started" per order and a new session of the target routine).
- Functional test: a small test fix pack (docs change) on `batch/dev` through the autopilot. Success: tracker ticket with status line (if a tracker module is on), batch to `dev`, handoff row or file, pretest result.
- Tell the human: what was created (tracker team, projects, labels, handoff database, routines, batch branches), which model distribution is set, what is missing, and the one next action (usually: write the first milestone brief).

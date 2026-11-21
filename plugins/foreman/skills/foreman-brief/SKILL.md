---
name: foreman-brief
description: Write a milestone brief (and the design boards it needs) so the coding agent can build it unattended, then hand it off. With no milestone number, build a situation report and start what is ready. Use for a new milestone, slice or "write me an order".
---

# foreman-brief: milestone briefs and handoff

You write briefs that an Agent can execute without questions. The Agent has no chat history, so every brief stands alone. Describe what, not how. Say "the Agent". Never name models.

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. Brief files follow the project's document language.

## Project data

Read `.foreman.json` in the repo (if you can): `modules` (`tracker-itsaplan` or `tracker-linear`, or neither = tracker `none`; `delegate`, `gateway`, `autopilot`, `pretest`), `agent`, and `context` (`stagingUrl`, `devUrl`, `testTenant`, `offLimits`, `language`, `releaseDay`, `workRun`). If the file is not readable, use the chat project's files. Ask once for what is still missing and offer to record it under `context`. Never ask for tokens. Module parts below are marked **Module x**; ignore them when the module is off.

## Calls

| Call | Behaviour |
|---|---|
| No milestone number | Situation report first (read `references/situation-report.md`), then briefs for everything ready |
| Milestone number (`M004`) | Only that milestone. If it is blocked, say so instead of starting it |
| A bug or investigation | Not a brief. Hand over to `foreman-fix` |

Brief or fix pack? A brief is several related capabilities that need planning into slices. A fix pack is one closed change or investigation. If unsure, ask: "Could you review this in one go, or are these capabilities that build on each other?" More than about 10 capabilities is a project: split it and write only the first milestone.

## Flow

1. Collect what exists (step 1). Ask only what the files do not answer.
2. If the milestone has new or changed UI: design first (step 2).
3. Run `foreman-role-review` in briefing mode (step 3).
4. Write the brief (step 4), show it with a short summary.
5. After approval, hand off (step 5).

### 1. Collect, then ask

Read: `requirements.md`, the roadmap, `design.md` and the design reference, earlier briefs and agent reports, `docs/milestones/*/STATE.md`, and recent chats of this project for decisions and approvals not yet in the repo.

Ask in rounds of 2 to 4 questions, most important first, until you can restate the goal and know how "done" is measured:

- What can a user do afterwards that they could not before?
- Which 3 to 8 capabilities (user's view); is there a required order?
- What is explicitly out of scope; what must the Agent not touch?
- Which decisions are already fixed (architecture, libraries, naming)?
- Affected data and interfaces; needed environment variable names (names only).
- Testable success criteria per capability; verification commands.
- What only a human can check in a browser?

Contradictions between documents or gaps in requirements: raise them before writing. Never decide silently. Read the accessibility line in `requirements.md`. If a WCAG level is required, put version and level into the brief and into every fix order with UI. If the line is missing, ask once and propose adding it.

### 2. Design first (mandatory for UI)

A new or changed screen, tab, dialog, component or control needs an approved design board before any order goes out. Boards are made in this chat, never by the Agent. Read `references/design-first.md` for the steps. Short form: create or change the board, run the role review on it, show it, wait for explicit approval, commit the board sources under `docs/design-reference/` on the batch branch, and name the board and approval in the brief.

Pure text, spacing or error fixes without a new element need no new board.

### 3. Role review in briefing mode (mandatory)

Before every brief, and before every fix order with UI, run `foreman-role-review` in briefing mode (includes the accessibility auditor). No brief goes to approval without its report.

- Review the existing area on staging (if it is running) and the boards.
- Findings on boards: fix them before the board is approved.
- Findings in the existing product that belong in this milestone: add to the brief section "Role review findings". Others become a separate fix pack after the human agrees. Accessibility findings owned by content editors go to the human as a list, not into the brief.
- The risk preview (edges, error paths, permissions, tenant boundaries) becomes success criteria.
- Name the report under "Binding documents".

Without UI and without a running product, only the risk preview remains; the report is short.

### 4. Write the brief

File: `docs/milestones/Mnnn/Mnnn-CONTEXT.md`. Use the structure in `references/brief-template.md`. Sections: goal, starting point, capabilities (3 to 8, user's view), order and dependencies, parallel milestones, surface (approved boards), accessibility, role review findings, binding documents, fixed decisions, data and interfaces, out of scope, success criteria, verification, risks.

Rules:

- No task list, no file list as a build plan, no implementation details, no time estimates, no secrets.
- No deploy instructions and no browser verification by the Agent. Batch PR, dev deploy and pretest belong to the repo workflow.
- Success criteria are testable. No adjectives like "fast" without a number.
- Verification commands run as single commands, no pipes. Name the project's real test, typecheck, lint and build commands.
- Reference requirements and design; do not copy them.
- Technical demands from the human are fixed decisions with a short reason, not capabilities.

### 5. Handoff

Show the brief as a file with a short summary: goal, number of capabilities, most important out-of-scope items. When several milestones are ready, show all and let the human drop single ones. If the human already said "go" or "start all", do not ask again (boards still need their approval).

Then:

- **Module autopilot:** commit the brief to `docs/milestones/Mnnn/` on `batch/mNNN` (create the branch with `node scripts/batch-branch.mjs mNNN` if missing). Create `STATE.md` from the template with `Status: planning`, `Target: dev`, `Batch-branch: batch/mNNN`, `Lock: free`, `Tracker: -`. The central dispatcher (LLM-free, runs on the human's machine, every 10 minutes) sees the unit and starts a work run. To start at once from chat, fire the work-run routine with the full order as payload, one fire per milestone, never two milestones in one payload. Fire from chat only for first starts, answers and approvals; the human holds the fire URL and token, never ask for them.
- **Project mode (Claude Code project):** the thread that owns the milestone is the session. Commit the brief to `batch/mNNN`, then run `foreman-milestone` in that thread. Do not hand the order to a second session. Rules: `foreman-project-mode`.
- **Without autopilot:** give the human one line to paste into a coding agent session: `Run milestone M004`. The brief file must be on the batch branch first.
- **Tracker (itsaplan or linear):** tickets are created only by the mirror script from `STATE.md`. You never create or change tickets or statuses. With tracker `none`, `STATE.md` is the whole record.
- **Module autopilot:** before starting, check that the dispatcher timer and the work-run routine are on (ask the human, or read the last dispatcher log line if you can). If not, remind the human before the start and again in the start message. Without them a milestone is queued and nothing runs.
- **Module pretest:** the cloud pretest runs inside the work run after the dev deploy. Do not send a second pretest from chat.

After the start, report: what runs (per track), whether the dispatcher is on, what arrives by itself ("UAT ready", "Action Required", "autopilot idle"), what could still start in parallel, what the human's next approval unlocks. After a UAT approval, the human can repeat the bare call and you start whatever became free.

## When the human is asked

Only for an intervention (`needs-input`, shown in the tracker as Action Required): a missing or contradicting requirement, an open decision, a missing infrastructure or permission, a merge conflict that needs a product decision, a UI result that deviates strongly from the board, or limits exceeded (more than 2 rework or 3 retest rounds, red CI after 3 own fix attempts). Otherwise the human sees only "UAT ready" with the checklist.

**Intervention comment rule.** A unit with an intervention is not handed over until the same run has put a comment in the tracker: the question in one sentence, options A/B/C with their consequences, a recommendation, a link to the report, and the way to answer (`Answer <unit>: ...`). A status without that comment is invisible to the human. When you relay a question from the report, give the same five parts.

**Answers.** The human answers in chat or in the tracker. In the tracker the comment starts with `Answer <unit>:` and must come from the human's own account, because bot comments never count. With tracker `none` the answer is a file `docs/answers/<unit>.md` with the line `Answer <unit>: ...` on the unit's batch branch, or a payload to the work run. Chat writes that file or fires the payload when the human answers here.

## Special cases

- Requirements unclear: sharpen them with the human or extend `requirements.md`. Never write a vague brief.
- Board missing or `design.md` incomplete: create the board here and get approval first. Never leave it to the Agent.
- Impatient human: show a draft with what exists plus the two most important open questions.
- No repo access in this session: build the report from project documents and chat context and say plainly that the repo state (`STATE.md`, batch branches) was not checked.
- Two parallel milestones touch the same tables or pages: name it as a risk and propose delaying one.
- Role review finds a violation of the required WCAG level on a board: change the board and review again before showing it.

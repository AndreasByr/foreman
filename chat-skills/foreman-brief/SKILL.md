---
name: foreman-brief
description: Write a milestone brief (and the design boards it needs) so Claude Code can build it unattended, then hand it off. With no milestone number, build a situation report and start what is ready. Use for a new milestone, slice or "write me an order".
---

# foreman-brief: milestone briefs and handoff

You write briefs that an Agent can execute without questions. The Agent has no chat history, so every brief stands alone. Describe what, not how. Say "the Agent". Never name models.

Check `.foreman.json` in the repo (if you can read it) for enabled modules: `ollama`, `linear`, `notion`, `autopilot`. Module parts below are marked **Module x**; ignore them when the module is off.

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

- **Module autopilot:** commit the brief to `docs/milestones/Mnnn/` on `batch/mNNN` (create the branch with `node scripts/batch-branch.mjs mNNN` if missing). Create `STATE.md` from the template with `Status: planning`, `Target: dev`, `Batch-branch: batch/mNNN`, `Lock: free`, `Tracker: -`. The delegation run picks it up. Or fire the dispatcher routine, one fire per milestone, never two milestones in one payload.
- **Without autopilot:** give the human one line to paste into a Claude Code session: `Run milestone M004`. Also tell them the brief file must be on the batch branch first.
- **Module linear:** tickets are created only by `scripts/state-mirror.mjs` from `STATE.md`. You never create or change tracker tickets or statuses.
- **Module autopilot:** before starting, check that the scheduled routines (delegation, work run, pretest) are on. If not, remind the human before the start and again in the start message. Without active routines a milestone plans and then stops.

After the start, report: what runs (per track), whether the schedules are on, what arrives by itself ("UAT ready", "needs input", "autopilot idle"), what could still start in parallel, what the human's next approval unlocks. After a UAT approval, the human can repeat the bare call and you start whatever became free.

## When the human is asked

Only for `needs-input`: a missing or contradicting requirement, an open decision, a missing infrastructure or permission, a merge conflict that needs a product decision, or limits exceeded (more than 2 rework or 3 retest rounds, red CI after 3 own fix attempts). Otherwise the human sees only "UAT ready" with the checklist.

## Special cases

- Requirements unclear: sharpen them with the human or extend `requirements.md`. Never write a vague brief.
- Board missing or `design.md` incomplete: create the board here and get approval first. Never leave it to the Agent.
- Impatient human: show a draft with what exists plus the two most important open questions.
- No repo access in this session: build the report from project documents and chat context and say plainly that the repo state (`STATE.md`, batch branches) was not checked.
- Two parallel milestones touch the same tables or pages: name it as a risk and propose delaying one.
- Role review finds a violation of the required WCAG level on a board: change the board and review again before showing it.

---
name: foreman-roadmap
description: Use when the human needs a roadmap for a project or version: milestones, slices, dependencies, parallel strands and a human-testing section per milestone. Reads docs/requirements.md; writes docs/roadmap-0.N.0.md.
---

# Roadmap

Answer in the language the human writes in; the roadmap file follows the project's document language.

Build a complete roadmap an agent team can execute: milestones, slices, dependencies, parallel strands, and a human-testing section per milestone. Plan realistically.

## Reality of this workflow

Agents write the code. Several runs build several milestones at the same time, one batch branch per milestone (`batch/mNNN`). The central dispatcher starts the runs. The bottleneck is human testing and approval (UAT).

| Phase | Duration | Who |
|---|---|---|
| Agent coding | 2 to 5 days per milestone | Agent, autonomous |
| Testing | 2 to 5 days per milestone | cloud pretest and role review in the work run, then UAT by the human |
| Total | 4 to 10 days per milestone | |

- A slice is one bounded agent order, not a developer day.
- Never estimate testing smaller than coding; estimate it larger.
- The testing section is equal to coding and gets the same planning detail.
- Feedback loops (agent builds, human checks, agent corrects) are planned, not an afterthought.
- Milestones run in parallel strands where dependencies allow. The longest strand sets the duration, not the sum. Parallel strands move the bottleneck to UAT.

## Files

- One roadmap file per version: `docs/roadmap-0.N.0.md` (`0.1.0`, `0.2.0`, ...). Milestone numbers (`M001`, `M002`, ...) keep counting across roadmaps.
- Without versioning: `docs/roadmap.md`.
- Input: `docs/requirements.md` from `foreman-roast`. Without it, ask up to 5 questions: what the project does, what v1 must do, stack, who tests and how much time per milestone, deadlines.

## Flow

### 1. Clarify context

With requirements present, ask only: who tests (names or roles), hard deadlines, which release or version this roadmap covers, which agent setup runs it, and, if the accessibility line is missing, whether WCAG applies. Max 3 questions per round, until 99 percent sure. If the tracker is not recorded yet, ask that in the same round (see step 4).

### 2. Derive milestones and strands

- Only passed human testing proves a milestone done.
- Dependencies are explicit. A dependent milestone starts only after the testing approval of its predecessor. Independent milestones start at once.
- More than 5 days of coding: split it, concretely, and say where the clean cut is. Check whether the parts fit separate strands.
- Cut milestones so they touch few shared files (schema, translations, navigation). Parallel strands then rarely conflict.
- A **strand** is a chain of dependent milestones. Independent chains are separate strands and run together. A shared foundation comes first in the strands that need it. The launch milestone starts when all strands are approved. The longest strand is the critical path.
- External APIs or third-party systems get their own integration milestone, marked as potential blocker for the rest of its strand.
- **WCAG required:** accessibility belongs into every milestone with UI, as acceptance criterion and as its own test flow. No collective "accessibility" milestone at the end. The launch milestone adds a final check of all pages against the required level, the required statement pages, an editor guide when a CMS exists, and a recommended test with affected users. Re-check after large rebuilds.

Milestone types: Foundation (setup, auth base, CI), Core Feature, Integration (external APIs, webhooks, imports), UX / Polish (error states, edge cases, onboarding), Launch (deploy, monitoring, final approval, handover).

### 3. Write the roadmap

Start with the header, then the section "The schedule" (strand table and calculation), then one block per milestone, the dependency overview and the summary. Read `references/milestone-template.md` for the exact block of one milestone, and `references/schedule-and-summary.md` for the schedule, dependency overview and summary. Read both before writing.

Each milestone block has: type, strand, goal, coding and testing days, dependencies, slices, and a Human Testing section with test goal, testers and roles, acceptance criteria, a marked go/no-go criterion, flow checklists (main flow, error cases, accessibility flow when WCAG applies), the feedback-loop protocol and known risks.

### 4. Tracker

Read `references/tracker.md`. The tracker is `itsaplan`, `linear` or `none`, taken from `.foreman.json` modules or the roadmap header of an earlier version. If it is recorded, set up the version in the tracker as that file says, without asking. If not, ask the one question there. Write `**Tracker:** itsaplan | linear | none` (with link) into the header.

### 5. Deliver

1. Write the roadmap file (in a repo session to `docs/`; otherwise to the output folder and present it as a download).
2. Summarize in chat: number of milestones, the strands, duration by critical path (and sequential for comparison), where the testing bottleneck sits, and what was set up in the tracker.
3. Ask: "Is the granularity right? Do the strands fit? Are milestones too big or too small? Who takes which testing block?"

## Quality rules

**Slices**
- One slice is one bounded agent order, fully doable in one session, with a technically checkable done state ("route returns 200", "form saves to the database").
- Ordered by technical dependency; no slice builds on an unfinished one. Independent slices may run in parallel.
- Never "implement the backend": too vague.

**Acceptance criteria**
- Checkable without interpretation ("error text appears", not "error is visible").
- One person verifies them alone in under 60 minutes.
- The go/no-go criterion is always marked.
- Accessibility criteria name the WCAG version and level.
- No subjective criteria ("feels good", "runs smoothly").
- A criterion an agent can verify itself (automated test, API call, browser flow) is tagged `[agent]`; only what needs a second real account, real hardware or a product decision stays for the human (`[human]`). The pretest covers the agent part before UAT.

**Test flows**
- Reproducible: two testers reach the same result. Expected result stands after every checkable step.
- Error cases and edge cases get their own flows. Never "test all features".
- The loop is explicit: finding, then agent order, then re-test of the affected flow only.

**Dependencies**
- Testing approval, not coding completion, unblocks dependents.
- Every milestone belongs to a strand. No implicit dependencies, no artificial order.
- External dependencies are shown as risks.

## Special cases

- **Several releases:** detail only the next release; later releases get their own roadmap before they start.
- **Testing capacity unclear:** list it as a risk and estimate conservatively (nearer 5 days than 2). With parallel strands, check whether UAT can absorb several milestones at once.
- **Agent drifts while coding:** this is normal. Slices are small with clear done states for that reason.

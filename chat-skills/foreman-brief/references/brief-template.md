# Milestone brief template

File: `docs/milestones/Mnnn/Mnnn-CONTEXT.md`. Write the sections in this order. Skip a section's body only where it says so.

```markdown
# Milestone Mnnn: <title>

**Project:** {{PROJECT_NAME}}
**Roadmap:** <roadmap file> · **Track:** <name> · **Parallel to:** <milestones running at the same time>

## Start approval
<Only if the predecessors' status in the roadmap is not updated yet: "Blocked by: ... UAT approved by the human on <date>".>

## Goal
<2 to 4 sentences: what can be done after this milestone that could not before.>

## Starting point
<Stack, repo state, what predecessors in the track delivered. Only what the Agent needs.>

## Capabilities
1. <vertical, demonstrable, from the user's view>
2. ...

## Dependencies and order
<Only real technical dependencies. Otherwise: no fixed order.>

## Parallel milestones
<Which milestones run on their own batch branches at the same time and which shared files (schema, migrations, translations, navigation, permissions) both touch. Rule: shared files are only extended, never renamed or reordered.>

## Surface
<Approved design boards with name and approval date. Rule: no UI without an approved board; a strong deviation is `needs-input`. "No UI" if none.>

## Accessibility
<Only if required: standard, version and level, e.g. WCAG 2.2 AA. Applies to every page and dialog of this milestone. Criterion: no violations of that level; an automated accessibility check runs in verification. Otherwise: "not required".>

## Role review findings
<Report name from briefing mode. Findings taken over from the existing product as items with the target behaviour. The risk preview is part of the success criteria.>

## Binding documents
<Requirements, roadmap, design file, design reference, skills the Agent must read for UI and text. Read before working in that area, do not change. Conflict order: requirements > design file > roadmap > brief. A missing design token: report it, do not invent it.>

## Fixed decisions
<Not negotiable, each with a short reason.>

## Data and interfaces
<Affected models, external APIs, variable names without values.>

## Out of scope
<Anti-goals and areas that stay untouched.>

## Success criteria
<One testable sentence per capability: a user can do X and sees Y.>

## Verification
Commands that must be green: <the project's test, typecheck, lint, build commands, one per line, no pipes>
Human only (UAT): <only what needs a second real account, real hardware or a product decision; everything the Agent can test is proven in the cloud pretest. If accessibility is required: one pass with keyboard only and one with a screen reader>

## Risks
<Known pitfalls, fragile spots.>
```

Never include: a task list, a file list as build plan, implementation details, time estimates, secrets, deploy steps, browser verification by the Agent.

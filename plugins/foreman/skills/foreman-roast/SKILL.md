---
name: foreman-roast
description: Use when the human presents a project idea and wants it challenged or validated before any code or design. Ends with a one-sentence project goal and a finished docs/requirements.md.
---

# Roast

Challenge a project idea, sharpen it, and turn it into a clear goal and `docs/requirements.md`. Nothing is built, designed or planned before this is done.

A good roast is the hardest feedback a well-meaning, experienced sparring partner can give, delivered before the human spends time and money in the wrong direction.

## Rules

- Ask at most 3 questions per round. Build on the previous answers.
- Ask where context is missing; do not judge without knowledge.
- Be direct and concrete. "The problem is unclear" is not a roast. "I cannot name one person who would pay for this until you name one who does" is.
- Give no empty praise and no put-downs.
- Answer in the preferred language (`.foreman.json` `context.language`), else in the language the human writes in. The requirements file follows the project's document language (`.foreman.json` `context.language`, else the human's language).
- Chat writes no code and pushes nothing. The only output is the requirements file.

## Flow

### 1. Understand the idea

Let the human describe it in their own words. If the idea is not clear yet, ask up to 3 opening questions: the core problem, the target group, the current status (idea only, started, competitors known). If the idea is already clear, skip them.

### 2. Roast

Give a plain verdict per category:

| Category | Core question |
|---|---|
| Problem | Is it real and painful enough that people pay or invest time? Would 100 people spend money on it today? |
| Target group | Clear, reachable, large enough? Or so niche it never gains traction? |
| Uniqueness | What is different? If five similar tools exist, why would this one win? What would users lose if it never existed? |
| Feasibility | Is the scope realistic for the team and budget? Hidden complexity (legal, technical, operational)? External dependencies? |
| Value | How does it earn money or create measurable benefit? "We will see later" is a finding. |
| Scope | What is the true minimum to test the core hypothesis? What is packed in unnecessarily? |

Add accessibility to the feasibility check: if the project serves consumers or public bodies, accessibility law may require WCAG conformance (for example the EU accessibility rules for consumer services, public-sector rules). That costs time in design, coding and testing of every milestone.

Non-commercial projects (open source, internal tool, hobby): replace "will anyone pay" with "will anyone use it, and does it solve the problem better than what exists".

### 3. Brainstorm

Offer 3 to 5 constructive options: another target group, a smaller version that tests the core, an unused USP, a risk mitigation, an analogy from another field. They are offers. The human decides.

### 4. Verdict

| Verdict | Meaning |
|---|---|
| Go | Strong idea, clear problem, realistic scope. Start. |
| Go with sharpening | Good base; 1 or 2 critical points must be clarified first. |
| Pivot or stop | Fundamental problem: change the idea or drop it. |

Justify it in 2 or 3 sentences.

### 5. Goal and requirements questions

Ask until you are 99 percent sure what the project must build. Cover:

- The precise goal in one sentence, no marketing talk.
- What is in v1 and what comes later.
- Constraints: time, budget, stack, team.
- Definition of success.
- **Accessibility (always ask, even when everything else is clear):** must the project meet WCAG? If yes, which version and level (suggest WCAG 2.2 AA) and why (legal duty, client, own standard)? If yes, also ask whether the audience needs plain or easy-read language and whether other people maintain content through a CMS. Without an answer there is no requirements file.
- Project-specific rules the human wants every agent to follow (house rules). Record them in the requirements under "Constraints"; they later flow into the design file and briefs.

### 6. Write `docs/requirements.md`

When you are 99 percent sure, write the file from `references/requirements-template.md`. Read that file now. Fill every section; write "none" instead of leaving a section out. The accessibility line is mandatory. If WCAG is required, the level binds design, roadmap, milestone briefs and role reviews. The document follows `docs/docs-rules.md` (without the repo: `template/docs/docs-rules.md` of the foreman repo).

## Output

1. Write `requirements-<short-name>.md` to the output folder and present it as a download. In a repo session, write `docs/requirements.md` directly.
2. Summarize in 3 to 5 sentences: the verdict, the most important pivot or sharpening point, and what the project needs next.
3. Ask: "Does this hit the core? Should I reweight something or go deeper on one area?"

## Special cases

- **Idea completely unclear:** ask the opening questions first. Roasting without context is useless.
- **Human gets defensive:** restate the aim once: a friend telling hard truths now so nobody else has to later. Then continue.
- **Idea already mature:** skip to scope and feasibility.

## Next step

With requirements done, the next chat skills are `foreman-roadmap` (milestones and tests) and `foreman-design-file` (design tokens), in that order. Started from `foreman-project`: hand the result back and let it continue. For a demo or prototype under two weeks, point at `foreman-quick` instead of the full path.

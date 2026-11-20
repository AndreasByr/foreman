# Milestone block

Use exactly this structure for every milestone.

```markdown
## Milestone M<NNN>: <Name>

**Type:** Foundation | Core Feature | Integration | UX / Polish | Launch
**Strand:** <strand name>
**Goal:** <1 sentence: what is provably true after this milestone?>
**Coding:** ~<2-5> days (agent)
**Testing:** ~<2-5> days (human)
**Status:** open

---

### Dependencies

- **Blocked by:** <milestone X / external system Y / "none">
- **Blocks:** <milestone Z / "none">
- **Parallel to:** <milestones that can run at the same time / "-">
- **External risks:** <API availability, access, third parties / "none">
- **Shared files:** <schema, translations, navigation that a parallel strand also changes / "none">

---

### Slices (agent orders)

Each slice is one bounded order the agent completes in one session. The done state is stated from the agent's view: what must be deployable and checkable before the next slice starts.

| # | Slice | Agent order (short) | Done when |
|---|---|---|---|
| S1 | <title> | <what the agent builds> | <checkable result> |
| S2 | <title> | <what the agent builds> | <checkable result> |

Dependent slices are sequential. Independent slices may run in parallel.

---

### Human Testing

The testing block is equal to the coding block and is the approval.

#### Test goal
<What this section proves, from the user's view, 1 or 2 sentences.>

#### Testers and roles

| Person / role | Focus | Available from |
|---|---|---|
| <name or role> | <correctness, UX> | after coding is done |

#### Acceptance criteria

All must be ticked. The milestone is not done before the list is complete.

- [ ] **<Criterion 1>** [agent|human]: <concrete, measurable condition>
- [ ] **<Criterion 2>** [agent|human]: <condition>
- [ ] **Accessibility** *(only if WCAG is required)* [agent]: <role review, accessibility auditor, has no open high or medium findings against WCAG <version> <level> on all pages of this milestone>

Go/no-go: <the one criterion that blocks dependent milestones when unmet. Always name it.>

#### Test flow checklist

Each step is worded so two people reach the same result. Every checkable step states its expected result.

**Flow A: <main use case>**
- [ ] Step 1: <concrete action, e.g. "open <staging-url>/login">
- [ ] Step 2: <action, e.g. "enter email and password, click 'Sign in'">
- [ ] Step 3: Expected: <e.g. "redirect to /dashboard, user name visible in the navbar">

**Flow B: <error case / edge case>**
- [ ] Step 1: <e.g. "enter a wrong password, click 'Sign in'">
- [ ] Step 2: Expected: <e.g. "error 'Invalid credentials' shows, no redirect, fields keep their input">

**Flow C: <further case>** *(if needed)*

**Flow A11y: accessibility** *(required when WCAG applies and the milestone has UI)*
- [ ] Step 1: <run the main flow with keyboard only: Tab, Enter, Space, Escape>
- [ ] Step 2: Expected: <every element reachable, focus always visible, dialogs close with Escape and return focus>
- [ ] Step 3: <go through the page with a screen reader, submit one form>
- [ ] Step 4: Expected: <headings, buttons and fields are announced with names; errors and success messages are read out>
- [ ] Step 5: <zoom to 200 percent, then window width 320 px>
- [ ] Step 6: Expected: <no clipped text, no horizontal scrolling, all actions reachable>

#### Feedback-loop protocol

When a flow fails or a criterion is unmet:

1. Document the finding: where exactly, what happens, what was expected.
2. Write the correction order for the agent (short description for the next run).
3. Re-test only the affected flow, not the whole checklist.
4. Approve the milestone only when all criteria are met.

#### Known risks in this milestone
- <What could block the coding agent or lead to wrong assumptions?>
- <What might testers miss unless told explicitly?>
- <Which shared files does a parallel strand also change?>
```

# M000 – <title>

Brief for the Agent. Write what, not how. No task list, no implementation details, no secrets, no deploy steps. Refer to documents; do not copy them. More than about 10 capabilities: split the milestone.

## Goal

One or two sentences: what changes for whom.

## Starting point

What exists today. Which milestones this builds on.

## Capabilities

3 to 8, from the user's view ("A member can ...").

1.
2.
3.

## Binding documents

`docs/requirements.md` (sections ...), `docs/roadmap.md`, `docs/design.md`. Conflict order: requirements, design, roadmap, this brief.

## Interface

Per new or changed screen, element, dialog or layout: design board file under `docs/design-reference/`, "approved on <date>". Pure text, spacing and bug corrections: "no interface".

| Slice or capability | Board | Approved on |
|---|---|---|

## Fixed decisions

Decisions the Agent must not reopen.

## Not in this milestone

## Success criteria

Testable sentences. Each can be proven by a test, a command or a browser flow.

1.
2.

## Verification

Commands without pipes: tests, typecheck, lint, build.

## Risks

Permissions and tenant isolation, migrations, external services, login through a third party (provide a test login that is active only in `dev`/`test` behind its own switch; startup aborts with the switch on staging or production).

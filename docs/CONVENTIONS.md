# Conventions

Every file in foreman follows these. Skills, templates and prompts use the same words for the same things.

## Language and voice

- English. Short sentences. No marketing words.
- Prompts for agents describe **what**, not how. They say "the Agent", never a product or model name.
- Model names appear in exactly one place: `tools/delegate/config.toml`. Skills and prompts name a **role**, never a model.

## Names

| Thing | Name |
|---|---|
| Repo skills (installed into a project) | `.claude/skills/foreman-<name>/SKILL.md` |
| Chat skills (uploaded to claude.ai) | `chat-skills/foreman-<name>/SKILL.md` |
| Placeholders in templates | `{{PROJECT}}` (slug, lowercase), `{{PROJECT_NAME}}` (display name) |
| Milestone | `M001`, folder `docs/milestones/M001/` |
| Fix pack | `<YYYY-MM-DD>-<slug>`, folder `docs/fixpacks/<id>/` |
| Agent report | `docs/agent-reports/<YYYY-MM-DD>-<slug>.md` |

## Branches

| Branch | Environment | Rule |
|---|---|---|
| `prod` | production | only `main → prod`, on release day, after human approval |
| `main` | staging | only via batch PR or release order, never a direct push |
| `dev` | dev / next version | work branches merge here |
| `batch/main`, `batch/dev`, `batch/mNNN` | collection branches | agents push finished work here, one batch PR per window |
| `agent/<slug>` | work branch | one per run, deleted after its commits are in the target |

A project without staging uses only `main` and `dev`; the installer asks.

## Unit status (field `Status:` in `STATE.md`)

`planning` · `slice` · `rework` · `validation` · `batch-pr` · `fixpack` · `awaiting-merge` · `pretest-waiting` · `pretest-running` · `needs-input` · `uat-ready` · `release-ready` · `done`

A **unit** is a milestone or a fix pack. `STATE.md` is the only source of truth for its status. Trackers (Linear, Notion) are mirrors written by `scripts/state-mirror.mjs`, never by a model.

Other `STATE.md` header fields: `Target: dev | main`, `Batch-branch:`, `Lock: free | <ISO time> <run id>`, `Tracker: <id> | -`, `Pretest-round: <N>`. The status line reads `Status: <status> · since <UTC YYYY-MM-DDTHH:MMZ> · <note>`.

## Delegation roles

| Role | Writes code | Purpose |
|---|---|---|
| `discuss`, `uat` | – | the session itself: talk to the human, accept results |
| `research` | no | read the codebase, answer a question |
| `planning` | no | draft a plan for a large or unclear order |
| `validation` | no | review a diff after mechanical checks are green |
| `execution` | yes | complex change |
| `execution_simple` | yes | small, well-defined change |
| `completion`, `subagent` | no | short follow-up work, never code |

## Size limits (token budget)

| File | Limit |
|---|---|
| `CLAUDE.md` | about 2 KB, rules only |
| Text a hook injects at session start | about 1.5 KB |
| A `SKILL.md` | about 8 KB; details go into `references/*.md` next to it and are read on demand |
| History, reasons, incidents | `docs/learnings.md`, never in a skill |

A rule in a skill states what to do. Why it exists, and which incident caused it, goes into `docs/learnings.md` with a one-line pointer if needed.

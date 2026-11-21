# Docs rules

This file says which documents a project has, who writes them, and when a large document is split.

## Documents of a project

| Document | Location | Written by | Updated when |
|---|---|---|---|
| Requirements | `docs/requirements.md` | `foreman-roast` with the human | the goal or scope changes |
| Roadmap | `docs/roadmap-<version>.md` or `docs/roadmap.md` | `foreman-roadmap` | milestones change |
| Design | `docs/design.md` and boards in `docs/design-reference/` | `foreman-design-file` and the human | UI changes |
| Milestone brief | `docs/milestones/Mnnn/Mnnn-CONTEXT.md` | `foreman-brief` | before the milestone starts |
| Unit state | `docs/milestones/Mnnn/STATE.md`, and the same for fix packs | the session | every status change |
| Fix pack | `docs/fixpacks/<id>/` | `foreman-fix` and the session | per fix pack |
| Learnings | `docs/learnings.md` | the session | when a reusable finding appears |
| Agent reports | `docs/agent-reports/<date>-<slug>.md` | the session | one per slice or run |
| Role reviews | `docs/role-reviews/` | `foreman-role-review` | per briefing or review |
| Changelog | `docs/changelog/vX.Y.Z.md` | `foreman-release` | at release only |

A document has exactly one owner. Nobody else rewrites it.

A fact lives in one document. Other documents link to it.

## Splitting large documents

Split a document when it grows past 5000 words. Count the words per file.

1. The overview keeps the name, for example `docs/requirements.md` or `docs/roadmap-<version>.md`. The parts go into a folder with the same name: `docs/requirements/01-<topic>.md` and `docs/roadmap-<version>/M001-<title>.md`.
2. Version and change history live only in the overview.

The overview has a table with this header:

| File | Content | Read when |
|---|---|---|
| `docs/requirements/01-<topic>.md` | User roles and permissions | the work touches who may do what |
| `docs/roadmap-<version>/M001-<title>.md` | Slices and tests of milestone M001 | the Agent works on M001 |

The conflict order says which document wins when two documents disagree. The foreman default is: requirements, design, roadmap, milestone brief, fix pack.

German projects may name the columns `Datei | Inhalt | Lesen bei`.

The Agent reads the overview first. It opens a part only when the "Read when" column says so.

## Stand line

Every overview has exactly one status line in this form:

`**Stand:** <date>, Version <N> (<last change>)`

The line names one version only, the current one, and the last change in a few words. The history goes below the line, in a section of its own, or stays in the git log.

Correct:

`**Stand:** 2026-11-21, Version 3 (added milestone M008)`

Wrong, because it lists several versions as a range:

`**Stand:** 2026-11-21, Versions 1 to 3 (added milestone M008)`

## Check

Run `node scripts/docs-check.mjs <file>` on an overview before you commit a changed overview. Exit code 0 means the file is ok. Exit code 1 means a rule is broken. Exit code 2 means the file cannot be read.

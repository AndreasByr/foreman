# Workflow

One unit (a milestone or a fix pack) goes through these steps. Each step names who does it and the file it leaves behind.

```
idea ─► roast ─► requirements ─► roadmap ─► design file ─► brief ─► slices ─► checks ─► batch ─► pretest ─► UAT ─► release
 human   chat      chat            chat        chat         chat    session    session   session   work run  human   session
                                                                     + workers
```

| # | Step | Who | Skill | Leaves |
|---|---|---|---|---|
| 1 | Roast the idea | chat | `foreman-roast` | `docs/requirements.md` |
| 2 | Plan versions and milestones | chat | `foreman-roadmap` | `docs/roadmap-0.N.0.md` |
| 3 | Design tokens and components | chat | `foreman-design-file` | `docs/design.md`, design boards |
| 4 | Set up the repo | chat + `install.sh` | `foreman-setup` | `.foreman.json`, `CLAUDE.md`, skills, tools |
| 5 | Write the brief | chat | `foreman-brief` (runs `foreman-role-review` in briefing mode first) | `docs/milestones/Mnnn/Mnnn-CONTEXT.md`, `STATE.md` = `planning` |
| 6 | Cut slices, delegate, accept | session + workers | `foreman-milestone`, `foreman-delegation` | commits on `batch/mNNN`, `STATE.md` |
| 7 | Merge in a window | session | `foreman-batch` | merge commit in `dev` or `main` |
| 8 | Pretest in the browser | work run | `foreman-pretest` + `foreman-role-review` | `docs/pretest/<unit>-round-N.md`, verdict, UAT list |
| 9 | Fix round | chat or work run | `foreman-fix`, `foreman-fixpack` | `docs/fixpacks/<id>/`, back to step 7 |
| 10 | UAT | human | – | approval: ticked list or comment "UAT M004 approved" (tracker none: `docs/uat/M004.md`) |
| 11 | Reflect | work run | `foreman-dispatch-run` | `docs/learnings.md` |
| 12 | Release | session | `foreman-release` (chat), `foreman-deploy` (repo) | tag, changelog |

## Status flow

```
planning → slice ⇄ rework → validation → batch-pr → awaiting-merge → pretest-waiting → pretest-running
                                                                                          │
                     fixpack ◄────────────── fix round ◄──────────────────────────────────┤
                                                                                          ├─► uat-ready → done (target dev)
                     needs-input ◄─── question / security finding / 3 failed rounds ──────┘            └► release-ready → done (target main, after release)
```

`STATE.md` holds the status and must be current before every report and PR; CI (`check-state-touched.mjs`) fails a PR that changes code or unit files without a `STATE.md` change. Everything else (tracker, UAT list) is a mirror. With tracker `none` the question, the answer (`docs/answers/<unit>.md`) and the UAT list (`docs/uat/<unit>.md`) are files in the repo.

The pretest verdict has three values: `fix-round` (findings about the unit, a fix pack follows), `uat-ready` (the UAT list holds only what needs a second real account or a product decision) and `intervention` (the unit cannot go on without the human; status `needs-input`).

## Intervention

A unit in `needs-input` shows as "Action Required" in the tracker, and the same run writes a comment: the question in one sentence, options A/B/C with their consequences, a recommendation, a link to the report and the way to answer (`Answer <unit>: ...`). A step without that comment is not finished; `node scripts/state-mirror.mjs --check` fails until it exists. Other units keep running.

## Without the autopilot

Steps 6 to 9 start when the human tells a Claude Code session: "Run milestone M004", "Run fix pack 2026-03-02-login", "Batch PR dev". The skills are the same; only the trigger differs.

## With the autopilot

A central dispatcher and one routine run the loop. The human only writes briefs in chat, tests, approves and decides the version number.

| Part | Runs | Model | Does |
|---|---|---|---|
| Dispatcher (`dispatcher/`) | every 10 minutes on your server (systemd timer or cron) | none | updates a read-only clone, runs `scripts/autopilot-check.sh`, starts up to 3 work runs (one per unit) by HTTP POST to the routine's fire URL, or by `fire_command` for other agents |
| Work run | API trigger only | strongest | one unit from start to a waiting state (`awaiting-merge`, `needs-input`, `uat-ready`, end of run); the pretest is a step of this run |

Task kinds the check prints: `pretest-run`, `pretest-result`, `input-received`, `uat-approved`, `batch`, `release-reminder`, `coding`. The first four depend on the tracker (itsaplan or Linear comments, or the files of tracker `none`). Locks last 3 hours, batch windows open every 4 hours (hours 3, 7, 11, 15, 19, 23 in the project's time zone, configurable).

Without a server: Plan B is an hourly Claude Code routine on the smallest model that runs the same check (`template/docs/routines/delegation.md`). Setup steps and prompts: `template/docs/routines/`, dispatcher: `dispatcher/README.md`.

## In a Claude Code project

A project has a project chat (coordinator) and one thread per work package. A thread holds the repo, so the hand-off to a second session falls away. The rules stay the same.

| Who | Does |
|---|---|
| Project chat | Triage (question, fix pack, milestone), opens a thread per package, passes UAT lists and PR links on |
| Thread | Writes the pack or brief files and runs `foreman-fixpack` or `foreman-milestone` itself, with the same gates |
| Human | Says "go" for PR, merge, release |

Models by class: each thread category (question, fixpack, milestone, brief, roadmap, architecture, bugRetry, release, docs) has a fixed class in `.foreman.json` `models.threads`, like the roles in the delegate's `config.toml`. Defaults: standard class at medium effort everywhere, strong class for brief, roadmap, architecture and a bug after a failed first fix; cheap class is never a thread default, bulk work goes to the delegate workers. The project chat reads the table from the project instructions and sets the class when it opens a thread.

The rules live in the project instructions. `foreman-project-mode` writes them (coordinator tool or paste) and refreshes them after an update, by comparing the version in the marker line `foreman-project-block`. Source of the text: `plugins/foreman/skills/foreman-project-mode/references/instruction-block.md`.

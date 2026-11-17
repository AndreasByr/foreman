# Workflow

One unit (a milestone or a fix pack) goes through these steps. Each step names who does it and the file it leaves behind.

```
idea ─► roast ─► requirements ─► roadmap ─► design file ─► brief ─► slices ─► checks ─► batch ─► pretest ─► UAT ─► release
 human   chat      chat            chat        chat         chat    session    session   session   pretest   human   session
                                                                     + workers                     run
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
| 8 | Pretest in the browser | pretest run | `foreman-pretest` + `foreman-role-review` | `docs/pretest/<unit>-round-N.md` (or Notion row), verdict |
| 9 | Fix round | chat or work run | `foreman-fix`, `foreman-fixpack` | `docs/fixpacks/<id>/`, back to step 7 |
| 10 | UAT | human | – | approval ("UAT M004 approved") |
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

`STATE.md` holds the status. Everything else (tracker, Notion, UAT list) is a mirror.

## Without the autopilot

Steps 6 to 9 start when the human tells a Claude Code session: "Run milestone M004", "Run fix pack 2026-03-02-login", "Batch PR dev". The skills are the same; only the trigger differs.

## With the autopilot

Three routines run the loop. The human only writes briefs in chat, tests, approves and decides the version number.

| Routine | Schedule | Model tier | Does |
|---|---|---|---|
| Delegation | hourly | smallest | runs `scripts/autopilot-check.sh`, fires up to 3 work runs by API, runs the mirror. Never works on a unit itself. |
| Work run | API trigger only | strongest | one unit from start to a waiting state (`awaiting-merge`, `needs-input`, end of run) |
| Pretest | hourly, on the human's computer | strongest | tests every waiting pretest round in the browser, writes the verdict |

Setup steps and prompts: `template/docs/routines/`.

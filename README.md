# foreman

You describe what you want. Claude plans it, cheaper models write the code, scripts check it, and you test the result before it ships. foreman sets this up in your repo and in your Claude chat, and it adapts to what you already have.

## What you get

- **Projects that keep moving without you.** A small script on your server checks every 10 minutes what is due and starts a Claude Code run for it: build the next slice, merge a batch, run the browser pretest, take over your answer. No model is involved in that check, so it costs no tokens.
- **Less to test yourself.** Each change goes through tests, a scope check, a review and an automated browser pretest (screenshots, accessibility, five review roles). You only get what needs a second real account or a product decision, as a checklist in your ticket.
- **Lower cost.** The session model plans and accepts. The coding runs on cheaper workers (Ollama Cloud, your ChatGPT plan through a gateway, or Claude itself as fallback). Subscriptions only, no API billing needed.
- **One place to look.** Every unit of work has a ticket. When the agent needs you, the ticket moves to "Action Required" with the question, the options and a recommendation.
- **A fast lane for demos.** For a prototype, foreman writes one prompt that a single Claude Code session runs from idea to working app, without servers, tickets or schedules.

## What you need

| You have | You can use |
|---|---|
| A coding agent (Claude Code recommended, OpenCode or similar works) | Quick projects and the repo workflow |
| + a GitHub account | Branch model, batch PRs, CI guards |
| + a server, VPS or always-on machine | The autopilot (central dispatcher) |
| + [itsaplan](https://github.com/croffasia/itsaplan) (self-hosted, recommended) or Linear | Tickets, dashboard, answers and UAT approvals by comment |
| + Ollama Cloud key and/or ChatGPT plan | Cheap workers through the delegation wrapper or a LiteLLM gateway |

None of the extras is required. Without a tracker, questions, answers and UAT checklists live as files in the repo. Without a server, you start runs yourself or use a scheduled Claude Code routine as a fallback. Claude Code is the recommendation because its routines can be started by API, which is what the dispatcher calls.

## Install

The setup skill asks what you know, what you need, what you have and how you work, then gives you the exact install command and a checklist with time estimates. Plan 10 minutes for the chat part and 15 to 60 minutes for the rest, depending on what you already run.

1. **Install the plugin (1 min).**
   - claude.ai or the desktop app: open the Plugins page, select **Add marketplace**, enter `AndreasByr/foreman`, then install **foreman**. The plugin is saved to your account, so its skills also work in Claude Code.
   - Claude Code: `/plugin marketplace add AndreasByr/foreman`, then `/plugin install foreman@foreman`.
   - Team or Enterprise: an owner can add the repository under Organization settings → Plugins & skills → Sync from GitHub.
   Updates arrive through the marketplace; there is nothing to upload. Projects are updated with `./install.sh --update <project>` (dry run with `--dry-run`), guided by `foreman-update`.
2. **Run the setup (10 min).** In a new chat, say "set up foreman". `foreman-setup` interviews you and recommends a profile: Quick, Repo or Autopilot.
3. **Install into your repo (2 min).** Clone this repository once (`git clone https://github.com/AndreasByr/foreman`), then run the command the setup gave you, for example:
   ```bash
   ./install.sh ../my-app --project my-app --name "My App" --agent claude-code \
     --modules tracker-itsaplan,delegate,autopilot,pretest \
     --recommended-skills all --skills-scope project
   ```
4. **Finish the checklist.** Typical items: create the tracker project, set environment variables, install the dispatcher on your server ([dispatcher/README.md](dispatcher/README.md)), create the work-run routine.

Starting a new project later: say "new project" (`foreman-project`). It asks whether a quick project fits and recommends one or the other.

## How it works

```
you ──► chat ──► work run (Claude Code) ──► workers ──► checks ──► batch PR ──► pretest ──► you (UAT) ──► release
        idea,    slices, task files,         write code  tests,     every 4 h     browser,     checklist     Friday
        roadmap, acceptance                  (no git)    scope,                   axe, 5 roles in ticket
        briefs                                           review
                     ▲
                     └── central dispatcher (cron, every 10 min, no LLM)
```

- `STATE.md` is the single source of truth for each unit. A script mirrors it to the tracker; models never write tickets directly.
- Hand-off happens through files in the repo: briefs, task files, pretest results with a `Verdict:` line, reports.
- Checks are mechanical first: scope, tests, a test that was red before the fix, then a review. Guard rails are code: hooks and git hooks block pushes to `main`/`prod`, force pushes and remote deletions.
- The fixed context stays small: `CLAUDE.md` under 2 KB, details load as skills on demand.

Principles: [docs/PRINCIPLES.md](docs/PRINCIPLES.md). Lifecycle: [docs/WORKFLOW.md](docs/WORKFLOW.md). Lessons from real use: [docs/learnings.md](docs/learnings.md).

## Chat skills

| Skill | Use it to |
|---|---|
| `foreman-setup` | set up foreman for your situation, step by step |
| `foreman-project` | start a new project, full or quick |
| `foreman-project-mode` | write the foreman rules into a Claude Code project's instructions; also the refresh after an update |
| `foreman-update` | bring an installed project to the current version; writes the order and the checklist |
| `foreman-quick` | write the one-shot prompt for a demo or prototype |
| `foreman-roast` | challenge an idea and end with `docs/requirements.md` |
| `foreman-roadmap` | versions, milestones, slices, human test flows |
| `foreman-design-file` | token-based `docs/design.md` and design boards |
| `foreman-brief` | milestone briefs and the situation report |
| `foreman-fix` | bugs and fix packs (one run for many findings) |
| `foreman-pretest` | a manual browser test from the chat |
| `foreman-role-review` | UX, UI, bugs, pentest and accessibility review |
| `foreman-release` | release with monitoring until the deploy is green |
| `foreman-orchestrator` | save tokens in chat by delegating big mechanical work |

## Modules

| Module | Adds |
|---|---|
| `tracker-itsaplan` | ticket mirror, "Action Required" column, answers and UAT approvals by comment (recommended) |
| `tracker-linear` | the same for Linear, one ticket per unit |
| `delegate` | worker roles (research, execution, testing …) mapped to models in one file |
| `gateway` | LiteLLM example config: Ollama plus ChatGPT plan, Claude subscription as fallback |
| `autopilot` | check script for the central dispatcher, work-run routine, batch windows |
| `pretest` | browser pretest inside the work run: Playwright, test login, axe, verdict file |

For itsaplan, new projects are created from the template `itsaplan-project-template`; the one manual step is adding the bot account as a member.

With module `autopilot`, the check starts the batch PR in the merge window: the local hours in `context.timeZone` listed in `autopilot.batchHours` (default 3, 7, 11, 15, 19, 23). Outside the window it starts the batch after the wait time in `autopilot.waitHours` (default 4 hours). `main` merges by itself only with `autopilot.mainAutoMerge: true`, which defaults to `false`; otherwise `main` waits for your "Batch PR main". `foreman-project` asks these values per project. The installer takes them as `--tz`, `--batch-hours`, `--wait-hours` and `--main-auto-merge yes|no`. Without these options the installer writes `UTC` and no `autopilot` block, so the defaults apply.

Details: [docs/MODULES.md](docs/MODULES.md). Agents other than Claude Code: `--agent opencode` or `--agent other` writes an `AGENTS.md`; see [docs/MODULES.md](docs/MODULES.md).

## Recommended skills

The setup offers to install these, globally or only for one project, and asks first. foreman works without them.

| Skill | What it does | Install |
|---|---|---|
| [`/no-ai-slop`](https://github.com/petergyang/no-ai-slop) | Edits or audits prose so it keeps your voice and loses AI phrasing. | `npx skills add petergyang/no-ai-slop --skill no-ai-slop --global --yes` |
| [`/humanizer`](https://github.com/blader/humanizer) | Rewrites AI-sounding text using Wikipedia's "Signs of AI writing". | `git clone https://github.com/blader/humanizer.git ~/.claude/skills/humanizer` |
| [`/hallmark`](https://github.com/nutlope/hallmark) | Design rules and page structure for new pages and landing pages. Your `docs/design.md` takes precedence. | `npx skills add nutlope/hallmark -g` |
| [`/better-*`](https://github.com/jakubkrehel/skills) | Interface skills: writing, interface, UI, layout, typography, colors, accessibility. | `npx skills add jakubkrehel/skills` |

For one project only, drop the global flag and run the command inside the repo. The list lives in [skills.recommended.json](skills.recommended.json). All four are MIT licensed.

## License

MIT, see [LICENSE](LICENSE).

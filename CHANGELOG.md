# Changelog

## 0.2.0 (2026-11-20)

- **Central dispatcher** (`dispatcher/`): a cron or systemd job checks every project every 10 minutes with `scripts/autopilot-check.sh` and starts work runs by API. No model in the loop, no tokens. The hourly delegation routine is now Plan B for people without a server.
- **Pretest inside the work run**: headless Playwright with a test login, screenshots against the approved boards, axe (WCAG 2.2 AA), five review roles, result file with a `Verdict:` line. No computer-bound routine any more.
- **Tracker modules**: `tracker-itsaplan` (recommended), `tracker-linear`, or none. Without a tracker, answers and UAT approvals live in `docs/answers/` and `docs/uat/`.
- **Intervention made visible**: tracker column "Action Required" plus a mandatory comment with question, options, recommendation and how to answer.
- **UAT checklists** in the ticket for every unit that is ready for UAT.
- **Gateway module**: LiteLLM example for Ollama plus a ChatGPT plan, Claude subscription as fallback.
- **Agent-neutral**: `--agent opencode|other` writes `AGENTS.md`; a git pre-push guard works without Claude hooks.
- **Recommended skills** (`skills.recommended.json`): installed only after confirmation, globally or per project.
- **Claude plugin and marketplace**: install with `/plugin marketplace add AndreasByr/foreman` or "Add marketplace" in claude.ai; no zip uploads.
- **New chat skills**: `foreman-setup` (guided interview with time estimates), `foreman-project` (full or quick), `foreman-quick` (one-shot prompt for demos).
- **Removed**: Notion module.

## 0.1.0 (2026-11-17)

First release.

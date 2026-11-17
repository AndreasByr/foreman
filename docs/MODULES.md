# Modules

The core needs GitHub, Claude Code and a claude.ai account with skills. Everything else is a module. Turn modules on with `install.sh --modules …`; they are recorded in `.foreman.json`, and skills read that file.

| Module | Adds | Needs |
|---|---|---|
| (core) | chat skills, repo skills, delegation wrapper with Claude workers, push guard, CI checks, batch branches, STATE.md | GitHub, Claude Code |
| `ollama` | worker roles on Ollama Cloud models (Anthropic-compatible endpoint) | `OLLAMA_API_KEY` in the cloud environment, network access to `ollama.com` |
| `linear` | tracker mirror: one ticket per unit (no sub-issues, slices as a checklist), status and phase label set by `scripts/state-mirror.mjs`, done tickets archived after 7 days | `LINEAR_API_KEY`, team with the statuses `Todo`, `In Progress`, `Wait for Merge`, `Testing`, `In Review`, `Done` |
| `notion` | pretest handoff rows and a UAT list mirrored from `STATE.md` | `NOTION_TOKEN`, a database with columns Name, Unit, Round, Phase, Kind |
| `autopilot` | three routines (delegation, work run, pretest), `scripts/autopilot-check.sh`, `foreman-dispatch-run` | Claude Code routines, a cloud environment with the repo |

## Choosing

- Solo, no budget for extra tools: core only. You trigger runs by hand.
- Claude quota is tight: add `ollama`. Cheap roles move to Ollama, Claude keeps planning and validation.
- You want to see progress on your phone: add `linear` or `notion`. Both are mirrors; nothing breaks when they are down or at a plan limit.
- You want it to run while you sleep: add `autopilot`.

## Model distribution

`tools/delegate/config.toml` ships with a Claude-only preset and a commented Ollama preset. Model IDs are placeholders until setup fills them. Before filling them, check the current model lists (Anthropic and, with `ollama`, Ollama Cloud) for newer versions of the same family. Use exact IDs, never aliases that change silently, and never `opusplan`.

| Role | Claude-only preset | Ollama preset |
|---|---|---|
| research | small | Ollama (read only) |
| planning, validation | large (read only) | large Claude (read only) |
| execution | mid | mid Claude |
| execution_simple | small | Ollama |
| completion, subagent | small | Ollama |
| fallback on provider outage | – | small Claude |

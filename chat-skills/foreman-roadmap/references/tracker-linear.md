# Module linear: tracker project per version

Applies only when the project uses the `linear` module (`.foreman.json`) or the human opts in. Without the module, the roadmap header says `**Tracker:** none` and this file is not needed.

## Rules

- Linear is a mirror. `STATE.md` of each unit is the source of truth. Only `scripts/state-mirror.mjs` writes tracker statuses and creates tickets. A model never sets a status or creates a ticket by hand.
- One tracker project per version roadmap. One main ticket per milestone. Fix packs get their tickets from the mirror script too.

## Steps

1. **Find out if the project uses Linear**, silently: `CLAUDE.md` or `docs/release-path.md` mentions it, the roadmap header has a `**Tracker:**` line, `.foreman.json` lists the module, or earlier roadmaps have a tracker project. A line `**Tracker:** none` or an earlier refusal means: set nothing up and do not ask again.
2. **Project uses Linear:** add the version to the mirror config (see `scripts/state-mirror.mjs --help` for the file and fields), without asking:
   - tracker project `<PROJECT_NAME> 0.N.0 - <short release name> (<target branch>)` in the project's team; description: release goal, list of milestones with strand, path of the roadmap file. Target branch as earlier versions use it (usually `dev`),
   - version label `v0.N.0 - <target branch>` in the label group "Version" (create the group if missing),
   - one entry per milestone (id, title, strand) so the script creates the main ticket with the labels Version, Kind "milestone" and the status label when the milestone starts.
   Then run the mirror script once to create the project and tickets, and put `**Tracker:** <project name> (<link>)` into the roadmap header.
   Patch releases: the project `<PROJECT_NAME> 0.N.x - Fixes (main)` appears at the release of `0.N.0`, not with the roadmap.
3. **Project does not use Linear:** ask exactly one question, with a recommendation where sensible:
   - **Roadmap only:** no tracker. Header gets `**Tracker:** none`.
   - **Tracker project:** version project and label via the mirror config, no scheduled routines.
   - **Full workflow:** hand over to `foreman-setup` (modules linear, notion, autopilot).
   The answer holds for the project permanently (header line, `CLAUDE.md`), so the next roadmap does not ask again.
4. **No Linear access in the session:** deliver the roadmap anyway and say which project, label and mirror config entries still have to be created.

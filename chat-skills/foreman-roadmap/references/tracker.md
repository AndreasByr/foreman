# Tracker: itsaplan, linear or none

The tracker is a mirror. `STATE.md` of each unit is the source of truth. Only the mirror script (`scripts/state-mirror.mjs` and the itsaplan scripts next to it) writes tracker tickets and statuses. A model never sets a status or creates a ticket by hand. One main ticket per milestone; fix packs get their tickets from the mirror too.

## Which tracker

Read `.foreman.json` modules: `tracker-itsaplan`, `tracker-linear`, or neither (= `none`). The roadmap header records it: `**Tracker:** itsaplan (<link>) | linear (<link>) | none`. A recorded `none` or an earlier refusal means: set nothing up and do not ask again.

No module and no record: ask exactly one question, with a recommendation:

- **itsaplan** (strongly recommended for Autopilot): self-hosted, status columns including Action Required, comments, UAT checklists. Setup is `foreman-setup`.
- **linear:** optional, an existing Linear team.
- **none:** only `STATE.md` and files. Fully supported: answers to questions are `docs/answers/<unit>.md` with the line `Answer <unit>: ...`; UAT approval is the line `UAT <unit> approved` in `docs/uat/<unit>.md`, which also holds the checklist.

Record the answer in the header and in `CLAUDE.md`, so the next roadmap does not ask again.

## itsaplan

1. Add the version to the mirror config (see the script's `--help` for file and fields), without asking:
   - the product project in itsaplan (one per product; create it once),
   - label groups: Version (`v0.N.0 · dev`, `v0.N.x · main`), Kind (`Milestone`, `Fix pack`), Phase (`AP: <phase>`, one per unit status),
   - one entry per milestone (id, title, strand) so the script creates the main ticket with the labels and the phase when the milestone starts.
2. Statuses in the project: `Backlog`, `Todo`, `In Progress`, `Action Required` (alias "Intervention needed"), `Wait for Merge`, `Testing`, `In Review`, `Done`.
3. Bot account: the mirror and the dispatcher's check use their own account and API key. Comments by that account never count as the human's answer or approval.
4. A view "UAT ready" filtered by the label `AP: UAT ready` lists every open UAT.
5. Run `node scripts/state-mirror.mjs --dry-run` once, then without the flag. Put `**Tracker:** itsaplan (<link>)` into the roadmap header.

## linear

1. Add the version to the mirror config (see `scripts/state-mirror.mjs --help`), without asking:
   - project `<PROJECT_NAME> 0.N.0 - <short release name> (<target branch>)` in the project's team; description: release goal, milestones with strand, roadmap path,
   - version label `v0.N.0 - <target branch>` in the label group "Version" (create the group if missing),
   - one entry per milestone (id, title, strand).
2. One ticket per unit, no sub-issues (free plans count every issue). Slices, pretest rounds and fix items are a checklist in the description.
3. Statuses: `Backlog`, `Todo`, `In Progress`, `Wait for Merge`, `Testing`, `In Review`, `Done`, `Canceled`. New tickets are created with `Todo`. The Linear tool cannot create statuses; tell the human the missing ones (Team, Settings, Workflow).
4. Run the mirror script once, then put `**Tracker:** linear (<link>)` into the roadmap header. Patch releases: the project `<PROJECT_NAME> 0.N.x - Fixes (main)` appears at the release of `0.N.0`.

## Status mapping (unit status to ticket status)

| Unit status | Ticket status |
|---|---|
| `planning`, `slice`, `rework`, `validation`, `batch-pr`, `fixpack` | In Progress |
| `needs-input` | Action Required (itsaplan) or In Progress with the phase label (linear) |
| `awaiting-merge` | Wait for Merge |
| `pretest-waiting`, `pretest-running` | Testing |
| `uat-ready`, `release-ready` | In Review |
| `done` | Done, phase label removed |

## Intervention comment

A unit that goes to `needs-input` gets, in the same run, a comment with: the question in one sentence, options A/B/C with consequences, a recommendation, a link to the report, and the way to answer (`Answer <unit>: ...`). The run writes these parts into the section `## Open question` of the unit's `STATE.md`; the mirror posts them as the comment, and `node scripts/state-mirror.mjs --check` fails while the comment is missing. Without that comment the step counts as not finished. With tracker `none` the section in `STATE.md` is the question.

## No access in the session

Deliver the roadmap anyway and list which project, labels and mirror config entries still have to be created.

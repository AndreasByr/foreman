# Situation report (call without a milestone number)

The human types only the command. You find out what runs, what is done and what can start next, also in parallel.

## 1. Find the running roadmap

One roadmap file per minor version. The lowest version with open milestones counts. Read: the section on tracks, the dependency overview ("blocked by" / "blocks"), and the status line of each milestone. Milestones of the next roadmap start only after the release of the current one reached `main`.

## 2. Collect the state of each milestone

From every available source:

- **Repo:** `docs/milestones/Mnnn/` (brief present? `STATE.md` with slice status, `VALIDATION.md` with verdict), the newest `docs/agent-reports/`, `docs/fixpacks/*/STATE.md`, whether `batch/mNNN` exists on origin and whether it is merged into `dev`.
- **Project documents:** browser test reports, fix packs, roadmap status.
- **Chat context:** search the current chat and the recent chats of this project for UAT approvals, open findings, decisions and deferrals not yet in repo or roadmap. Name each finding with its chat and date.

## 3. Classify

| Phase | Recognised by | Next order |
|---|---|---|
| blocked | a predecessor from "blocked by" has no UAT approval | none, wait |
| ready | all predecessors approved, no brief yet | write the brief (with design first), start |
| planned / in progress | `STATE.md` with open slices | only if the chain broke: "Run milestone Mnnn" |
| needs input | `Status: needs-input` or report says so | state the question from the report, get the decision, then continue |
| validation / pretest running | autopilot chain active | none, runs by itself |
| UAT | `Status: uat-ready` | waits for the human |
| done | UAT approved | none |

## 4. Show the report

Short, as a table: per track the milestones with phase and next order. Below it:

- **Start now (parallel):** all ready milestones and broken chains that share no open predecessor. One dispatch per milestone.
- **Waiting for you:** UATs, open `needs-input` questions, boards awaiting approval.
- **Next:** which milestones become ready after the next approvals.
- Contradictions between sources (chat says approved, roadmap says open): name them, do not decide silently.

## 5. Prepare

For every ready milestone: role review in briefing mode, then the brief (questions only where requirements, roadmap, design and chat give nothing), then boards. Show everything together for approval, then hand off.

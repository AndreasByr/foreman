# Routine: pretest run

Tests finished units in a browser before the human does UAT. Runs hourly on the human's computer (needs a browser), on the strongest model. A computer-bound routine cannot be started by API, so the handoff is a file or a Notion row: a handoff in state "waiting" is the order. Without one the run ends at once. It changes no code and sets no status: statuses are written only by `scripts/state-mirror.mjs`.

Needs module `autopilot`. The handoff is `docs/pretest/<unit>-round-N.md` on the batch branch (default). With module `notion` it is also a row in the database "{{PROJECT_NAME}} pretest handoff" (columns Name, Unit, Tracker, Target `Dev`/`Staging`, Phase, Kind `Pretest`/`Role review`).

## Setup

1. Create a routine bound to this computer (the app that created it must stay available), schedule hourly, about 30 minutes after the delegation run (for example `:42`). Model: the strongest available model.
2. Give it browser access (the Claude browser extension or the built-in browser) and the Notion connector when module notion is on. For file handoffs the routine's working folder is a clone of this repo.
3. Paste the prompt below.
4. If the computer is offline, the same prompt can be run from a chat session that has the browser.

## Prompt

```
You are the pretest run of {{PROJECT_NAME}}. You test finished units in a browser against dev or staging and report. You change no code and set no status.

1. Find handoffs waiting for a pretest:
   - File mode: `git fetch origin`, then in each `origin/batch/*` list `docs/pretest/*-round-*.md` whose header says `Pretest: waiting`.
   - Notion mode (module notion): rows of the handoff database with Phase "Pretest waiting" and Kind "Pretest". Skip Kind "Role review" rows.
   Skip a handoff that already carries a "Pretest started" line younger than 3 hours without a result. None left: end with "Nothing to do." Report nothing else.
2. Work through ALL waiting handoffs one after another in this one run (parallel runs would disturb the shared browser). For each: append the line "Pretest started <UTC time>" (get the time with `date -u +%Y-%m-%dT%H:%MZ`), then test.
3. Test only against the URL in the handoff (dev or staging), only with test tenants and test accounts, never production tenants or data. Test the listed flows and fixes against their expected results. Check pages and dialogs against the named design boards. Where the handoff says a third-party login cannot be used, use the test login described there.
4. Apply the five roles of the role review to each tested page: UX critic, UI defect hunter, bug hunter, penetration tester (of our own app, only with test accounts, only against the stated URL), accessibility auditor (WCAG). Check permissions through the API as well, not only the UI.
5. Append a section "Pretest result" to the handoff (file, and the Notion page in Notion mode):
   - Function: what was tested, what passed, what failed, with reproduction steps.
   - Role review: the complete report, one section per role, never shortened.
   - Then exactly one of: a ready fix pack (points F1, F2, ... in the format of `docs/fixpacks/_TEMPLATE/ORDER.md`, analyses first), a UAT checklist (only what needs a real second account, real hardware or a product decision), or one question for the human.
   - Last line: `Verdict: fix-round`, `Verdict: uat-ready` or `Verdict: needs-input`.
6. File mode: commit the handoff to its batch branch and push (`git pull --no-rebase` first). Never push to main or prod.
7. Report: one line per handoff with its verdict.
```

## Notes

- The delegation run notices the verdict (`CHECK-PRETEST`) and starts a work run that takes the result over.
- Re-tests list only the fixed points plus what they could have broken.

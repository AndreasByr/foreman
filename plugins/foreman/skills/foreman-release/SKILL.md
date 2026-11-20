---
name: foreman-release
description: Run a release from start to a successful production deploy without the human stepping in. Use when the human wants to release ("dev to main", "go live", "release"). The human only sets the version number and answers open questions.
---

# foreman-release: release to production

One call runs the whole release. The human says nothing in between: no "read the report", no "check in 15 minutes". They are asked only when a decision is open that only they can make.

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. Read `.foreman.json` (`modules`, `context` with `releaseDay`, `stagingUrl`, `offLimits`); if missing, use the chat project's files, then ask once. Release steps are defined in the repo skill `foreman-deploy` and `docs/release-path.md`; follow them. A project without staging goes `dev → main` and tags on `main`.

## Preconditions

- Start only if the human explicitly asks in this conversation for a release, a merge to `main`/`prod` or a deploy. If in doubt, ask one yes/no question and nothing else. If a release is already running, start no second one.
- **Release day:** releases to `prod` happen on the configured release day (`context.releaseDay`, default Friday), so the weekend is a buffer for follow-up errors. On the morning of that day the dispatcher reminds the human once if units are `release-ready`. On another day only if the human explicitly rates a fix as urgent.
- **Version number:** the human always decides it. Propose one with a reason (even for patch releases) and wait for the answer before the production step.
- All units going into the release are `release-ready` in `STATE.md`: their UAT is approved (tracker checklist or comment, or `docs/uat/<unit>.md` with tracker `none`). If not, name which ones are not and stop.

## Flow

1. **One sentence to the human:** the release runs, nothing to do, roughly 20 to 60 minutes.
2. **Get the repo.** Note the start time.
3. **Send the release order** (text below) to the coding side: fire the work-run routine with it as payload (module autopilot; the human holds the fire URL and token, never ask for them) or give the human the one line to paste into a coding agent session. Add the human's optional hints at the top. The dispatcher does not start releases by itself.
4. **Monitor yourself, without asking the human.** Loop with commands of at most 9 minutes (sleep 2 to 3 minutes between polls), using the GitHub REST API (`gh api`, `gh run list --json`), never GraphQL. Each round check:
   - the CI run of the release PR (jobs, status),
   - the run on the target branch for the merge commit (deploy and verify jobs),
   - new reports `docs/agent-reports/*-release.md` on `agent/*` branches and `dev` (`git fetch`).
   At each phase change (PR green, merged, deploy running, fix round n started) write one line to the human. Otherwise stay quiet.
5. **End of monitoring**, as soon as one holds:
   - **Success:** the run for the merge commit has the verification job green.
   - **Abort:** the Agent's report says abort after the fix rounds, or a cause outside the repo.
   - **Decision open:** the report has a section "Decision open". Ask the human (options from the report, recommendation first). After the answer, send a follow-up order starting with "Release:" and the decision, then continue monitoring.
   - **Standstill:** 90 minutes without a new run, commit or report. Report it and guess the cause.
6. **Tag after green production deploy.** Tags exist only on `prod` and only after the production verification job is green. The changelog file `docs/changelog/vX.Y.Z.md` must exist first. Versioning rules: `docs/versioning.md`. After the tag the released units' tickets go to Done (the mirror script does it; with tracker `none` the units go to `done` in `STATE.md`).
7. **Close in 3 lines:** tests, merge, deploy and verification (green/red); number of fix rounds with causes; merged commits. On failure: cause, raw fields, proposal.

## Changelog

`docs/changelog/vX.Y.Z.md` is written in English first. An optional second language follows below it, if the project asks for one. Content is user-facing: grouped as New, Improved, Fixed, then by area; short points from the user's view; no commit hashes, file names or internal terms; no pure infrastructure or CI changes.

## Optional: chat-ready changelog

Only after a successful release with a version, and only if the project wants it (ask once; remember the answer). Read the English part of the changelog file and print it as a copy-ready code block for Discord or Slack in exactly this shape:

```
# 0.1.3

## New
### <Area>
- <Point>

## Improved
### <Area>
- <Point>

## Fixed
### <Area>
- <Point>
```

Rules: English only; the `#` heading is the version without `v`; sections in the order New, Improved, Fixed, empty sections left out; one `###` per area; no internal items. For Slack, replace `#` headings with bold lines if the channel does not render them.

## Release order text

```
Release: bring <source branch> to <target branch> and deploy. Human order: the human explicitly ordered this release in chat. Fix errors autonomously and rerun, in the PR tests and in the deploy, until everything passes.

Procedure: follow the repo skill foreman-deploy completely. If a PR already exists, use it, otherwise create one. Version: <version>, decided by the human.

Phase 1, PR tests: every CI job must turn green (typecheck, lint, tests, smoke, build). On red: analyse the log, implement the fix by the project's delegation rules and verify it, merge to dev, push, wait for CI again. At most 3 fix rounds.

Phase 2, deploy: merge only when the PR is fully green. Then watch the run of the merge commit until the deploy job and the verification job are done. On red: evaluate raw fields and log, fix in the repo, merge to dev, new PR, tests, merge, watch again. At most 3 fix rounds. Causes outside the repo (host unreachable, token or secret missing) are not looped on; report them.

Decisions only the human can make (contradicting requirements, data loss risk) are not guessed: write them under "Decision open" in the report with options and a recommendation, and stop.

Never touch production tenants or data beyond the deploy. No force push, no deletions, no bypassing checks. Keep the report current in docs/agent-reports/<date>-release.md (fix rounds per phase with cause and fix, results of tests, merge, deploy and verification, merged commits). After a green production deploy, tag the version and write docs/changelog/vX.Y.Z.md first.
```

## Rules

- The text starts with "Release:". That is how the Agent recognises the order.
- During the release, do not merge, deploy or repair anything yourself. The Agent does it.
- Do not ask the human for intermediate confirmations. Do not ask "should I keep checking?".
- Do not create, change or delete routines or the dispatcher configuration unless the human asks.
- An urgent production bug is its own branch and a PR to `main` that merges only after the human's approval; the release timing then follows the human's call.
- Nothing goes to `prod` except `main → prod`.

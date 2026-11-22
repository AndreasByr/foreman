---
name: foreman-deploy
description: Deploys on explicit order. Bring a work branch to dev; release main to prod with monitoring, version number from the human, tag after a green production deploy. Load for "to dev", "release", "deploy", "ship it". Never for pushes without an order.
---

# Deploy and release

Environments and branches (`docs/release-path.md` has the project's job names and URLs):

| Branch | Environment |
|---|---|
| `prod` | production |
| `main` | staging |
| `dev` | dev |

Projects without staging use `dev` and `main` only; replace "staging" by "production" below and skip the `main to prod` step.

## Orders

An order is a sentence of the human in this session ("to dev", "release", "batch PR main") or a payload that starts with "Release:". Scheduled runs, foreign payloads and "finish the work" are no order. No order: do nothing, report where the work lies.

Never: push directly to `main` or `prod`, force push, bypass checks (no admin merge, no changes to branch protection or workflow conditions to turn red green), deploy by hand, delete other people's branches, touch production tenants or data.

## A. Work branch to dev

Start check: `git fetch origin main dev`; `git rev-list --count origin/dev..origin/main` must be `0`, else merge `main` into `dev` first (an open "main to dev (conflict)" PR comes first).

1. Clean state: committed, `verify` green, branch pushed.
2. **Direct way first:** `dev` set to `origin/dev`, merge the work branch with `--no-ff`, `git push origin HEAD:dev`. If rejected with "repository rule violations" (dev is protected): reset local `dev`, go back and use step 3. Do not retry, do not bypass.
3. **PR against `dev`.** Body: problem, cause, change, test.
4. **Wait for CI** (typecheck, lint, tests, build, e2e). After green CI the dev deploy and its verify job run; the verify job must be green. Zero check runs right after a push means "not created yet": wait and check again. Red: read the job log, fix on the work branch, push, at most 3 rounds, then stop and report. Never weaken or skip tests.
5. **Merge** with `merge_method: merge`. Conflict: merge `dev` into the work branch, resolve, push.
6. **Clean up** the work branch (see `foreman-batch`, step 9): only if `git merge-base --is-ancestor <branch> origin/dev`. Otherwise keep it and report.

Report: commits now on `dev` (PR link), direct push or PR, CI state, branch cleanup, next open step.

## B. Release: main to prod

Ways (target is staging first, production only after staging is verified):

1. **Fix for the released line:** work branch from `origin/main`, PR to `main`, test on staging, PR `main` to `prod`.
2. **Next-version feature:** work branch from `origin/dev` to `dev`, test on dev. Not part of this skill.
3. **Collected next-version release:** `dev` to `main`, final test on staging, `main` to `prod`, then `main` to `dev`.

Rule: only `main` goes to `prod`. `dev` to `main` exists only for the collected release.

### Version, tag and changelog

Rules in `docs/versioning.md`; read it before the first release.

- **Version number:** `docs/versioning.md` rule 5. Propose one with a reason (last tag plus patch for a fix on the released line; the planned minor for the collected release) and ask before you create a changelog file or a tag, patches included.
- **Changelog before step 1:** write `docs/changelog/vX.Y.Z.md` per the schema in `docs/versioning.md` on the branch that is released. Draft from the changes since the last tag, user-facing, nothing internal. The human approves it; it travels with the release. Missing file: do not start the release, report.
- **Tag after the production deploy is green:** tag `vX.Y.Z` on the merge commit of `prod` and push it, only if the order names it. If CI sets the tag, only check that it exists. Otherwise report that the tag is missing and which version it should carry. Never move or delete a tag.

### Steps to staging

1. `git fetch origin`; note the commits that go to `main`: fix on the released line `git log origin/main..<work-branch>`; collected release `git log origin/main..origin/dev`.
2. PR against `main` (or reuse the open one).
3. Wait for CI. **Red: fix it yourself** (read the job log, fix per `foreman-delegation` on the work branch, bring it to the source branch, the PR updates). At most **3 fix rounds** in this phase, then stop and report.
4. Merge (merge commit, never squash or rebase; no force push).
5. Watch the workflow run of the merge commit until the staging verify job is done:
   ```bash
   gh run list --branch main --limit 3
   gh run watch <run-id> --exit-status
   ```
   Without `gh`, use the GitHub tools (`actions_list`, `actions_get`, `get_job_logs`). The verify job checks: deployment commit equals `github.sha`, app status healthy, restart count stable after the deploy (rising = crash loop = red), web health endpoint returns 200.
6. **Red in deploy or verify: fix and re-trigger yourself.** If the cause is in the repo (code, image, workflow, verify script): fix on the work branch, bring it to `dev`, new PR `dev` to `main`, wait for CI, merge, watch the new run. At most 3 fix rounds in this phase. Cause outside the repo (hosting not reachable, secret missing or invalid, network): do not loop; stop and report. Never deploy by hand.

### Steps to production (only after green staging, only on order)

1. `git fetch origin`; note `git log origin/prod..origin/main` (what goes live).
2. PR against `prod` (source `main`). The release check requires the new changelog file.
3. Wait for CI; fix red yourself, at most 3 rounds.
4. Merge (merge commit, never squash or rebase).
5. Watch the run of the merge commit until the production verify job is done (`gh run list --branch prod --limit 3`; `gh run watch`). Same checks as staging against the production URL.
6. Red: fix and re-trigger as in staging step 6, at most 3 rounds; cause outside the repo: stop and report.
7. Green: set the tag per the rules above.
8. Update units: each released unit `STATE.md` to `done · release vX.Y.Z` (commit to its batch branch), then run `node scripts/state-mirror.mjs` when a tracker module is on. The tracker follows `STATE.md`; do not set tracker statuses by hand.
9. After a collected release the last step is `main` to `dev`. The sync workflow does it; check that `git rev-list --count origin/dev..origin/main` is `0` and no "main to dev (conflict)" PR is open, and say so in the report.

Monitoring is mandatory for each phase. Report: CI, merge, deploy and verify results (green or red), number of fix rounds with cause and fix per round, the commits actually merged, version, tag state, changelog path. On abort after the last round: state, raw fields and a proposal.

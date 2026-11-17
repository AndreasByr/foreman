# Release path

For the owner: how a change gets to production, the CI jobs involved, and the check that the running version is the one that was deployed. Rules: `CLAUDE.md`, `.claude/skills/foreman-deploy/SKILL.md`; version numbers, tags and changelog: `docs/versioning.md`.

## In short

Production lives on the protected branch `prod`. A deliberate merge `main` to `prod` by pull request deploys it, not a git tag. The tag `vX.Y.Z` proves that a state ran on production and is set only after the production verify job is green.

## Branches

| Branch | Environment | URL | Content |
|---|---|---|---|
| `prod` | production | `<production-url>` | released state |
| `main` | staging | `<staging-url>` | released line plus fixes, tested on staging |
| `dev` | dev | `<dev-url>` | next version; always contains all fixes from `main` |

Three ways:

1. **Fix for the released line:** work branch from `origin/main`, PR to `main`, test on staging, PR `main` to `prod`.
2. **Next-version feature:** work branch from `origin/dev`, to `dev`, test on dev.
3. **Collected next-version release:** `dev` to `main`, final test on staging, `main` to `prod`, then `main` to `dev`.

Rule: only `main` goes to `prod`. `dev` to `main` exists only for the collected release. Small fixes arrive through batch PRs (`foreman-batch`).

A project without staging has `main` (production) and `dev` only; the installer was run with `--no-staging`.

**Sync:** the workflow `sync-main-to-dev` merges every push to `main` into `dev`. Without a conflict it pushes to `dev` directly and CI and the dev deploy follow. With a conflict `dev` stays unchanged and the workflow opens (or updates) a PR "main to dev (conflict)", which comes before new work on `dev`.

## CI jobs

Replace with the project's real job names.

| Job | Runs on | Purpose |
|---|---|---|
| `typecheck`, `lint`, `test`, `build` | every push/PR to `dev`, `main`, `prod` | quality gates |
| `foreman-guards` | every push/PR | guard hook tests, forbidden settings |
| `deploy` + `verify-deploy` | push to `main` | deploy and verify staging |
| `deploy-dev` + `verify-deploy-dev` | push to `dev` | deploy and verify dev |
| `release-check` | PR to `prod`, push to `prod` | stops a release without a new changelog file |
| `deploy-prod` + `verify-deploy-prod` | push to `prod`, needs `release-check` | deploy and verify production |
| `tag-release` | push to `prod`, after green verify | tags the production commit |

## Verifying the running state

Each verify job checks after the deploy:

- the commit of the deployment record equals `github.sha`;
- the app status is healthy (a state without health check counts as healthy; unhealthy or starting is awaited for a limited time, then red);
- the restart count stays stable; a rising count means a crash loop and is red at once;
- the web health endpoint `<url>/api/health` returns 200 with `{"status":"ok"}`.

Manual check after a release: `curl -fsS <production-url>/api/health`.

## Version, tag, changelog

Each production release brings exactly one new file `docs/changelog/vX.Y.Z.md`. The human sets the number. `release-check` stops when the file is missing, several new changelog files are in the release, or the tag exists. `tag-release` sets an annotated tag on the production commit after a green verify; it never moves or deletes a tag.

## Prerequisites (names only)

Repository secrets for each environment: deploy hook and token for staging, dev and production; credentials of the sync app (needs write access to contents, pull requests and workflows). Repository variables with the three URLs. Tags on `prod` are set with the workflow token (`contents: write`); a tag ruleset must allow it.

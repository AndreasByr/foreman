Fix pack: 2026-11-23-local-overlay

Target: dev
Milestone: -
Batch-branch: fix/local-overlay-gateway-env
Urgent: no
Fix-pack: 2026-11-23-local-overlay

Replaces the closed PR #38, which came from another session on an old base without a `STATE.md`. Same content, built as a proper fix pack on `dev` (0.2.5). No version bump: the changelog entry goes under `## Unreleased`.

## F1 Fix: local overlay `.foreman.local.json` for the pretest runner

Problem: addresses and production hosts for the pretest must be committed in `.foreman.json`. The repository is public in some projects, so they should stay out of it.
Expected: the runner merges an optional, git-ignored `.foreman.local.json` over `.foreman.json` (objects merge key by key, arrays and single values of the local file replace). The guards check the merged result. A broken local file stops the run with exit 2 and does not echo its content. The installer adds the file to the project's `.gitignore`.
Board: no interface.
Acceptance: tests in `template/scripts/test-pretest.mjs` red before, green after.

## F2 Fix: `base_url_env` for the gateway address

Problem: the gateway address is read only from `FOREMAN_GATEWAY_URL`. An installation whose environment uses another name cannot say so.
Expected: `[gateway]` accepts `base_url_env`, the name of the variable that holds the address (default `FOREMAN_GATEWAY_URL`). `base_url` still wins.
Board: no interface.
Acceptance: `test_gateway_base_url_env_name` in `test_run_task.py` red before, green after.

# Fix pack 2026-11-23-local-overlay

Replaces the closed PR #38 (old base, no `STATE.md`). Same content, built on `dev` (0.2.5).

## Summary

2 of 2 fixes done, 0 analyses, 0 blocked. Review: round 1 needs-attention (one medium, fixed), round 2 pass.

| # | Title | Type | Result | Cause | Commit | Test |
|---|---|---|---|---|---|---|
| F1 | Local overlay `.foreman.local.json` | fix | done | pretest addresses and production hosts had to be committed | b589a3c, 111b899 | `test-pretest.mjs`, red on 54ff77a and af1c015 |
| F2 | `base_url_env` for the gateway | fix | done | the gateway address was read only from `FOREMAN_GATEWAY_URL` | 471cb95, 111b899 | `test_run_task.py`, red on 54ff77a and af1c015 |

Changelog: `## Unreleased` above 0.2.5 (7124481). No version, no tag.

## Review findings fixed in R1

- The "broken overlay is not echoed" test used a secret that is scrubbed anyway. It now uses a marker that only the runner's own message can keep out.
- `mergeConfig` skips keys that exist on `Object.prototype` and uses `Object.hasOwn`.
- A custom `base_url_env` variable is kept from workers and masked in logs.
- The installer test checks the `.gitignore` line.
- `docs/test-login.md` says that a list in the local file replaces the committed list.

## Open (low, on purpose)

- `install.sh --update` does not add the `.gitignore` line to existing projects; the changelog tells them to.
- Overlay JSON `null` or an array at top level: error text is misleading. Read errors say "not valid JSON".
- The default address variable and a custom one are treated slightly differently.

## Final run

`bash scripts/test-all.sh` rc=0 on 111b899.

## For the human (UAT)

Only what needs a real project: put `pretest.targets.dev` into `.foreman.local.json` of a test project and run the pretest runner. Everything else is covered by tests.

## Learned

nothing new

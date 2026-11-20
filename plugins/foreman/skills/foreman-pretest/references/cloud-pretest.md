# The cloud pretest (module pretest)

Read to interpret a result file `docs/pretest/<unit>-round-N.md` or to explain the pretest to the human. The work run executes it; chat does not.

## What it does

1. Installs the project's dependencies in its own worktree (a stale checkout fails with `ERR_MODULE_NOT_FOUND` otherwise).
2. Signs in through the project's **test login**. The pattern: an own switch (for example `TEST_LOGIN=1`), active only on non-production hosts, a host allowlist, a secret of at least 32 characters, rate limiting, never an admin account, and the app refuses to start on production with the switch on. A user account is never automated.
3. Runs a plan of flows headless with Playwright against the deployed dev or staging build, only on the test tenant.
4. Takes screenshots on desktop and mobile and compares each page, dialog and state with the approved board in `docs/design-reference/`.
5. Runs axe-core for the project's WCAG level (default 2.2 AA).
6. Applies the five roles of `foreman-role-review` and checks every visible text.
7. Proves effects on third-party systems (a bot, mail, webhooks) with read-only API check scripts and a test interaction endpoint that follows the test login pattern.
8. Writes `docs/pretest/<unit>-round-N.md` and, as its last line, `Verdict: fix-round | uat-ready | intervention`.

## What follows the verdict

| Verdict | Next |
|---|---|
| `fix-round` | a fix pack goes back to the same batch branch; after the deploy the next round re-tests |
| `uat-ready` | a UAT checklist appears in the tracker ticket (or `docs/uat/<unit>.md` with tracker `none`); it holds only what needs a second real account or a product decision, each with the reason |
| `intervention` | unit status `needs-input`, tracker status Action Required, plus the explanation comment in the same run |

The dispatcher takes over a verdict file with a valid `Verdict:` line for the current round. More than 3 rounds without `uat-ready` becomes an intervention.

## What to tell the human

The number of rounds, the verdict, what the checklist asks of them and why each item needs a human. If the cloud result and a manual look disagree, put the difference into the next round's note, not into a second pack.

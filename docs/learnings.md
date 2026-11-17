# Learnings

Why the rules in foreman exist. Skills hold the rule; the story lives here. Projects keep their own `docs/learnings.md` in the same format (one bullet per lesson, newest at the top).

## From the reference project

- `fire_trigger` is missing in Claude Code routines without the remote connector, which cannot be added in the UI. The delegation fires with curl.
- `validation` on a mid-size model let too much through; it runs on the strongest model, but only after the mechanical checks are green.
- A "Saved" toast is not proof of persistence: confirm after reload plus a reading API call.
- A batch run with three units merged all three but closed only the last; the others stayed in `batch-pr` with a lock and the autopilot stood still. Close each unit right after its merge commit; the check emits a batch-finish order for units stuck in `batch-pr` whose branch is already in the target.
- A blocked item must not stop the other items of a fix pack; it goes to `needs-input` on its own.
- A broken verify command must abort before any worker starts (exit 4); otherwise every escalation step fails on acceptance instead of on the task.
- A design file keeps three layers (primitive, semantic, component); agents allowed to use primitives or hex values drift within a few milestones.
- A plan limit on the tracker once blocked ticket creation; a fix pack must be able to run with `Tracker: -`.
- A review row in the tracker must not fill the unit field; runs match pretest rows to units through it.
- A subagent costs a large fixed token overhead at start (measured around 80k). Delegate in chat only above a threshold.
- A summary never replaces the full role-review report; every role gets its own section even without findings.
- A work run started in the background by a cheap routine session ends when that session ends its turn; the run set its lock and aborted without a report. The delegation fires work runs by API, and subagents inside a run stay in the foreground.
- A worker on a cheap model used for coding drains its provider quota quickly. `completion` and `subagent` never change code.
- After a deploy the browser session is often gone; a login screen after a deploy is not a bug.
- An answer to a `needs-input` question counts only if it is newer than the question; each new question rewrites the `since` time so old answers do not re-trigger the unit.
- Autonomous runs do not enter plan mode, so `opusplan` ran them on the smaller model. No `opusplan`.
- Cut milestones so they touch few shared files (schema, translations, navigation), otherwise parallel strands conflict at merge time.
- Firing a routine by API from a restricted-network sandbox is refused. The delegation environment needs network "Full", ideally its own environment so work runs stay on "Trusted".
- Keep a worker's "denied tool call" list in the result file: verify prefixes like `VAR=x cmd`, `env` and redirects outside the repo are rejected silently in `-p` mode, so the wrapper sets the environment itself.
- Letting a cheap model compute timestamps, locks and statuses proved unreliable. The check is one shell script that prints finished lines.
- Merged is not deployed: a re-test first verifies that the deployed commit contains the fix commits.
- Network secrets do not work for the fire token, because the API host never receives a secret. Fire URLs and tokens are plain environment variables of the delegation environment.
- Nine UAT approvals in one payload: the run updated STATE.md only, not the trackers, and the UAT list was cleared right away, so it was noticed a day later. Hence one source of truth plus a mirror script, and the UAT list entry is removed only after the mirror shows the unit is no longer `uat-ready`.
- One fix pack per test round (one coding session) beats one session per finding; exception: a blocker that stops further testing.
- Parallel milestone strands move the bottleneck to UAT; the longest strand sets the schedule, and testing is estimated at least as large as coding.
- Parallel sessions picked the same "next free task number". Task IDs are a UTC timestamp plus 4 random characters.
- Plan accessibility per milestone with UI, not as one milestone at the end; late fixes after large rebuilds introduce new errors.
- Reading the real backend error before forming client-side hypotheses avoids chasing UI causes for server failures.
- Releases on a weekday other than the release day leave no buffer for follow-up errors; the release day is fixed, with an exception only for explicitly urgent fixes.
- Routines created from a chat have no cloud environment (no worker key, no provider network) and cannot later be switched from schedule to API trigger. Create them in a cloud session or in the UI.
- Rules grew into skills as incident stories; every run paid for reading them. Stories go to learnings, skills keep the rule.
- Run fixes for a milestone on its batch branch only when it is not mid-pretest; otherwise collect them and send them after the pretest result, so fixes do not collide with the retest.
- The role review has an approval gate because the roles roast hard and not every critique should become a fix.
- The session-start hook built the full dev environment (dependencies, database, code index) for the hourly delegation, which only reads branches. Heavy hooks exit when `AUTOPILOT_ROLE=delegation`.
- Third-party OAuth cannot be driven by a browser pretest. A test login (own switch, dev/test only, refuses to start on staging and production) goes into the milestone brief up front.
- Typecheck, lint and unit tests miss bundling errors (for example a relative runtime import of shared code in a UI component). The production build is mandatory before pushing to a batch branch.
- Worker task and result files were committed for weeks (about 2,000 files, 28 MB) and every run cloned them. They are git-ignored; only the agent report stays.
- Workers have no git, so scope can only be checked with a file snapshot before and after the run.

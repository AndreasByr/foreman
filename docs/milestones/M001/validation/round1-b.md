# Full worker report: m001-val-b.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-attention

**Findings**

| # | Severity | file:line | What is wrong | Evidence |
|---|---|---|---|---|
| 1 | medium | template/scripts/lib/autopilot-check.mjs:136-138 | With `mainAutoMerge` false, an **open** `batch/main` PR no longer starts a batch task. The brief limits the rule to the merge window ("startet im Merge-Fenster nur, wenn…", M001-CONTEXT.md:15; requirements.md:48 "wartet auf das Batch PR main des Menschen"). A main PR is only open after a human "Batch PR main" (or with the flag on), so it is already approved. The skill still says to finish it: batch-run.md:9 ("A batch PR … is open: finish it") and :20 ("CI still running … leave the PR open … The next run continues"). | Scenario: the human orders "Batch PR main", the session ends while CI is still running, and the PR stays open. Old code: `open` → task (diff line 953). New code: `auto=false` → `trigger=false` → `continue` when there is no catch-up. The human-approved PR is never resumed. The test at test-autopilot-check.mjs:143 locks this in. The reverse case also exists: on held main with an open PR plus catch-up, the prompt names only the catch-up units (lib:145), but the run reads batch-run.md:9 and may still finish the main PR. Code and skill disagree in both directions. |
| 2 | medium | dispatcher/dispatcher.env.example:20-22 | `FOREMAN_TZ` (and the other `FOREMAN_*` overrides) is still documented as a global override in dispatcher.env. Since S1 it no longer reaches the check script unless it is listed in `pass_env`. | dispatch.sh:7 exports dispatcher.env. dispatch.mjs:151 `safeEnv(env, project.pass_env)` passes only PATH/HOME/LANG plus pass_env. template/scripts/autopilot-check.mjs:91 `settingsFrom(process.env, …)` and lib:23 read `env.FOREMAN_TZ`. An operator with `FOREMAN_TZ=Europe/Berlin` silently drops back to `.foreman.json` or UTC. Window, overdue and release hour shift without any message. The upgrade note in docs/MODULES.md only speaks generally about pass_env. |
| 3 | low | dispatcher/dispatch.mjs:132 | git now also gets only PATH/HOME/LANG. The brief and requirements only ask for this for the check script (requirements.md:43, CONTEXT:13). `SSH_AUTH_SOCK`, `GIT_*` config, `XDG_CONFIG_HOME` and proxy variables are lost. | The old code used `{ ...env, GIT_TERMINAL_PROMPT }` (diff:124). A project with no `deploy_key`/`deploy_key_env` that relied on ssh-agent or a credential helper fails `git fetch` after the upgrade. No test covers this. The same applies to dispatch.mjs:114: `fire_command: "ssh my-server …"`, the documented path (README, config.example.json), loses `SSH_AUTH_SOCK`. ssh then fails inside the detached command, while the dispatcher still logs "command started" (dispatch.mjs:120, :239). |
| 4 | low | dispatcher/dispatch.mjs:55 | `pass_env` blocks only the names PATH/HOME/LANG. `NODE_OPTIONS`, `BASH_ENV`, `LD_PRELOAD`, `GIT_SSH_COMMAND` and similar can be set through the config and change how the check or command runs. | `ENV_NAME` only checks syntax. Check and command both run with `shell: true` (:112, :152). Note: this sits inside the operator's config trust boundary, and the requirement ("nur Namen aus der Projektkonfiguration") is met. This is not a hole against outside input. |
| 5 | low | dispatcher/dispatch.mjs:205 | The https-only rule only covers the first hop: `fetch` follows redirects (default `redirect: "follow"`), including to http or internal addresses. With explicit `webhook_format: discord/slack`, any https host is accepted, IPs and localhost included (:186-190). | No `redirect: "manual"/"error"` option at :205. Low because only the operator sets the URL. |
| 6 | low | scripts/check-config.sh:34 (same in template/scripts/check-config.sh) | "Supports --no-fetch" is detected by the string appearing anywhere in `scripts/autopilot-check.*`. A usage comment counts as support even if the script rejects the option. A .sh that hands off to a file other than `autopilot-check.*` gives a false warning. | `grep -qs -- '--no-fetch' "${ap[@]}"`. Test case d (test-check-config.sh) passes even though the .mjs only prints when called with the option. The check is warn-only, so the impact is small. |

**Checked with no finding**
- **dev batch:** the old skip condition (diff:953) and the new one (lib:136-138, with `auto=true` and `held=false`) are logically equivalent. Window, overdue, open PR and catch-up behave as before, and so do the info text and units.
- **mainAutoMerge:** only `a.mainAutoMerge === true` turns it on (lib:30). There is no env override, and truthy strings or numbers stay false (tested).
- **Another project's token:**
  - Check, git and fire_command all get `safeEnv`.
  - Log lines and webhook messages go through `redact`, with this project's token, deploy key and pass_env values.
  - Dry-run starts nothing.
  - No path was found where a token reaches a child process or an output.
- **PATH/HOME/LANG** cannot be overridden through pass_env. `FOREMAN_PROJECT/KIND/UNIT` are set after the spread (:114).
- **Webhook:**
  - The URL never appears in error texts (:176, :190, :195). The fetch error is redacted of the URL (:206).
  - Bad input (no URL, non-https, unknown format or host) gives a defined error. `notify` catches everything, so there is no crash.
- **fire-claude.example.sh:**
  - The order travels only quoted over stdin (`"$(cat)"`, `printf '%s\n' "$ORDER"`), with no eval and no interpolation into the command line.
  - The dry-run output contains no order text.
  - `$FOREMAN_CLAUDE_FLAGS` is word-split on purpose and set only by the operator.
  - The unit name is not used in the shell string. The log file name is sanitized (:109).

---

**Established**
- `main` with an open PR and no flag is held (lib:136-138, test:143). That contradicts batch-run.md:9/:20 and goes beyond the brief's window rule (CONTEXT:15, requirements:48).
- `FOREMAN_TZ` from dispatcher.env no longer reaches the check (env.example:22 → dispatch.mjs:151 → autopilot-check.mjs:91).
- git and fire_command lose `SSH_AUTH_SOCK` and other non-base variables (dispatch.mjs:114, :132). This was not part of the requirement.
- Webhook redirects are not blocked (dispatch.mjs:205).
- The dev batch logic is unchanged, and the secret isolation and the mainAutoMerge strictness work as intended.

**Unclear / not found**
- What the original server-1 patch looked like (whether it also cut down git's environment). It is not in the repo.
- Whether any real project has relied on ssh-agent instead of a deploy key, or on `FOREMAN_TZ` from dispatcher.env. Server configs are not in the repo.
- I did not run the test results myself (only Read/Grep allowed). The green status comes from STATE.md:63 and has not been verified.
- Whether `claude` on macOS or with a keychain login needs variables beyond PATH/HOME/LANG for a local `fire_command`. No evidence in the repo.

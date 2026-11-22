# Full worker report: m001-val-c.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-attention

I found two medium and five low findings. Criteria 1–4 each have at least one test that would have failed on the old code and is meaningful. Parts of criteria 1, 4 and 5 only pin down behaviour that already worked; the S4 and S5 reports say so, the S1 report does not.

**Findings**

| # | Severity | file:line | What is wrong | Evidence |
|---|---|---|---|---|
| 1 | medium | `template/scripts/lib/autopilot-check.mjs:136-142` | An open batch PR for `main` no longer starts a batch task unless `mainAutoMerge: true`. That contradicts the slice plan and the skill doc. A PR the human started with "Batch PR main" whose CI outlasts the run is never picked up again by the dispatcher. | `docs/milestones/M001/STATE.md:29` says "offener PR und Catch-up für `main` bleiben". The code requires `auto` for `open` (`:137`) and drops "batch PR #n open" from the info (`:142`). The test pins down the opposite of the plan (`m001.diff:1000-1009`, "open PR starts it only with mainAutoMerge true"). `batch-run.md:9` still says "A batch PR … is open: finish it" with no exception for `main`, and `:20` says "The next run continues". The S3 report (`S3.md:3`) states the new behaviour but does not mention the change from the plan. |
| 2 | medium | `plugins/foreman/skills/foreman-setup/references/prerequisites.md:13,85`; `profiles-and-modules.md:43` | One requirement is not covered: `foreman-setup` should list `fire_command` as a Claude Code option without a cloud routine. It still describes it only as "Other agents" / `opencode run`. | `docs/requirements.md:26` names "`foreman-setup` und `docs/MODULES.md`". The diff (file list `m001.diff:1-970`) does not touch any `foreman-setup` file. Only `docs/MODULES.md:699` was updated. Requirements outrank the brief. |
| 3 | low | `docs/milestones/M001/STATE.md:18,19` | The Files column lists files that are not in the diff: "template .foreman.json" and "autopilot-check.mjs" (S3), and `template/scripts/autopilot-check.mjs` (S4). | None of these appear in the `diff --git` list of `m001.diff`. The S3 report (`S3.md:3`) lists different files. The S4 report (`S4.md:3`) says the template already supported the option. |
| 4 | low | `docs/milestones/M001/STATE.md:32,45` | The check plan and the mandatory questions for S6 still require a CHANGELOG entry. The log and the report say CHANGELOG was deliberately left alone, and the plan was never updated. | `STATE.md:63` "(CHANGELOG bewusst nicht angefasst)"; `S6.md:15`. |
| 5 | low | `m001.diff:379,405,426-445` | Criterion 1 ("taucht in keiner Ausgabe auf") is not fully tested, and the S1 report claims red-before without qualification. | The log of a real (non-dry) run is discarded (`log: () => {}`, `:379`, `:405`), and the `fire_command` log file in `<workdir>/logs/` is never searched. The dry-run/webhook test (`:426-445`) would also have passed on the old code: the old dry-run line contains no environment (`m001.diff:192`), and the old body was `{text, content}` with just the message (`:183`). Red-before only holds for the environment-dump tests (`:372-424`). `S1.md:8` reports red without saying this. |
| 6 | low | `scripts/test-dispatcher-docs.sh` (`m001.diff:895-896`) | The S6 report says the test checks that skills carry only the rule, without the reasons. The test only forbids the single word `outward-facing` in `foreman-fix/SKILL.md`. | `S6.md:3` "(der Test prüft das)". `batch-run.md`, which also got the rule (`m001.diff:911`), is not checked. A reason written in other words would pass. |
| 7 | low | `scripts/test-dispatcher-docs.sh` (`m001.diff:880-886`) | Criterion 5 / capability 5 asks the docs to name `claude_login = "inherit"`. No test checks this; the term list leaves out `claude_login`. | `claude_login` appears only in comments (`fire-claude.example.sh:32-33`) and in `dispatcher/README.md` (`m001.diff:26`). That refusing aliases is tested (`m001.diff:640-651`). |

---

**Established**

- **Criterion 1:** `safeEnv` (`dispatcher/dispatch.mjs:51`) is used for the check (`:151`), `fire_command` (`:114`) and git (`:132`).
  - The env-dump tests (`m001.diff:372-389`, `391-424`) fail on the old code. The old code passed `{...env}` to the check (`m001.diff:134`) and `process.env` to `fire_command` (`:114`), and the test sets `process.env.OTHER_FIRE_TOKEN` (`:401`).
  - The tests check the allowed variable names, not just that the token is absent.
  - `pass_env` cannot override `PATH`/`HOME`/`LANG`, and empty or invalid names are ignored (`:356-360`).
- **Criterion 2:** `webhookRequest` did not exist before (`S2.md:8`, `import * as`). The tests check the exact body (`:485-496`), auto selection by host including subdomains, defined errors that do not reveal the URL (`:498-506`), and at run level exit 1 with no POST for an unknown host (`:536-542`).
  - An invalid URL is only tested at unit level (`:502-504`), but it takes the same `try/catch` in `notify` (`dispatch.mjs:202`) as the unknown host.
- **Criterion 3:** `mainAutoMerge: a.mainAutoMerge === true` (`lib/autopilot-check.mjs:30`).
  - The test covers `null`, `"true"`, `1`, `0`, `{}` and `[]` (`m001.diff:978-984`), plus window and overdue with and without the setting, including the string `"true"` (`:986-998`).
  - It would have failed before: the old code started a `main` batch in the window. `S3.md:8` reports exit 1.
  - `main()` reads `.foreman.json` into `settingsFrom` (`template/scripts/autopilot-check.mjs:90-91`).
- **Criterion 4:** The `check-config.sh` warning is new, and test case c fails on the old code (`m001.diff:822-832`). The TASK-line test with and without `--no-fetch` (`:1047-1082`) was already green before, and `S4.md:10,20` states this honestly.
- **Criterion 5:**
  - The dispatcher dry-run test with `fire_command` (`:544-562`) checks "via command" and that the secrets are absent. It was already green, and `S5.md:12` says so.
  - `test-fire-claude.sh` fails without the template (`S5.md:8`). It covers `claude -p`, `--model`, removing the API key, refusing aliases and the dry mode.
- **Criterion 6:** The README, MODULES and learnings terms are checked by `test-dispatcher-docs.sh`, and all three scripts are wired into `test-all.sh` (`m001.diff:765-768`).
- **Test counts are consistent:** `test-dispatch.mjs` has 26 tests (S5 log), and `test-autopilot-check.mjs` has 27 (S4 log). Both match the current files. S2 25 → S5 26 also matches the one added test.
- **Done claims:** every one in `STATE.md:58-63` and in the reports names a command and an exit code. The SHA is given only as "Commit „M001 Sx“"; I checked that this is internally consistent, not against git.
- **Human-only items** (real Discord message, dry run on Host 1) are open and not claimed as proven: `S2.md:16`, `S5.md:18`, roadmap `:107` and Flows A–C (`:117-128`) are unchecked.

**Unclear / not found**

- I could not check the SHAs and the red runs against git log or CI, because I only read and searched files.
- The brief asks for `--no-fetch` with an outdated local state. The test uses a fake git where fetch changes nothing (`m001.diff:1057`), so an actually outdated state is not modelled.
- I could not find whether the human's "Batch PR main" run always finishes its PR itself. If it does not, finding 1 is a real gap in operation, not just a mismatch between documents.
- `M001-CONTEXT.md:23` lists `scripts/test-install.sh` as a shared file. Whether M001 needed to touch it is not stated anywhere; it is not in the diff.

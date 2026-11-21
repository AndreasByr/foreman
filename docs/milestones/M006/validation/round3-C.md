# Full worker report: val-C.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

- [low] scripts/update.py:242/255: The "no repo" check depends on the system language. `env` only adds `GIT_OPTIONAL_LOCKS`; it does not set `LC_ALL=C` or `LANGUAGE=C`. The code compares against the English text `"not a git repository"`. Git translates that message, so on a German locale with git translations installed it never matches. Every update of a non-git folder whose foreman files are stale then stops with exit 2 ("cannot check local changes with git: …"). This fails safe (nothing is written) and git projects are not affected. No test covers it, and the test suite runs in an English environment. Inference from the code; not reproduced.
- [low] scripts/test-update.sh:264: Test 15 depends on the machine's git config. `GIT_TEST_ASSUME_DIFFERENT_OWNER` only skips git's owner comparison; a configured `safe.directory` still marks the repo as safe. On a host with `safe.directory = *` in its global or system config (common in CI containers), git's ownership check never fires, the update writes, and test 15 turns red for the wrong reason. The test does not set `GIT_CONFIG_GLOBAL=/dev/null` or `GIT_CONFIG_NOSYSTEM=1`. `/root/.gitconfig` here has no `safe.directory`, so it is not hit locally.
- [low] scripts/update.py:142/275: Pre-release handling only works in one direction. Versions are compared on `X.Y.Z` only (the `vtuple` regex), and the bump runs whenever `old != new and vo <= vn`. If `VERSION` is itself a pre-release, for example `0.2.2-rc1`, a project on `0.2.2` or `0.2.2-rc2` is not rejected as newer; its version is set back to `0.2.2-rc1`. The brief requires "newer project version gives an error". It does not matter today because `VERSION` is `0.2.1`.
- [low] scripts/test-update-skill.sh:85: Check B finds `cd <project path>` already in the header line SKILL.md:38 ("…the rest after cd <project path>."). If step 3 `cd <project path>` (SKILL.md:42) were deleted, the test would stay green. The check is weaker than it looks.

**Checks**

| Check | Result |
|---|---|
| R2 git failures | update.py:251-259: exit 0 + `true` → repo; exit 128 + "not a git repository" → no repo; anything else → `die(2)` before any write. Git binary missing and `.git` present → `die(2)`. Correct, apart from the locale finding. |
| Test 15 red before R2 | Yes. Before R2 the dubious-ownership case counted as "no repo" and the stale `state.mjs` was overwritten, so the tree hash changed. The test checks exit 2, the "cannot check local changes" text and an unchanged tree. |
| Test 14 (pre-release) | `0.2.1-rc1` → no "newer", exit 0, version becomes `0.2.1` (test-update.sh test 14). Red before R2 because it asserts the bump. |
| CHANGELOG Files line | Unreleased no longer lists the dispatcher as replaced: `dispatcher/dispatch.mjs` is "updated on the dispatcher machine". The files it names exist in `template/`: `scripts/check-config.sh`, `scripts/autopilot-check.{sh,mjs}`, `.claude/skills/foreman-dispatch-run/references/batch-run.md`, `.claude/skills/foreman-batch/SKILL.md`. |
| Order block in the skill | SKILL.md:38 says where steps run (1-2 in the foreman checkout, the rest in the project), and step 3 is the `cd`. Consistent. The marker `(mixed: merge by hand)` matches the output in update.py, and test D checks it against a real dry run. |
| Skill vs `block-status.py` | Output words and exit codes in foreman-project-mode/SKILL.md (current 0, outdated 1, newer 0, missing 3, error 2) match the script. |
| `.foreman.json` has `"foreman"` | install.sh:171 writes it, so the hint in 0.2.0 Upgrade only concerns old files without it. |
| Test 12 (missing mixed file) | The `{{` condition is never active: `template/tools/delegate/config.toml` has no placeholder, so the byte comparison always runs. |

**Established**
- The R2 changes are in the code and the tests exactly as described (update.py:238-271, 275; test-update.sh tests 14 and 15; CHANGELOG Unreleased; SKILL.md:38).
- No medium or high finding; nothing blocks completion.

**Unclear / not found**
- I could not run the tests: Bash calls with `git` were denied, so the green results are not confirmed by me.
- The installed git version and its translations were not checked, so the locale finding is inferred, not reproduced.
- Whether rounds 1 and 2 already flagged the "target file is a directory" case: the STATE.md table lists it as a negative test, but test-update.sh has no case where the target is a directory (test 6 covers the reverse). Not reported as a finding.

# Full worker report: val-B.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-remediation

- [medium] scripts/update.py:241-250: The dirty check treats any git failure as "not a git repository" and carries on writing. `rev-parse` returning non-zero, or git being missing (`OSError`), sets `in_tree = False`, then `git_note = True`. The update then overwrites foreman-owned files that have uncommitted changes, with only the line `note: not a git repository, local changes not checked` (line 276), and that line is wrong in this case. The realistic trigger is a repo owned by another user than the one running the update (git's "dubious ownership" / `safe.directory` check, exit 128). That is the shared-server case the brief's Risks names (local patches on myweby). Success criterion 6 and the role-review criterion ("ungesicherte lokale Änderungen … brechen ab") fail in that setup, and no test covers git failing. I could not reproduce it here because the sandbox does not allow running git. Suggested fix: treat "not a repository" as the only skip reason, either by matching the stderr text or by looking for `.git` in the target or a parent, and stop with exit 2 on any other git error.
- [low] scripts/update.py:142,264: Versions are compared on `x.y.z` only, so a project on `0.2.1-rc1` updated by a `0.2.1` checkout is never bumped. `vo < vn` is false and `.foreman.json` keeps saying `0.2.1-rc1` after a successful update. Test 14 (scripts/test-update.sh, end) checks only for exit 0 and no "newer" message, not the resulting version. The reverse case also passes silently: project `0.2.2` against checkout `0.2.2-rc1`.
- [low] scripts/update.py:296-316: The report is printed only after all writes. If a write fails partway (line 307-309), the user sees one error line and not the list of files already replaced. Version stays unchanged, so that part is correct.
- [low] scripts/update.py:283-291: The diff of mixed files prints up to 60 lines of the project's current `.claude/settings.json` / `tools/delegate/config.toml` to stdout. If a project put values into the `env` block of `settings.json`, they end up in the Claude Code transcript (`foreman-update` SKILL.md step 4 has Claude Code run this). The template has no `env` block (grep found no `env` in template/.claude/settings.json), and such a file is committed anyway, so the risk is small. There is no redaction and no hint about it.
- [low] scripts/update.py:120-123 vs install.sh:65-68: Old module names are not normalised. install.sh maps `ollama` to `delegate`, `linear` to `tracker-linear` and refuses `notion`. update.py takes `modules` as written, so an old `.foreman.json` renders `{{MODULES}}` with the old names. That shows up only as a mixed diff in `CLAUDE.md` and writes nothing wrong. A remaining `notion` gets no warning (CHANGELOG 0.2.0 Upgrade asks for it to be replaced).

### Checks

| Area | Result | Evidence |
|---|---|---|
| install.sh without `--update` | unchanged | Changes are only the `--update` pre-scan, `given+=` (harmless in normal mode), the update branch before line 55, and the help range `2,17p` (line 17 is the last comment line). `skip_file`, `copy_one`, `merge_settings` and the gateway handling are untouched. |
| install.sh update options | ok | `--update` plus anything but `--dry-run` gives exit 2 with the `foreman update:` prefix (install.sh:49, 43). Test 3 covers `--modules`, `--force`, `--project`; test 13 covers `--bogus`. |
| Skip rules, update vs install | equivalent | update.py:21-41 vs install.sh:91-102. The glob `*` and the prefix `startswith` match the same paths. Gateway is installed regardless of scope in both (install.sh:196, update.py:200). |
| Rendering | equivalent for the template | update uses `str.replace`, install uses sed. Pre-existing install.sh:105: `&` or `\|` in the name break the sed version. Placeholders exist only in CLAUDE.md, AGENTS.md, settings.json, two routines and foreman-delegation. |
| Gateway files | ok | Forced to class `foreman`, not rendered (update.py:200-202, 213), same as install's `cp` (install.sh:200). They are included in the dirty check. |
| Containment | ok | update.py:51-60 resolves the deepest existing part. Symlink out of the target gives exit 2 before any write (tests 4 and 13). A symlink inside the target is replaced by a regular file through `os.replace`; the file it pointed to is not touched. A `.claude/` that is a symlink to a shared folder makes the whole update stop. |
| Nothing written on a precondition error | ok | Every `die` comes before line 300. Writes start only at `if not dry:`. |
| Dry run | ok | No write path when `dry`. `GIT_OPTIONAL_LOCKS=0` means no index refresh. |
| Version bump | ok | Written textually and last (update.py:264-273, 311-315). It checks that the top-level `foreman` value is the one replaced; a nested `"foreman"` found first leads to a defined error, not a wrong write. |
| Mixed files | never overwritten | update.py:229-234 only produces `keep`, `unchanged` or `create` (when missing). Test 1 confirms with `cmp`. |
| Executable bits | ok | Existing files keep their mode plus the template's x bits (line 304). New files get a fixed 0644/0755, so the umask is ignored. |
| Partial writes and reruns | ok | Each file is written atomically. On a rerun, files already written are `unchanged`, so the dirty check does not block. There is no lock against two updates running at once. |
| Classes vs template | ok | `__pycache__`/`.pyc` are skipped in update.py and in the test. The `.pyc` in template/ is in .gitignore, but install.sh's `find` copies it when it exists locally (pre-existing). |
| Skill / CHANGELOG / docs | consistent | `cd <project path>` comes before `check-config.sh` (SKILL step 4). `block-status.py` and the refresh step are in step 7. CHANGELOG Unreleased has Files/Steps/Optional plus the dispatcher step. MODULES.md describes "A missing one is created" the way the code does it. |

## Established
- If git fails or is missing, the update overwrites foreman files with local changes (scripts/update.py:241-250, 276).
- Pre-release project versions are not bumped (scripts/update.py:264).
- R1 items 1 to 7 are in the code and tests as described: update.py:241-261 (`rev-parse`, `--no-renames`, `GIT_OPTIONAL_LOCKS`), the diff at 283-291, mixed `create` at 229-232, tests 9 to 14, and the skill test sections A to E.
- Normal install behavior is not changed by the diff.

## Unclear / not found
- I ran nothing: the sandbox refused every Bash call that runs scripts, including the tests and the dubious-ownership simulation. So `bash scripts/test-all.sh`, `check-config.sh` and plugin validation are unverified, and the dubious-ownership behavior comes from git's documented `safe.directory` rule, not a run here.
- Whether `scripts/privacy-scan.sh` accepts the new test files (for example `t@e.com`) is unchecked.
- `scripts/test-install.sh` does not appear in the diff; whether parallel milestones touch it again before the merge is not visible from here.

# Full worker report: val-A.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: needs-remediation

- [medium] scripts/update.py:236: The check for uncommitted changes only runs when `<target>/.git` is a directory. In a git worktree or submodule, `.git` is a file, so the check is silently skipped and uncommitted edits to foreman-owned files get overwritten. This repo checkout is itself such a case: `ls -la .git` shows a 56-byte regular file. Success criterion 6 fails for these targets, and `scripts/test-update.sh` case 5 only covers a normal `git init` repo.
- [medium] plugins/foreman/skills/foreman-update/SKILL.md:63-68: Step 7 runs `block-status.py` and writes the checklist line "Project instructions outdated: run foreman-project-mode (2 min)". It never calls `foreman-project-mode` in its refresh mode. Capability 5 and roadmap slice S5 say "Am Ende ruft foreman-update foreman-project-mode im Auffrischen-Modus auf". As written, the skill hands that step to the human, so this is only partly covered.
- [medium] scripts/test-update-skill.sh:1-77: The test only checks the text of SKILL.md: required strings, at least 4 numbered lines, at least 4 "N min". Success criterion 7 and roadmap S4 ask for "ein Durchlauf-Test am Testprojekt" that produces the order and the checklist. No test runs the skill against a test project.
- [medium] scripts/update.py:226-232 and plugins/foreman/skills/foreman-update/SKILL.md:30: For a mixed file, the output is just `keep <file> (mixed: merge by hand)`. Neither the script nor the skill shows the difference to the template. `docs/requirements.md:68` (which outranks the brief) says "gemischt (der Skill zeigt die Änderung und lässt den Menschen entscheiden)". The human has to diff by hand against the template, which contains `{{…}}` placeholders. Partly covered.
- [low] scripts/update.py:227: A missing mixed file (`CLAUDE.md`, `.claude/settings.json`, `tools/delegate/config.toml`, `AGENTS.md`) is created (`action = "create"`). The fixed decision says mixed files "werden nie geschrieben, nur gemeldet". No customisation is lost, but this contradicts the wording, and no test covers this path.
- [low] CHANGELOG.md:7-13: The Unreleased "### Upgrade" part is a loose list. It has no **Files** / **Steps** / **Optional** structure, unlike 0.2.1 at lines 19-22. It also names no changed files, although M001 changed the dispatcher, `check-config.sh` and `batch-run.md` (`docs/agent-reports/2026-11-21-M001.md:30`). `scripts/test-changelog.sh` only checks that the part exists, is not empty and contains the three words. Criterion 2 ("Dateien, Schritte, optional") is partly covered.
- [low] scripts/update.py:269/283: If all files are already current and only the version is old, the script prints "nothing to do" and still writes the new `foreman` value. The message is misleading.
- [low] scripts/update.py:43: `vtuple` takes every run of digits, so a pre-release such as `0.2.2-rc1` becomes `(0,2,2,1)` and compares higher than `0.2.2`. The newer-version check (`vo > vn`) can then wrongly refuse.
- [low] scripts/update.py (write_atomic): writes go through a temp file plus `os.replace`, so a read-only target file whose folder is writable gets replaced without error. Only a locked folder (roadmap Flow B) or a path blocked by a non-directory (test case 6) fails. Criterion 5's wording "Zieldatei nicht schreibbar" is not tested literally.
- [low] docs/milestones/M006/STATE.md (S4 row): it lists `scripts/test-plugin.sh` as a changed file, but the diff does not change it. The new test is `scripts/test-update-skill.sh`. STATE does not match the actual change.

**Checks**

| Item | Status | Evidence |
|---|---|---|
| Cap 1 / SC1 / S1 file classes | covered | `update-classes.json`; `scripts/test-update-classes.sh` checks each file has exactly one rule, no stale rules, and fixed classes for project and mixed files. The template file list matches the rules (`find template`; `.pyc` is ignored and in `.gitignore:1-2`). |
| Cap 2 / SC2 / S2 Upgrade parts | partial | All 4 sections have "### Upgrade"; Unreleased names `pass_env`, `webhook_format`, `mainAutoMerge` (all three M001 changes from `M001.md:25-28`). Structure and file list missing in Unreleased. |
| Cap 3 / SC3 customisations stay | covered | `test-update.sh` case 1: `cmp` on CLAUDE.md, config.toml, learnings.md; `state.mjs` equals the template; `check-config.sh` runs; `.foreman.json` fields other than `foreman` unchanged (so `context`/`mirror` unchanged). |
| SC4 dry run / second run | covered | Case 1: hash before and after the dry run; second run says "nothing to do" with the same hash. Case 2: no changes right after a fresh install for 6 module sets. |
| SC5 errors, version only after success | covered (with caveats) | Case 3: no or broken `.foreman.json`, no `foreman` field, 99.0.0, missing target, forbidden options → exit 2, same hash. Case 4: symlink pointing outside. Case 6: version unchanged after a write error. |
| SC6 uncommitted changes | partial | Case 5 passes in a normal repo; skipped for worktree, submodule and non-git targets (update.py:236). |
| Cap 4 / SC7 / S4 skill | partial | SKILL.md has version comparison (§1), changes (§2), order (§4), modules only after yes (§5), checklist with minutes (§6). `test-plugin.sh` validates every skill generically. No run-through test. |
| Cap 5 / SC8 / S5 project instructions | partial | `block-status.py` plus `test-project-block.sh` (v0 and no version → outdated, none → missing, current, newer, errors) cover SC8. The skill does not call `foreman-project-mode` itself. |
| Fixed decisions | mostly respected | Update runs in the repo and the skill only writes the order (SKILL.md §4, Rules); classes live in a JSON file; version is written last (update.py:283); no modules added (case 7); mixed files are created when missing (deviation). |
| Out of scope | respected | No dispatcher change, `VERSION` still 0.2.1, no tag or release, no automatic merge of mixed files, downgrade refused. |
| Shared files "only add" | respected | `install.sh`: new update branch plus the `given` array; the `--help` range moved from 2,16 to 2,17 because of the new usage line. `test-all.sh`: lines added. |

**Established**
- Classes, Upgrade parts, the update mode with dry run, the newer-version refusal, symlink protection, "version last" and the block-status script exist, and tests for them are wired into `scripts/test-all.sh`.
- The check for uncommitted changes depends on `.git` being a directory (`scripts/update.py:236`).
- The skill hands the refresh of the project instructions to the human (`SKILL.md:68`) and shows no diff for mixed files (`SKILL.md:30`).
- Criterion 7 is checked only by static text matching.

**Unclear / not found**
- I could not run the tests myself. Running test scripts needs approval, and I am read-only here, so "green" rests on STATE.md alone.
- The F2/F3 analyses for Referenzprojekt 1 and Referenzprojekt 2 are not in the repo (`docs/fixpacks/` holds only `_TEMPLATE`). Whether project-specific changes there (for example Referenzprojekt 2's check script without `--no-fetch`, `requirements.md:50`) are correctly classed as foreman-owned under `scripts/` cannot be judged.
- No test shows that the update never reads key files (`.env`, `*.pem`). The code only reads files that exist in the template plus `.foreman.json` and `.claude/settings.json`.

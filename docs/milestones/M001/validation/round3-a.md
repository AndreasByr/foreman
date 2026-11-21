# Full worker report: m001-val-a.md

## Attempt 1: validation (claude/claude-opus-5-5)

Verdict: pass

Findings: none

**Coverage per requirement (role A)**

| Requirement | Status | Code | Test |
|---|---|---|---|
| Capability 1 / Req `docs/requirements.md:43`: the check script sees only `PATH`, `HOME`, `LANG` and `pass_env` | covered | `dispatcher/dispatch.mjs:49-59` (`safeEnv`), `:160-161` (check), `:114` (`fire_command`) | `dispatcher/tests/test-dispatch.mjs:218-242`, `:244-263` (env dump against an allowlist), `:265-308` |
| Role review: `pass_env` cannot override `PATH`/`HOME`/`LANG`; empty or invalid names are ignored | covered | `dispatch.mjs:55` | `test-dispatch.mjs:228-236` |
| Capability 2 / Req `:25`: `webhook_format` discord/slack/auto; docs and `dispatcher.env.example` name both | covered | `dispatch.mjs:178-207`; `dispatcher/config.example.json:5`; `dispatcher/dispatcher.env.example:16-17`; `dispatcher/README.md:16` | `test-dispatch.mjs:369-426`; `scripts/test-dispatcher-docs.sh:43` |
| Capability 3 / Req `:48`: one rule for `main` in `autopilot-check.mjs` and `foreman-fix`, default `false` | covered | `template/scripts/lib/autopilot-check.mjs:30`, `:135-146`; `plugins/foreman/skills/foreman-fix/SKILL.md:72`; `template/.claude/skills/foreman-dispatch-run/references/batch-run.md:9-10` (matches the code) | `template/scripts/test-autopilot-check.mjs:121-190`; `test-dispatcher-docs.sh:39` |
| Capability 4 / Req `:50`: the template accepts `--no-fetch`; `check-config.sh` warns when a project lacks it | covered (text heuristic, accepted as open) | `template/scripts/autopilot-check.mjs:92`; `scripts/check-config.sh:33-36`, same check in `template/scripts/check-config.sh:34-35` | `test-autopilot-check.mjs:367-402`; `scripts/test-check-config.sh` cases a–d |
| Capability 5 / Req `:26`: start script template (`ssh`, `claude -p`, exact model ID, `claude_login = "inherit"`), plus `docs/MODULES.md` and `foreman-setup` | covered | `dispatcher/fire-claude.example.sh:8`, `:14-15`, `:28`, `:38-43`, `:58`; `README.md:18-33`; `docs/MODULES.md:22`; `foreman-setup/references/prerequisites.md:13`, `:85`; `profiles-and-modules.md:46` | `dispatcher/tests/test-fire-claude.sh` a–f; `test-dispatcher-docs.sh:24-31`, `:53-58` |
| SC1: another project's dummy token appears nowhere (environment, log, webhook, dry run) | covered | as capability 1; logs go through `redact` (`dispatch.mjs:232-233`) | `test-dispatch.mjs:254-258` (log and env of a real run), `:283-291` (dispatcher log and `fire_command` log files), `:310-329` (dry run and webhook body) |
| SC2: correct body each for discord and slack; `auto` picks by host; unknown host or invalid URL gives a defined error without a crash | covered | `dispatch.mjs:182-218` (`notify` catches the error; a 4xx/5xx answer is logged at `:216`) | `test-dispatch.mjs:369-426`, `:500-522` |
| SC3: no `batch:main` without `mainAutoMerge`; with `true` yes; `null` and text count as `false` | covered | `lib/autopilot-check.mjs:30`, `:137-138` | `test-autopilot-check.mjs:121-141`, `:157-162` |
| SC4: same `TASK` lines with and without `--no-fetch`; no silent fetch; `check-config` reports a missing option | covered | as capability 4 | `test-autopilot-check.mjs:399-401`; `test-check-config.sh:46-56` |
| SC5: dry run with `fire_command` shows "would start … via command"; 0 secret hits | covered (the run on server-1 is UAT) | `dispatch.mjs:247` | `test-dispatch.mjs:428-446` |
| SC6: MODULES and README describe the 4 terms; reasons in `learnings.md`; skills carry only the rule | covered | `docs/MODULES.md:18-25`; `README.md:10`, `:15-33`, `:76`; `docs/learnings.md:7-10` | `test-dispatcher-docs.sh` (whole file, including the `forbid` checks `:40`, `:70-72`); wired in at `scripts/test-all.sh:12-15` |
| Fixed: dispatcher stays model-free | covered | `dispatch.mjs` makes no model call; `claude -p` runs only in the copied start script | – |
| Fixed: each fix gets a red test first | consistent | `M001-R1.md:13-20` (red/green table with commands, exit codes, `dd4d933`/`ec00abf`); slice reports | – |
| Fixed: take over the server-1 patch's behaviour, not the patch text | not checkable | the patch is not in the repo | – |
| Out of scope: no `fire_command` monitoring, no M004/M007 work, nothing in Project A/B/C | kept | the diff's file list (`m001.diff`, 19 files) contains none of it; `README.md:32` says the dispatcher does not watch the run | – |
| Verification: `test-all.sh` includes the new tests | covered | `scripts/test-all.sh:8`, `:11-15` | – |

**Earlier medium/high findings**

| Finding | Status | Evidence |
|---|---|---|
| R1 A1 / C2 (medium): `foreman-setup` did not list the Claude Code path | resolved | `prerequisites.md:13`, `:85`; `profiles-and-modules.md:46`; test `test-dispatcher-docs.sh:53-54` |
| R1 B1 / C1 (medium): an open `main` PR was never continued without `mainAutoMerge` | resolved | `lib/autopilot-check.mjs:138` `trigger = open \|\| (auto && …)`, `:141` `held` only without an open PR; test `test-autopilot-check.mjs:143-155`; `batch-run.md:9-10` agrees |
| R1 B2 (medium): `FOREMAN_TZ` in `dispatcher.env` silently stopped working | resolved (docs) | `dispatcher.env.example:22-24`; upgrade note `docs/MODULES.md:25`; test `test-dispatcher-docs.sh:46-50`, `:61` |
| Round 2: no medium/high findings | – | `round2/m001-val-a.report.md`, `-b`, `-c`: low items only |

Round 2 low items I also checked, all fixed:
- Real-run logs are now searched for the foreign token: ***, `:283-291`.
- The webhook error status is logged: `dispatch.mjs:216`, test `:512-522`.
- The git environment is checked through a git wrapper (marker, `SSH_AUTH_SOCK`): `:465-486`.
- The outdated "not implemented yet" test comments are gone (no grep hits under `dispatcher/`).
- SHAs are now in `STATE.md:16-21`.
- Addenda in `S1.md:5` and `S3.md:5`.
- `GITHUB_TOKEN` note in `MODULES.md:25`.

---

**Established**
- Every capability (1–5) and success criterion (1–6) in the brief, and the M001 lines in `docs/requirements.md` (`:25`, `:26`, `:43`, `:48`, `:50`), are covered in code and tests or in doc checks.
- All three medium findings from round 1 are fixed and covered by tests or doc checks. The round 2 low items not listed as deliberately open are fixed too.
- Test counts are consistent:
  - `test-dispatch.mjs` has 31 `t(...)` cases, matching `STATE.md:80` and `M001-R1.md:17`.
  - Only the check script and `fire_command` get the limited environment. git deliberately gets the dispatcher's environment (`dispatch.mjs:127-131`, `:142`), which `requirements.md:43` does not forbid.
- `requirements.md:44` (never read key files) is assigned elsewhere in the roadmap (`roadmap-0.2.x.md:171`, S4 "Regeln in Skills"), not to M001.

**Unclear / not found**
- `requirements.md:26` says `pass_env` passes project variables through for the local run. Over `ssh` that is impossible. The repo documents this instead: `learnings.md:10`, `README.md:30`, `fire-claude.example.sh:5-6`. Whether that counts as fulfilled is a product question.
- The SC1 test models the "second project" as a variable in the dispatcher environment, not as a second project entry in the config. As I read `dispatch.mjs:232`, that is equivalent, because redaction and `safeEnv` work per project.
- I ran nothing myself. The reds and greens rest on `M001-R1.md` and the slice reports, and those are consistent.
- Whether the server-1 patch was taken over exactly cannot be checked, because it is not in the repo.

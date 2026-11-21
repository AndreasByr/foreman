# Validation M007

Overall: **pass** (round 2). Three separate reviewers (role `validation`), sources: brief, requirements, role review, diff since `7f8c84c`.

| Reviewer | Round 1 | Round 2 |
|---|---|---|
| A Requirements | needs-attention (low: tests for criteria 2, 5, 10 partial) | pass |
| B Integration and regression | pass (low) | pass |
| C Criteria and evidence | needs-attention (medium: runner stops at first failure, red evidence, failure-path tests, loose CHANGELOG check) | pass |

Rework round 1 (R1, `3630059`): test runner runs every test and exits 1 at the end; run-level tests for release failures with a webhook set, two-project isolation, key isolation between projects, missing `ITSAPLAN_URL`, wider secrets scan, `retire` 404 and 403, dry-run "would close", non-object state file, ticket lookup without a GET per issue; CHANGELOG check limited to the Unreleased section. Round 2 reviewers confirmed all of it.

Open, low (stay open, reported):
- A move to Done that keeps failing (403/5xx) gives exit 1 on every run until fixed; a lost state file can leave a second open update ticket (state is the only memory of old tickets).
- `--dry-run` can print `webhook: yes` although the host would be refused later.
- A state key that is not a version triggers a retire (`null >= 0`); nested non-object values in the state file are not normalised.
- A project that drops its tracker settings keeps its open ticket silently.
- Tests: default `update_notice` (absent) not exercised; the `[]` case of the state test and the `dispatcher machine` doc term are weak guards; move failures 403/500 in `retire` untested.
- `parseSemver` accepts leading zeros (`01.2.3`).
- A first report needs about 3 tracker calls with a 15 s timeout each; several hanging trackers can slow one run.

Final run on `3630059`: `bash scripts/test-all.sh` exit 0; `node dispatcher/tests/test-dispatch.mjs` exit 0 (72 tests); `bash scripts/check-config.sh` run below.

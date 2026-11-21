Target: dev | main
Milestone: Mnnn | -
Batch-branch: batch/dev | batch/main | batch/mnnn
Urgent: no
Fix-pack: <YYYY-MM-DD>-<slug>
Mode: autopilot

Points are numbered F1, F2, ... Each is `Fix:` or `Analysis:`. Analyses come first. Urgent production bugs never go into a pack.

## F1 Fix: <title>

Problem: what happens, where, how to reproduce.
Expected: what should happen.
Hints: files, suspected cause, related points.
Board: <board name, approved on <date>> | no interface
Acceptance: testable sentence plus the test or command that shows it. A fix needs a test that is red before and green after.

## F2 Analysis: <title>

Problem:
Expected: proven cause (repro, log, test or code path with line) and a concrete fix proposal with acceptance.
Board: no interface
Acceptance:

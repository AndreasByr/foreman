Target: dev
Milestone: -
Batch-branch: batch/dev
Urgent: no
Fix-pack: 2026-11-22-block-version
Mode: autopilot

## F1 Fix: Block version in heading and example marker is stale

Problem: `plugins/foreman/skills/foreman-project-mode/references/instruction-block.md` has the heading `# Project instruction block (v2)` while the marker is `<!-- foreman-project-block v3 -->`. `SKILL.md` (section 5) shows the example marker `v2`. Nothing in `scripts/test-project-block.sh` compares them.
Expected: heading and SKILL.md example show v3, and the test fails when heading, marker or example differ.
Hints: same cause for both places (version bump to v3 did not touch the prose). Test reads N from the marker already.
Board: no interface
Acceptance: `bash scripts/test-project-block.sh` is red before the fix (heading/example check) and green after.

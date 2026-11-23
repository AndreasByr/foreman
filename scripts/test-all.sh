#!/usr/bin/env bash
# Runs every foreman test: guard, pre-push hook, mirror, dispatcher check, pretest runner, docs-notion stub, docs rules and docs check, wrapper, dispatcher, installer, privacy scan, rules lint, update.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 template/scripts/test-guard.py
bash template/scripts/test-pre-push.sh
node template/scripts/test-state-mirror.mjs
node template/scripts/test-check-state-touched.mjs
node scripts/test-itsaplan-template.mjs
node template/scripts/test-measure.mjs
node template/scripts/test-autopilot-check.mjs
node template/scripts/test-pretest.mjs
node template/scripts/test-docs-notion.mjs
node template/scripts/test-docs-wiki.mjs
node template/scripts/test-docs-check.mjs
node template/scripts/docs-check.mjs docs/roadmap-0.2.x.md
bash scripts/test-docs-rules.sh
(cd template/tools/delegate && python3 test_run_task.py)
node dispatcher/tests/test-dispatch.mjs
python3 scripts/test-setup-catalog.py
python3 scripts/test-workspace.py
python3 scripts/test-setup-summary.py
python3 scripts/test-project-routing.py
python3 scripts/test-itsaplan-skills.py
bash dispatcher/tests/test-fire-claude.sh
bash scripts/test-install.sh
bash scripts/test-check-config.sh
bash scripts/test-dispatcher-docs.sh
bash scripts/test-update-classes.sh
bash scripts/test-changelog.sh
bash scripts/test-update.sh
bash scripts/test-update-skill.sh
bash scripts/test-project-block.sh
bash scripts/test-state-gate.sh
bash scripts/test-update-docs.sh
bash scripts/privacy-scan.sh
bash scripts/test-plugin.sh
bash scripts/test-wiki-todo.sh
python3 scripts/test-rules.py
node scripts/test-measure-reads.mjs
bash scripts/test-readme.sh
bash scripts/test-rollout.sh
# read amount of a work run must not exceed the 0.2.1 baseline; skipped where the baseline commit is not in the clone (shallow)
if git cat-file -e 9c51ceb^{commit} 2>/dev/null; then
  node scripts/measure-reads.mjs >/dev/null
elif [ -n "${CI:-}" ]; then
  echo "measure-reads: baseline commit 9c51ceb missing in CI (use fetch-depth: 0)" >&2
  exit 1
else
  echo "measure-reads: skipped (baseline commit 9c51ceb not in this clone)"
fi

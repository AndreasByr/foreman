#!/usr/bin/env bash
# Runs every foreman test: guard, pre-push hook, mirror, dispatcher check, pretest runner, docs rules and docs check, wrapper, dispatcher, installer, privacy scan, rules lint.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 template/scripts/test-guard.py
bash template/scripts/test-pre-push.sh
node template/scripts/test-state-mirror.mjs
node template/scripts/test-measure.mjs
node template/scripts/test-autopilot-check.mjs
node template/scripts/test-pretest.mjs
node template/scripts/test-docs-check.mjs
node template/scripts/docs-check.mjs docs/roadmap-0.2.x.md
bash scripts/test-docs-rules.sh
(cd template/tools/delegate && python3 test_run_task.py)
node dispatcher/tests/test-dispatch.mjs
python3 scripts/test-setup-catalog.py
python3 scripts/test-workspace.py
python3 scripts/test-setup-summary.py
bash dispatcher/tests/test-fire-claude.sh
bash scripts/test-install.sh
bash scripts/test-check-config.sh
bash scripts/test-dispatcher-docs.sh
bash scripts/privacy-scan.sh
bash scripts/test-plugin.sh
python3 scripts/test-rules.py

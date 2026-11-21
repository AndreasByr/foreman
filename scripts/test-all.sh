#!/usr/bin/env bash
# Runs every foreman test: guard, pre-push hook, mirror, dispatcher check, pretest runner, wrapper, dispatcher, installer, privacy scan.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 template/scripts/test-guard.py
bash template/scripts/test-pre-push.sh
node template/scripts/test-state-mirror.mjs
node template/scripts/test-autopilot-check.mjs
node template/scripts/test-pretest.mjs
(cd template/tools/delegate && python3 test_run_task.py)
node dispatcher/tests/test-dispatch.mjs
bash scripts/test-install.sh
bash scripts/test-check-config.sh
bash scripts/privacy-scan.sh
bash scripts/test-plugin.sh

#!/usr/bin/env bash
# Runs every foreman test: guard, mirror, wrapper, installer smoke test, privacy scan.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 template/scripts/test-guard.py
node template/scripts/test-state-mirror.mjs
(cd template/tools/delegate && python3 test_run_task.py)
bash scripts/test-install.sh
bash scripts/privacy-scan.sh

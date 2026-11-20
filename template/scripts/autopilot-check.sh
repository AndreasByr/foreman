#!/usr/bin/env bash
# Dispatcher check (no model tokens): prints TASK lines and order texts. Details: scripts/autopilot-check.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/autopilot-check.mjs "$@"

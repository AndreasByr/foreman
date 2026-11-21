#!/usr/bin/env bash
# SessionStart: project setup for cloud sessions (dependencies, local services, migrations).
# Runs that do not code (the hourly delegation) set AUTOPILOT_ROLE=delegation and skip all of it.
set -euo pipefail

[ "${AUTOPILOT_ROLE:-}" = "delegation" ] && exit 0
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Project-specific setup goes below. Keep it idempotent. Examples:
#   pnpm install --frozen-lockfile
#   start a local database, run migrations
#   export test variables via "$CLAUDE_ENV_FILE"
if [ -x scripts/session-setup.local.sh ]; then
  scripts/session-setup.local.sh
fi

#!/usr/bin/env bash
# foreman dispatcher entry point (systemd timer or cron). Loads dispatcher.env when present, then runs dispatch.mjs.
#   dispatch.sh [--dry-run] [--project <name>] [--config <file>] [--no-update]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${FOREMAN_DISPATCHER_ENV:-$DIR/dispatcher.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
exec node "$DIR/dispatch.mjs" "$@"

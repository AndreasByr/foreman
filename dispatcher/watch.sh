#!/usr/bin/env bash
# foreman watcher entry point (systemd timer or cron). Loads dispatcher.env when present, then runs watch.mjs.
#   watch.sh [--config <file>]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${FOREMAN_DISPATCHER_ENV:-$DIR/dispatcher.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
exec node "$DIR/watch.mjs" "$@"

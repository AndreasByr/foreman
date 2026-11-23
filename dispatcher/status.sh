#!/usr/bin/env bash
# foreman dispatcher status: shows the last heartbeat of every module. Exit 1 when any module is not ok.
#   status.sh [--dir <d>] [--config <file>]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${FOREMAN_DISPATCHER_ENV:-$DIR/dispatcher.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
has_config=0
for a in "$@"; do [ "$a" = "--config" ] && has_config=1; done
if [ "$has_config" -eq 0 ]; then
  CONFIG="${FOREMAN_DISPATCHER_CONFIG:-$DIR/config.json}"
  if [ -f "$CONFIG" ]; then set -- "$@" --config "$CONFIG"; fi
fi
exec node "$DIR/heartbeat.mjs" status "$@"

#!/usr/bin/env bash
# fire-claude.example.sh: fire_command for the dispatcher. Starts one foreman work run with Claude Code (`claude -p`).
#
# Use: copy to the machine that runs Claude Code (e.g. ~/fire-claude.sh), set the values in the defaults
# below on the machine that runs the script; with a local `fire_command` the project's `pass_env` can
# supply them instead, over ssh it cannot. Then in dispatcher/config.json:
#   "fire_command": "bash ~/fire-claude.sh"              (local)
#   "fire_command": "ssh myhost bash ~/fire-claude.sh"   (over ssh)
# The order text arrives on stdin. Output goes to stdout/stderr; the dispatcher writes it to its log dir.
#
# Requirements:
# - `claude` is installed and logged in as the machine's user. The script unsets API keys, so the
#   subscription login is used, never an API key.
# - The project's tools/delegate/config.toml keeps `[defaults] claude_login = "inherit"`, so the
#   workers inside the run reuse this login.
# - The dispatcher passes only PATH, HOME, LANG, FOREMAN_PROJECT/KIND/UNIT and, for a local
#   `fire_command` only, the project's `pass_env` variables. Over ssh, edit the defaults below instead.
# - Unattended `claude -p` denies tools that are not allowed. The project's `.claude/settings.json`
#   must allow the commands a work run needs (tests, git on the batch branch);
#   `--permission-mode acceptEdits` only covers file edits.
# - The dispatcher does not watch the run. The lock in STATE.md protects the unit for 3 hours.
#
# Test: bash dispatcher/tests/test-fire-claude.sh (fake claude, nothing real is started).
set -euo pipefail

# Project settings. Edit these defaults on the server copy; an env var set by pass_env wins.
: "${FOREMAN_PROJECT_DIR:=}"        # required: existing directory of the project checkout
: "${FOREMAN_CLAUDE_MODEL:=}"       # required: EXACT model ID, e.g. claude-sonnet-5-5 (no aliases)
# Word splitting of FOREMAN_CLAUDE_FLAGS is intended: put several flags in one string, separated by spaces.
# The value is split at spaces, quotes inside it are NOT interpreted, so use flags without spaces inside a value.
: "${FOREMAN_CLAUDE_FLAGS:=--permission-mode acceptEdits}"

# Use the subscription login of this machine's user, never an API key.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

fail() { echo "fire-claude: $*" >&2; exit 2; }

case "$FOREMAN_CLAUDE_MODEL" in
  "")
    fail "FOREMAN_CLAUDE_MODEL is not set. Set an exact model ID such as claude-sonnet-5-5." ;;
  "<exact-model-id>"|opus|sonnet|haiku|opusplan|default|best)
    fail "FOREMAN_CLAUDE_MODEL='$FOREMAN_CLAUDE_MODEL' is a placeholder or alias. Use an exact model ID such as claude-sonnet-5-5." ;;
esac

[ -n "$FOREMAN_PROJECT_DIR" ] || fail "FOREMAN_PROJECT_DIR is not set."
[ -d "$FOREMAN_PROJECT_DIR" ] || fail "FOREMAN_PROJECT_DIR is not an existing directory: $FOREMAN_PROJECT_DIR"

ORDER="$(cat)"
[ -n "$ORDER" ] || fail "empty order on stdin."

if [ "${FOREMAN_FIRE_DRY:-0}" = 1 ]; then
  echo "would run claude --model $FOREMAN_CLAUDE_MODEL in $FOREMAN_PROJECT_DIR"
  exit 0
fi

cd "$FOREMAN_PROJECT_DIR"
# shellcheck disable=SC2086  # word splitting of FOREMAN_CLAUDE_FLAGS is intended
printf '%s\n' "$ORDER" | claude -p --model "$FOREMAN_CLAUDE_MODEL" $FOREMAN_CLAUDE_FLAGS

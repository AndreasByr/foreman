#!/usr/bin/env bash
# Checks that the dispatcher docs, module docs, learnings and skill rules name the required terms,
# and that the skill carries the rule without its reasoning. Run: bash scripts/test-dispatcher-docs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "dispatcher docs test FAIL: $*"; exit 1; }

# need FILE TERM: FILE must exist and contain TERM (fixed string)
need() {
  [ -f "$1" ] || fail "missing file $1"
  grep -q -F -- "$2" "$1" || fail "$1 does not contain '$2'"
  echo "ok $1 contains '$2'"
}

# forbid FILE TERM: FILE must exist and must not contain TERM (fixed string)
forbid() {
  [ -f "$1" ] || fail "missing file $1"
  if grep -q -F -- "$2" "$1"; then fail "$1 must not contain '$2'"; fi
  echo "ok $1 does not contain '$2'"
}

# dispatcher/README.md
for term in webhook_format pass_env fire_command fire-claude.example.sh mainAutoMerge "PATH, HOME, LANG"; do
  need dispatcher/README.md "$term"
done

# docs/MODULES.md
for term in webhook_format pass_env fire_command mainAutoMerge fire-claude.example.sh; do
  need docs/MODULES.md "$term"
done

# docs/learnings.md
for term in pass_env webhook_format mainAutoMerge; do
  need docs/learnings.md "$term"
done

# skill: the rule only, not the reasoning
need plugins/foreman/skills/foreman-fix/SKILL.md mainAutoMerge
forbid plugins/foreman/skills/foreman-fix/SKILL.md outward-facing

# dispatcher env example
need dispatcher/dispatcher.env.example webhook_format

echo "dispatcher docs tests: ok"

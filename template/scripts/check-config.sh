#!/usr/bin/env bash
# CI guard for the foreman setup: no opusplan, size limits, no committed worker task files.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fail=0

if grep -rqs '"opusplan"\|opusplan' .claude/settings.json .claude/settings.local.json 2>/dev/null; then
  echo "FAIL: opusplan in .claude/settings*.json (autonomous runs never enter plan mode and run on the smaller model)"; fail=1
fi
if grep -vs '^[[:space:]]*#' tools/delegate/config.toml | grep -q 'opusplan'; then
  echo "FAIL: opusplan in tools/delegate/config.toml"; fail=1
fi

size() { wc -c < "$1" | tr -d ' '; }
if [ -f CLAUDE.md ] && [ "$(size CLAUDE.md)" -gt 2600 ]; then
  echo "FAIL: CLAUDE.md is $(size CLAUDE.md) bytes (limit ~2 KB, move details into skills or docs/learnings.md)"; fail=1
fi
skill=.claude/skills/foreman-delegation/SKILL.md
if [ -f "$skill" ]; then
  core=$(awk '/^## Core[[:space:]]*$/{on=1; next} on && /^## /{exit} on{print}' "$skill" | wc -c | tr -d ' ')
  if [ "$core" -gt 1800 ]; then echo "FAIL: Core section of $skill is $core bytes (limit ~1.5 KB)"; fail=1; fi
fi
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  if [ "$(size "$f")" -gt 10240 ]; then
    echo "WARN: $f is $(size "$f") bytes (target ~8 KB, move parts to references/)"
  fi
done

n=$(git ls-files tools/delegate/tasks 2>/dev/null | grep -v '\.gitkeep$' | wc -l | tr -d ' ')
if [ "$n" -gt 0 ]; then echo "FAIL: $n worker task files are committed in tools/delegate/tasks"; fail=1; fi

[ $fail = 0 ] && echo "foreman config check: ok"
exit $fail

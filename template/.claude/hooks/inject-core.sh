#!/usr/bin/env bash
# SessionStart: inject only the "## Core" section of the delegation skill (kept under ~1.5 KB).
# The full skill is read on demand. Keeping this small saves tokens on every start and compaction.
set -euo pipefail
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
skill="$root/.claude/skills/foreman-delegation/SKILL.md"
[ -f "$skill" ] || exit 0
echo "=== foreman core rules (from .claude/skills/foreman-delegation, read the full skill before coding or pushing) ==="
awk '/^## Core[[:space:]]*$/{on=1; next} on && /^## /{exit} on{print}' "$skill"

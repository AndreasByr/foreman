#!/usr/bin/env bash
# STATE.md gate: skills name the update as a gate, templates carry Branch/PR/Next and stay slim.
# Run: bash scripts/test-state-gate.sh
set -euo pipefail
cd "$(dirname "$0")/.."
fail() { echo "state gate: FAIL: $*" >&2; exit 1; }

# 1. The three skills state the gate (installed copy and template).
for base in .claude/skills template/.claude/skills; do
  for s in foreman-delegation foreman-fixpack foreman-milestone; do
    grep -qF 'STATE.md` is current' "$base/$s/SKILL.md" || fail "$base/$s/SKILL.md lacks the State gate line (STATE.md is current)"
  done
done

# 2. State templates: header lines and slim fix pack table.
for d in docs template/docs; do
  for u in fixpacks milestones; do
    f="$d/$u/_TEMPLATE/STATE.md"
    for k in 'Branch:' 'PR:' 'Next:'; do
      head -n 12 "$f" | grep -q "^$k" || fail "$f header lacks '$k'"
    done
  done
  f="$d/fixpacks/_TEMPLATE/STATE.md"
  grep -q '^| # |' "$f" || fail "$f has no points table"
  for col in Areas Board 'Red run' 'Green run'; do
    grep '^| # |' "$f" | grep -qF "$col" && fail "$f table still has column '$col'"
  done
  [ "$(grep '^| # |' "$f" | tr -cd '|' | wc -c)" -le 8 ] || fail "$f table has more than 7 columns"
done

# 3. After-merge step: the rule is named in delegation and pointed to by batch, fix pack and milestone (both bases).
for base in .claude/skills template/.claude/skills; do
  grep -qF 'After-merge step' "$base/foreman-delegation/SKILL.md" || fail "$base/foreman-delegation/SKILL.md lacks the 'After-merge step' rule"
  for s in foreman-batch foreman-fixpack foreman-milestone; do
    grep -qF 'After-merge step' "$base/$s/SKILL.md" || fail "$base/$s/SKILL.md lacks a pointer to the 'After-merge step'"
  done
done

# 4. Project instruction block: the After-merge step rule sits between the markers.
REF=plugins/foreman/skills/foreman-project-mode/references/instruction-block.md
BLOCK=$(sed -n '/<!-- foreman-project-block v/,/<!-- \/foreman-project-block -->/p' "$REF")
grep -qF 'After a merge' <<<"$BLOCK" || fail "$REF: block lacks the 'After a merge' rule"

echo "state gate: ok"

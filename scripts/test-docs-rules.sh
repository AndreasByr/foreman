#!/usr/bin/env bash
# Checks the docs rule file: template/docs/docs-rules.md names the required headings and terms,
# does not duplicate headings of docs/CONVENTIONS.md, is pointed to from there, and is copied
# byte-identical to docs/docs-rules.md. Run: bash scripts/test-docs-rules.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "docs rules test FAIL: $*"; exit 1; }

RULES=template/docs/docs-rules.md
CONV=docs/CONVENTIONS.md
COPY=docs/docs-rules.md

# need FILE TERM: FILE must exist and contain TERM (fixed string)
need() {
  [ -f "$1" ] || fail "missing file $1"
  grep -q -F -- "$2" "$1" || fail "$1 does not contain '$2'"
  echo "ok $1 contains '$2'"
}

# heading FILE HEADING: FILE must exist and contain HEADING as a whole line
heading() {
  [ -f "$1" ] || fail "missing file $1"
  grep -q -x -F -- "$2" "$1" || fail "$1 has no heading '$2'"
  echo "ok $1 has heading '$2'"
}

# 1. the rule file exists
[ -f "$RULES" ] || fail "missing file $RULES"
echo "ok $RULES exists"

# 2. level-2 headings
for h in "## Documents of a project" "## Splitting large documents" "## Stand line" "## Check"; do
  heading "$RULES" "$h"
done

# 3. documents table
need "$RULES" "| Document | Location | Written by | Updated when |"
for term in "docs/requirements.md" "docs/roadmap-" "docs/design.md" "docs/milestones/" "STATE.md" \
            "docs/fixpacks/" "docs/learnings.md" "docs/agent-reports/" "docs/role-reviews/" "docs/changelog/"; do
  need "$RULES" "$term"
done

# 4. splitting large documents
need "$RULES" "docs/requirements/01-"
need "$RULES" "docs/roadmap-<version>/M001-"
need "$RULES" "| File | Content | Read when |"
[ -f "$RULES" ] || fail "missing file $RULES"
grep -q -i -F -- "conflict order" "$RULES" || fail "$RULES does not contain 'conflict order'"
echo "ok $RULES contains 'conflict order' (case-insensitive)"
need "$RULES" "5000 words"

# 5. stand line
need "$RULES" "**Stand:**"
need "$RULES" "one version"
need "$RULES" "docs-check"

# 6. no duplication: no heading of the rule file (level 2 and 3) may occur in CONVENTIONS.md
[ -f "$CONV" ] || fail "missing file $CONV"
while IFS= read -r h; do
  if grep -q -x -F -- "$h" "$CONV"; then
    fail "$CONV duplicates heading from $RULES: '$h'"
  fi
done < <(grep -E '^###? ' "$RULES" || true)
echo "ok no level-2 or level-3 heading of $RULES occurs in $CONV"

# 7. CONVENTIONS.md points to the rule file
need "$CONV" "docs/docs-rules.md"

# 8. docs copy is byte-identical to the template
[ -f "$COPY" ] || fail "missing file $COPY"
cmp -s "$COPY" "$RULES" || fail "docs/docs-rules.md differs from the template"
echo "ok $COPY is identical to $RULES"

# 9. done
echo "docs rules test: ok"

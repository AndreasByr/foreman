#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "update docs test FAIL: $*"
  exit 1
}

# 1. README: chat-skills table row and install.sh --update mention
grep -q '^| `foreman-update`' README.md \
  || fail "README.md has no chat-skills table row starting with | \`foreman-update\`"
grep -qF 'install.sh --update' README.md \
  || fail "README.md does not mention install.sh --update"

# 2. docs/MODULES.md: section "## Updating a project" with required texts below it
[ -f docs/MODULES.md ] || fail "docs/MODULES.md missing"
grep -qxF '## Updating a project' docs/MODULES.md \
  || fail "docs/MODULES.md has no heading '## Updating a project'"
modules_section=$(awk '/^## Updating a project$/ {f=1; next} f && /^## / {exit} f' docs/MODULES.md)
for text in '--update --dry-run' 'update-classes.json' 'mixed' '.foreman.json' '### Upgrade'; do
  printf '%s\n' "$modules_section" | grep -F -- "$text" >/dev/null \
    || fail "docs/MODULES.md section 'Updating a project' does not contain '$text'"
done

# 3. docs/learnings.md: bullets for --update/mixed and for version/last
[ -f docs/learnings.md ] || fail "docs/learnings.md missing"
grep '^- ' docs/learnings.md | grep -F -- '--update' | grep -F 'mixed' >/dev/null \
  || fail "docs/learnings.md has no bullet containing both --update and mixed"
grep '^- ' docs/learnings.md | grep -F 'version' | grep -F 'last' >/dev/null \
  || fail "docs/learnings.md has no bullet containing both version and last"

# 4. Skill must not contain reasons (those live in learnings.md)
skill=plugins/foreman/skills/foreman-update/SKILL.md
[ -f "$skill" ] || fail "$skill missing"
if grep -qF 'Why:' "$skill"; then
  fail "$skill contains 'Why:' (reasons belong in docs/learnings.md)"
fi

# 5. scripts/test-all.sh runs all update-related test scripts
for name in test-update-classes.sh test-changelog.sh test-update.sh \
            test-update-skill.sh test-project-block.sh test-update-docs.sh; do
  grep -qF "bash scripts/$name" scripts/test-all.sh \
    || fail "scripts/test-all.sh does not run 'bash scripts/$name'"
done

echo "update docs: ok"

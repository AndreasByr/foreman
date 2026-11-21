#!/usr/bin/env bash
# Wiki todo: milestone templates, brief skill and milestone skill carry the wiki step; state-mirror copies are identical.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "wiki todo tests: FAIL: $1" >&2; exit 1; }
has() { grep -qF -- "$2" "$1" || fail "$1 lacks: $2"; }

# milestone template: identical in docs/ and template/
diff -r docs/milestones/_TEMPLATE template/docs/milestones/_TEMPLATE >/dev/null || fail "_TEMPLATE differs between docs/ and template/"
for f in docs/milestones/_TEMPLATE/CONTEXT.md template/docs/milestones/_TEMPLATE/CONTEXT.md; do
  has "$f" "Check whether the wiki needs an update"
done
for f in docs/milestones/_TEMPLATE/STATE.md template/docs/milestones/_TEMPLATE/STATE.md; do
  grep -q '^Wiki:' "$f" || fail "$f has no line starting with Wiki:"
done

# brief skill and its template
has plugins/foreman/skills/foreman-brief/SKILL.md "Check whether the wiki needs an update"
has plugins/foreman/skills/foreman-brief/references/brief-template.md "Check whether the wiki needs an update"

# milestone skill, both copies
for f in .claude/skills/foreman-milestone/SKILL.md template/.claude/skills/foreman-milestone/SKILL.md; do
  has "$f" "Wiki:"
  has "$f" "wiki.enabled"
done

# batch skill: both copies run the wiki check and name the Wiki line
for f in .claude/skills/foreman-batch/SKILL.md template/.claude/skills/foreman-batch/SKILL.md; do
  has "$f" "state-mirror.mjs --local"
  has "$f" "Wiki:"
done
cmp -s .claude/skills/foreman-batch/SKILL.md template/.claude/skills/foreman-batch/SKILL.md || fail "foreman-batch SKILL.md differs between .claude/ and template/.claude/"
cmp -s .claude/skills/foreman-milestone/SKILL.md template/.claude/skills/foreman-milestone/SKILL.md || fail "foreman-milestone SKILL.md differs between .claude/ and template/.claude/"

# brief template carries the Wiki line
has plugins/foreman/skills/foreman-brief/references/brief-template.md "Wiki:"

# state-mirror and state lib copies
cmp -s scripts/state-mirror.mjs template/scripts/state-mirror.mjs || fail "state-mirror.mjs differs between scripts/ and template/scripts/"
cmp -s scripts/lib/state.mjs template/scripts/lib/state.mjs || fail "lib/state.mjs differs between scripts/lib/ and template/scripts/lib/"

echo "wiki todo tests: ok"

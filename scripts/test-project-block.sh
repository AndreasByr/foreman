#!/usr/bin/env bash
# Project instruction block: block-status.py reports missing/current/outdated/newer against references/instruction-block.md.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail() { echo "project block: FAIL: $*" >&2; exit 1; }

ROOT=$(pwd)
SKILL=plugins/foreman/skills/foreman-project-mode
SCRIPT="$ROOT/$SKILL/scripts/block-status.py"
REF="$SKILL/references/instruction-block.md"

# Current version N comes from the reference file, never hardcoded.
N=$(sed -n 's/^[[:space:]]*<!-- foreman-project-block v\([0-9][0-9]*\) -->.*/\1/p' "$REF" | head -n1)
[ -n "$N" ] || fail "no version found in $REF"
NEXT=$((N + 1))

# run LABEL STDIN_FILE WANT_OUT WANT_RC [ARGS...]: exact stdout and exit code check.
run() {
  local label=$1 in=$2 want=$3 want_rc=$4 out rc=0
  shift 4
  out=$(python3 "$SCRIPT" "$@" < "$in" 2>"$T/err") || rc=$?
  [ "$out" = "$want" ] || fail "$label: stdout '$out', want '$want' ($(head -c 300 "$T/err"))"
  [ "$rc" = "$want_rc" ] || fail "$label: exit $rc, want $want_rc"
}

# run_err LABEL STDIN_FILE [ARGS...]: stdout must start with 'error:' and exit code must be 2.
run_err() {
  local label=$1 in=$2 out rc=0
  shift 2
  out=$(python3 "$SCRIPT" "$@" < "$in" 2>"$T/err") || rc=$?
  case "$out" in
    error:*) ;;
    *) fail "$label: stdout '$out', want output starting with 'error:'" ;;
  esac
  [ "$rc" = 2 ] || fail "$label: exit $rc, want 2"
}

# Sample texts.
cat > "$T/current.md" <<EOF
Project notes before the block.

    ## Foreman
    <!-- foreman-project-block v$N -->
    Rules of the block.
    <!-- /foreman-project-block -->

Project notes after the block.
EOF

cat > "$T/v0.md" <<'EOF'
    <!-- foreman-project-block v0 -->
    Old rules.
    <!-- /foreman-project-block -->
EOF

cat > "$T/nover.md" <<'EOF'
    <!-- foreman-project-block -->
    Rules without version.
    <!-- /foreman-project-block -->
EOF

cat > "$T/none.md" <<'EOF'
Project notes without any block.
EOF

cat > "$T/newer.md" <<EOF
    <!-- foreman-project-block v$NEXT -->
    Rules of a newer block.
    <!-- /foreman-project-block -->
EOF

cat > "$T/two.md" <<EOF
    <!-- foreman-project-block v$N -->
    First.
    <!-- /foreman-project-block -->
    <!-- foreman-project-block v$N -->
    Second.
    <!-- /foreman-project-block -->
EOF

cat > "$T/unclosed.md" <<EOF
    <!-- foreman-project-block v$N -->
    Rules without closing marker.
EOF

: > "$T/empty.md"
DEVNULL=/dev/null

# 1. Current version, embedded and indented: via file and via stdin.
run "current file" "$DEVNULL" "current v$N" 0 "$T/current.md"
run "current stdin" "$T/current.md" "current v$N" 0 -

# 2. Version 0 is outdated.
run "v0 outdated" "$DEVNULL" "outdated v0 (current is v$N)" 1 "$T/v0.md"

# 3. Opening marker without version counts as v0.
run "no version outdated" "$DEVNULL" "outdated v0 (current is v$N)" 1 "$T/nover.md"

# 4. No marker at all, and empty input: missing.
run "no marker" "$DEVNULL" "missing" 3 "$T/none.md"
run "empty stdin" "$T/empty.md" "missing" 3 -

# 5. Version N+1 is newer.
run "newer" "$DEVNULL" "newer v$NEXT (this skill knows v$N)" 0 "$T/newer.md"

# 6. Two blocks, or an opening marker without closing marker: error.
run_err "two blocks" "$T/two.md" "$T/two.md"
run_err "unclosed" "$T/unclosed.md" "$T/unclosed.md"

# 7. Missing input file: error.
run_err "missing file" "$DEVNULL" "$T/does-not-exist.md"

# 8. Script found from another working directory; result unchanged.
out=$(cd "$T" && python3 "$SCRIPT" "$T/current.md" 2>"$T/err") || rc=$?
rc=${rc:-0}
[ "$out" = "current v$N" ] || fail "other cwd: stdout '$out', want 'current v$N' ($(head -c 300 "$T/err"))"
[ "$rc" = 0 ] || fail "other cwd: exit $rc, want 0"

# 9. Docs mention the script; update skill mentions the up-to-date message.
grep -q 'block-status.py' "$SKILL/SKILL.md" || fail "$SKILL/SKILL.md does not mention block-status.py"
grep -q 'block-status.py' plugins/foreman/skills/foreman-update/SKILL.md || fail "foreman-update/SKILL.md does not mention block-status.py"
grep -q 'Project instructions up to date' plugins/foreman/skills/foreman-update/SKILL.md || fail "foreman-update/SKILL.md does not contain 'Project instructions up to date'"

# 10. Version consistency: the block heading and the skill's example marker must name the current version N.
grep -qxF "# Project instruction block (v$N)" <(head -n1 "$REF") || fail "$REF: first line is not '# Project instruction block (v$N)'"
grep -qF "\`<!-- foreman-project-block v$N -->\`" "$SKILL/SKILL.md" || fail "$SKILL/SKILL.md: example marker in section 5 is not '\`<!-- foreman-project-block v$N -->\`'"
# No stale example marker of another version may remain in the skill.
STALE=$(grep -oE 'foreman-project-block v[0-9]+' "$SKILL/SKILL.md" | sort -u | grep -vxF "foreman-project-block v$N" || true)
[ -z "$STALE" ] || fail "$SKILL/SKILL.md: example marker names another version: $STALE"

# 11. State gate: the block names the STATE.md gate for threads and the coordinator check.
BLOCK=$(sed -n '/<!-- foreman-project-block v/,/<!-- \/foreman-project-block -->/p' "$REF")
grep -qF 'STATE.md` is current' <<<"$BLOCK" || fail "$REF: block lacks the gate '\`STATE.md\` is current'"
grep -qF 'checks that the branch or PR changes `STATE.md`' <<<"$BLOCK" || fail "$REF: block lacks the coordinator check 'checks that the branch or PR changes STATE.md'"
[ "$(wc -c <<<"$BLOCK")" -le 2600 ] || fail "$REF: block is larger than 2600 bytes"

# 12. Standing model rule: the Models section names the standing class, the model parameter and the ids placeholder; no hardcoded model IDs.
MODELS=$(sed -n '/^\*\*Models\*\*/,/^\*\*Fix flow/p' <<<"$BLOCK")
grep -qF 'standing' <<<"$MODELS" || fail "$REF: Models section lacks the word 'standing'"
grep -qF '`model`' <<<"$BLOCK" || fail "$REF: block lacks '\`model\`' (set the model parameter when opening a thread)"
grep -qF '<ids>' <<<"$BLOCK" || fail "$REF: block lacks the '<ids>' placeholder"
grep -q 'claude-' <<<"$BLOCK" && fail "$REF: block hardcodes a 'claude-' model ID; use the <ids> placeholder"
[ "$N" -ge 6 ] || fail "$REF: block version v$N is below v6"
grep -qF 'models.ids' "$SKILL/SKILL.md" || fail "$SKILL/SKILL.md does not mention models.ids"
grep -qF "own words" "$SKILL/SKILL.md" || fail "$SKILL/SKILL.md lacks 'own words' (platform limit text)"
grep -q "own words" docs/WORKFLOW.md || fail "docs/WORKFLOW.md lacks 'own words' (platform limit paragraph)"
grep -q "default model" docs/WORKFLOW.md || fail "docs/WORKFLOW.md lacks 'default model' (platform limit paragraph)"

echo "project block: ok"

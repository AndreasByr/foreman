#!/usr/bin/env bash
# Checks the generic rollout docs in docs/rollout/.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

dir=docs/rollout
readme=$dir/README.md
order=$dir/update-order.md

[ -f "$readme" ] || fail "$readme is missing"
[ -f "$order" ] || fail "$order is missing"

# The per-project files were replaced by the generic update order.
for old in A B C; do
  [ ! -e "$dir/project-$old.md" ] \
    || fail "$dir/project-$old.md must not exist (per-project files are gone)"
done

# section <file> <heading>: prints the lines under a "## " heading
section() {
  awk -v h="$2" '
    $0 == h { on = 1; next }
    /^## / { on = 0 }
    on { print }
  ' "$1"
}

for h in "## Order for Claude Code" "## Checklist outside the repo" \
  "## After the update" "## Go / no-go"; do
  grep -qxF "$h" "$order" || fail "$order: heading '$h' is missing"
done

block=$(section "$order" "## Order for Claude Code")
for c in './install.sh <project path> --update --dry-run' \
  './install.sh <project path> --update' \
  'bash scripts/check-config.sh'; do
  grep -qF -- "$c" <<< "$block" || fail "$order: order block lacks '$c'"
done

check=$(section "$order" "## Checklist outside the repo")
for c in 'foreman-project-mode' 'check-config.sh' 'node scripts/measure.mjs'; do
  grep -qF -- "$c" <<< "$check" || fail "$order: checklist lacks '$c'"
done

grep -Eq '^- \[ \].*Upgrade part' "$order" || fail "$order lacks the Upgrade checkbox"
grep -q '^Installed version:' "$order" || fail "$order: line 'Installed version:' is missing"
grep -q '^Target:' "$order" || fail "$order: line 'Target:' is missing"

grep -q 'foreman-update' "$readme" || fail "$readme: must mention foreman-update"
grep -q 'update-order.md' "$readme" || fail "$readme: must mention update-order.md"

# Privacy: no project letters, no foreign hosts, no absolute home paths, no e-mail patterns
for f in "$readme" "$order"; do
  if grep -Eiq 'project [ABC]\b' "$f"; then
    fail "$f: names a project A, B or C"
  fi

  while IFS= read -r url; do
    host=${url#*://}
    host=${host%%[/:?#]*}
    case "$host" in
      github.com | claude.ai) ;;
      *) fail "$f: URL with foreign host '$host'" ;;
    esac
  done < <(grep -Eo 'https?://[^[:space:])>"`]+' "$f" || true)

  if grep -Eq '/home/|/Users/' "$f"; then
    fail "$f: absolute home path"
  fi
  if grep -Eq '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' "$f"; then
    fail "$f: e-mail pattern"
  fi
done

echo "rollout test: ok"

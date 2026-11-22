#!/usr/bin/env bash
# Checks the rollout orders in docs/rollout/.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

dir=docs/rollout
readme=$dir/README.md

[ -f "$readme" ] || fail "$readme is missing"

# section <file> <heading>: prints the lines under a "## " heading
section() {
  awk -v h="$2" '
    $0 == h { on = 1; next }
    /^## / { on = 0 }
    on { print }
  ' "$1"
}

for x in A B C; do
  f=$dir/project-$x.md
  [ -f "$f" ] || fail "$f is missing"

  for h in "## Order for Claude Code" "## Checklist outside the repo" \
    "## After the update" "## Go / no-go"; do
    grep -qxF "$h" "$f" || fail "$f: heading '$h' is missing"
  done

  first=$(grep -m1 '^# ' "$f" || true)
  [ "$first" = "# Rollout: project $x" ] \
    || fail "$f: first heading must be '# Rollout: project $x'"

  order=$(section "$f" "## Order for Claude Code")
  for c in './install.sh <project path> --update --dry-run' \
    './install.sh <project path> --update' \
    'bash scripts/check-config.sh'; do
    printf '%s\n' "$order" | grep -qF -- "$c" \
      || fail "$f: order block lacks '$c'"
  done

  check=$(section "$f" "## Checklist outside the repo")
  for c in 'foreman-project-mode' 'check-config.sh' 'node scripts/measure.mjs'; do
    printf '%s\n' "$check" | grep -qF -- "$c" \
      || fail "$f: checklist lacks '$c'"
  done

  grep -Eq '^- \[ \].*Upgrade part' "$f" || fail "$f lacks the Upgrade checkbox"
  grep -q '^Installed version:' "$f" || fail "$f: line 'Installed version:' is missing"
  grep -q '^Target:' "$f" || fail "$f: line 'Target:' is missing"
done

# Privacy: no foreign hosts, no absolute home paths, no e-mail patterns
for f in "$readme" "$dir"/project-A.md "$dir"/project-B.md "$dir"/project-C.md; do
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

# README: order C, A, B and C is the go/no-go project
grep -Eq 'project C.*project A.*project B' "$readme" \
  || fail "$readme: must list the order project C, project A, project B"
grep -Eiq 'project C.*go/no-go|go/no-go.*project C' "$readme" \
  || fail "$readme: must say project C is the go/no-go project"

echo "rollout test: ok"

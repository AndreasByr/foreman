#!/usr/bin/env bash
# Tests .githooks/pre-push with synthetic push lines and real repositories. Run: bash scripts/test-pre-push.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "pre-push test FAIL: $*"; exit 1; }
git init -q --bare "$T/remote.git"
git init -q "$T/w" && cd "$T/w"
git config user.email t@example.com && git config user.name t
git remote add origin "$T/remote.git"
echo a > a && git add a && git commit -qm one && A=$(git rev-parse HEAD)
echo b > b && git add b && git commit -qm two && B=$(git rev-parse HEAD)
git checkout -q --orphan other && git rm -qrf . >/dev/null && echo c > c && git add c && git commit -qm other && C=$(git rev-parse HEAD)
Z=0000000000000000000000000000000000000000
hook() { printf '%s\n' "$1" | bash "$HERE/.githooks/pre-push" origin "$T/remote.git" >/dev/null 2>&1; }
ok() { hook "$1" || fail "should allow: $1"; }
no() { hook "$1" && fail "should block: $1" || true; }
ok "refs/heads/dev $B refs/heads/dev $A"
ok "refs/heads/agent/x $B refs/heads/agent/x $Z"
ok "refs/heads/batch/dev $B refs/heads/batch/dev $Z"
no "refs/heads/dev $B refs/heads/main $A"
no "refs/heads/x $B refs/heads/prod $Z"
no "refs/heads/dev $A refs/heads/dev $B"
no "refs/heads/dev $C refs/heads/dev $A"
no "(delete) $Z refs/heads/main $A"
no "(delete) $Z refs/heads/dev $A"
ok "(delete) $Z refs/heads/agent/x $A"
ok "refs/tags/v1 $B refs/tags/v1 $Z"
FOREMAN_PROTECTED=main,prod,release no "refs/heads/dev $B refs/heads/release $Z"
# the real hook through git push
git checkout -q master 2>/dev/null || git checkout -q -b master "$B"
git config core.hooksPath "$HERE/.githooks"
git push -q origin "$B:refs/heads/dev" 2>/dev/null || fail "git push to dev blocked"
if git push -q origin "$B:refs/heads/main" 2>/dev/null; then fail "git push to main went through"; fi
echo "pre-push tests: ok"

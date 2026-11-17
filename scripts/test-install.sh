#!/usr/bin/env bash
# Installer smoke test: fresh repo, repo with existing files, second run is idempotent.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "install test FAIL: $*"; exit 1; }

# 1. fresh repo, all modules
mkdir "$T/a" && git -C "$T/a" init -q
"$HERE/install.sh" "$T/a" --project demo --name "Demo App" --modules ollama,linear,notion,autopilot --session-model test-model-id >/dev/null
for f in CLAUDE.md .foreman.json .claude/settings.json .claude/hooks/guard-git.py tools/delegate/run_task.py \
         scripts/autopilot-check.sh docs/routines/delegation.md .claude/skills/foreman-dispatch-run/SKILL.md; do
  [ -f "$T/a/$f" ] || fail "missing $f"
done
grep -q '{{' "$T/a/CLAUDE.md" && fail "unrendered placeholder in CLAUDE.md"
grep -q '"test-model-id"' "$T/a/.claude/settings.json" || fail "session model not set"
grep -qxF 'tools/delegate/tasks/*' "$T/a/.gitignore" || fail "gitignore entry missing"
(cd "$T/a" && bash scripts/check-config.sh >/dev/null) || fail "check-config failed on fresh install"
(cd "$T/a" && python3 scripts/test-guard.py >/dev/null) || fail "guard tests failed in target"
out=$("$HERE/install.sh" "$T/a" --project demo --modules ollama >/dev/null 2>&1; echo $?)
[ "$out" = 0 ] || fail "second run failed"

# 2. core only: no autopilot files
mkdir "$T/b" && git -C "$T/b" init -q
"$HERE/install.sh" "$T/b" --project core-only >/dev/null 2>&1
[ -f "$T/b/scripts/autopilot-check.sh" ] && fail "autopilot file installed without module"
[ -d "$T/b/docs/routines" ] && fail "routines installed without module"

# 3. existing CLAUDE.md and settings.json with opusplan
mkdir -p "$T/c/.claude" && git -C "$T/c" init -q
echo "# mine" > "$T/c/CLAUDE.md"
echo '{"model":"opusplan","permissions":{"allow":["Bash(ls *)"]}}' > "$T/c/.claude/settings.json"
"$HERE/install.sh" "$T/c" --project mine --session-model test-model-id >/dev/null 2>&1
grep -q '^# mine' "$T/c/CLAUDE.md" || fail "existing CLAUDE.md overwritten"
[ -f "$T/c/CLAUDE.foreman.md" ] || fail "CLAUDE.foreman.md not written"
python3 - "$T/c/.claude/settings.json" <<'PY' || fail "settings merge wrong"
import json,sys
s=json.load(open(sys.argv[1]))
assert s["model"]=="test-model-id", s["model"]
assert "Bash(ls *)" in s["permissions"]["allow"]
assert any("guard-git.py" in h["command"] for e in s["hooks"]["PreToolUse"] for h in e["hooks"])
PY
[ -f "$T/c/.claude/settings.json.before-foreman" ] || fail "settings backup missing"

# 4. opusplan refused
mkdir "$T/d" && ! "$HERE/install.sh" "$T/d" --project x --session-model opusplan >/dev/null 2>&1 || fail "opusplan accepted"

echo "install tests: ok"

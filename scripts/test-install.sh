#!/usr/bin/env bash
# Installer smoke test: fresh repo, module combinations, agents, notion refused, existing files, idempotence, skills.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "install test FAIL: $*"; exit 1; }
inst() { "$HERE/install.sh" "$@"; }
# field of .foreman.json
jf() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); 
for k in sys.argv[2].split("."): d=d[k]
print(json.dumps(d) if isinstance(d,(list,dict)) else d)' "$1" "$2"; }

# 1. fresh repo, everything (itsaplan tracker)
mkdir "$T/a" && git -C "$T/a" init -q
inst "$T/a" --project demo --name "Demo App" --modules delegate,tracker-itsaplan,gateway,autopilot,pretest --session-model test-model-id >/dev/null
for f in CLAUDE.md .foreman.json .claude/settings.json .claude/hooks/guard-git.py tools/delegate/run_task.py tools/gateway/README.md tools/gateway/litellm.config.example.yaml \
         scripts/autopilot-check.sh scripts/autopilot-check.mjs scripts/lib/autopilot-check.mjs scripts/state-mirror.mjs scripts/uat-checklist.mjs scripts/tracker-comment.mjs \
         scripts/pretest-run.mjs scripts/pretest-prepare.sh scripts/pretest/plan-example.json docs/test-login.md docs/trackers.md \
         docs/routines/delegation.md docs/routines/work-run.md .claude/skills/foreman-dispatch-run/SKILL.md .claude/skills/foreman-dispatch-run/references/intervention.md \
         .claude/skills/foreman-pretest/SKILL.md .githooks/pre-push; do
  [ -f "$T/a/$f" ] || fail "missing $f"
done
[ -x "$T/a/.githooks/pre-push" ] || fail "pre-push hook not executable"
[ -x "$T/a/scripts/autopilot-check.sh" ] || fail "autopilot-check.sh not executable"
[ -f "$T/a/docs/routines/pretest.md" ] && fail "old pretest routine installed"
[ -f "$T/a/AGENTS.md" ] && fail "AGENTS.md written for claude-code"
grep -rIl -i 'notion' "$T/a" --exclude-dir=.git >/dev/null 2>&1 && fail "notion mentioned in installed files: $(grep -rIl -i notion "$T/a" --exclude-dir=.git | head -3)"
grep -rq '{{' "$T/a" --exclude-dir=.git && fail "unrendered placeholder: $(grep -rl '{{' "$T/a" --exclude-dir=.git | head -3)"
grep -q '"test-model-id"' "$T/a/.claude/settings.json" || fail "session model not set"
grep -qxF 'tools/delegate/tasks/*' "$T/a/.gitignore" || fail "gitignore entry missing"
[ "$(jf "$T/a/.foreman.json" foreman)" = "$(cat VERSION)" ] || fail "version not $(cat VERSION)"
[ "$(jf "$T/a/.foreman.json" agent)" = "claude-code" ] || fail "agent not recorded"
[ "$(jf "$T/a/.foreman.json" modules)" = '["delegate", "tracker-itsaplan", "gateway", "autopilot", "pretest"]' ] || fail "modules: $(jf "$T/a/.foreman.json" modules)"
[ "$(jf "$T/a/.foreman.json" tracker.type)" = itsaplan ] || fail "tracker type"
[ "$(jf "$T/a/.foreman.json" context.timeZone)" = UTC ] || fail "context.timeZone default"
[ "$(jf "$T/a/.foreman.json" context.releaseDay)" = Friday ] || fail "context.releaseDay default"
python3 - "$T/a/.foreman.json" <<'PY' || fail "foreman.json keys"
import json,sys
d=json.load(open(sys.argv[1]))
for k in ("stagingUrl","devUrl","testTenant","offLimits","language","timeZone","releaseDay","workRun"): assert k in d["context"], k
assert d["mirror"]["itsaplan"]["projectKey"]=="" and "pretest" in d
PY
[ "$(git -C "$T/a" config core.hooksPath)" = .githooks ] || fail "core.hooksPath not set"
(cd "$T/a" && bash scripts/check-config.sh >/dev/null) || fail "check-config failed on fresh install"
(cd "$T/a" && python3 scripts/test-guard.py >/dev/null) || fail "guard tests failed in target"
(cd "$T/a" && node scripts/test-state-mirror.mjs >/dev/null && node scripts/test-autopilot-check.mjs >/dev/null && node scripts/test-pretest.mjs >/dev/null && bash scripts/test-pre-push.sh >/dev/null) || fail "template tests failed in target"
(cd "$T/a" && node scripts/state-mirror.mjs --help >/dev/null && node scripts/pretest-run.mjs 2>/dev/null; [ $? = 2 ]) || fail "pretest-run usage exit"
(cd "$T/a" && python3 tools/delegate/test_run_task.py >/dev/null) || fail "delegate tests failed in target"
out=$(inst "$T/a" --project demo --modules delegate,tracker-itsaplan,gateway,autopilot,pretest >/dev/null 2>&1; echo $?)
[ "$out" = 0 ] || fail "second run failed"

# 2. core only: no autopilot, no pretest files, tracker none
mkdir "$T/b" && git -C "$T/b" init -q
inst "$T/b" --project core-only >/dev/null 2>&1
for f in scripts/autopilot-check.sh scripts/autopilot-check.mjs scripts/pretest-run.mjs docs/test-login.md tools/gateway/README.md AGENTS.md; do
  [ -e "$T/b/$f" ] && fail "$f installed without its module"
done
[ -d "$T/b/docs/routines" ] && fail "routines installed without module"
[ "$(jf "$T/b/.foreman.json" tracker.type)" = none ] || fail "tracker none expected"
[ -f "$T/b/scripts/state-mirror.mjs" ] || fail "state-mirror missing in core"
(cd "$T/b" && node scripts/test-state-mirror.mjs >/dev/null && bash scripts/check-config.sh >/dev/null) || fail "core-only template tests failed"

# 3. every module combination installs and renders
n=0
for tr in "" tracker-itsaplan tracker-linear; do
  for extra in "" delegate gateway pretest autopilot "delegate,gateway,pretest,autopilot"; do
    mods=$(printf '%s\n' "$tr" $(echo "$extra" | tr ',' ' ') | awk 'NF' | paste -sd, -)
    d="$T/combo$n"; n=$((n+1)); mkdir "$d" && git -C "$d" init -q
    inst "$d" --project combo --modules "$mods" --session-model m >/dev/null 2>&1 || fail "combination '$mods' failed"
    grep -rq '{{' "$d" --exclude-dir=.git && fail "placeholder left for '$mods'"
    (cd "$d" && bash scripts/check-config.sh >/dev/null) || fail "check-config failed for '$mods'"
  done
done

# 4. notion refused, exclusive trackers, unknown module, bad agent
mkdir "$T/n"
err=$(inst "$T/n" --project x --modules notion 2>&1 >/dev/null) && fail "notion accepted" || true
echo "$err" | grep -q "notion was removed in 0.2" || fail "notion message: $err"
inst "$T/n" --project x --modules tracker-itsaplan,tracker-linear >/dev/null 2>&1 && fail "both trackers accepted" || true
inst "$T/n" --project x --modules bogus >/dev/null 2>&1 && fail "unknown module accepted" || true
inst "$T/n" --project x --agent nope >/dev/null 2>&1 && fail "bad agent accepted" || true
inst "$T/n" --project x --modules autopilot --scope docs >/dev/null 2>&1 && fail "autopilot with scope docs accepted" || true
inst "$T/n" --project x --recommended-skills all --skills-scope nowhere >/dev/null 2>&1 && fail "bad skills scope accepted" || true

# 5. agents: opencode and other get AGENTS.md and the git guard
for ag in opencode other; do
  mkdir "$T/$ag" && git -C "$T/$ag" init -q
  inst "$T/$ag" --project p --agent $ag --modules autopilot >/dev/null 2>&1 || fail "agent $ag failed"
  [ -f "$T/$ag/AGENTS.md" ] || fail "AGENTS.md missing for $ag"
  grep -q "Agent: $ag" "$T/$ag/AGENTS.md" || fail "AGENTS.md does not name the agent"
  grep -q ".githooks/pre-push" "$T/$ag/AGENTS.md" || fail "AGENTS.md misses the git guard"
  [ "$(jf "$T/$ag/.foreman.json" agent)" = "$ag" ] || fail "agent not recorded for $ag"
  [ -x "$T/$ag/.githooks/pre-push" ] || fail "pre-push missing for $ag"
done

# 6. scope docs and repo work without remote, server or deploy
mkdir "$T/docs" && git -C "$T/docs" init -q
inst "$T/docs" --project d --scope docs >/dev/null 2>&1 || fail "scope docs failed"
[ -f "$T/docs/docs/versioning.md" ] && [ ! -d "$T/docs/scripts" ] || fail "scope docs layout"
git -C "$T/docs" remote | grep -q . && fail "unexpected remote"
mkdir "$T/repo" && git -C "$T/repo" init -q
inst "$T/repo" --project r --scope repo >/dev/null 2>&1 || fail "scope repo failed"
(cd "$T/repo" && git config user.email t@e.com && git config user.name t && git add -A && git commit -qm init && git checkout -q -b dev && node scripts/state-mirror.mjs --local | grep -q "tracker none") || fail "local repo without remote does not work"

# 7. existing CLAUDE.md and settings.json with opusplan
mkdir -p "$T/c/.claude" && git -C "$T/c" init -q
echo "# mine" > "$T/c/CLAUDE.md"
echo '{"model":"opusplan","permissions":{"allow":["Bash(ls *)"]}}' > "$T/c/.claude/settings.json"
inst "$T/c" --project mine --session-model test-model-id >/dev/null 2>&1
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

# 8. opusplan refused
mkdir "$T/d" && ! inst "$T/d" --project x --session-model opusplan >/dev/null 2>&1 || fail "opusplan accepted"

# 9. recommended skills: nothing without flag and terminal; with the flag the commands run (stub npx and git)
mkdir "$T/bin" && for c in npx git; do
  real=$(command -v $c)
  cat > "$T/bin/$c" <<STUB
#!/usr/bin/env bash
if [ "$c" = git ] && [ "\${1:-}" != clone ]; then exec "$real" "\$@"; fi
echo "$c \$*" >> "$T/stub.log"
STUB
  chmod +x "$T/bin/$c"
done
mkdir "$T/s1" && git -C "$T/s1" init -q
PATH="$T/bin:$PATH" inst "$T/s1" --project s >/dev/null 2>&1 < /dev/null
[ ! -s "$T/stub.log" ] 2>/dev/null || fail "skills installed without confirmation"
mkdir "$T/s2" && git -C "$T/s2" init -q
PATH="$T/bin:$PATH" inst "$T/s2" --project s --recommended-skills all --skills-scope project >/dev/null 2>&1
grep -q "npx skills add petergyang/no-ai-slop --skill no-ai-slop$" "$T/stub.log" || fail "no-ai-slop project command missing"
grep -q "git clone https://github.com/blader/humanizer.git .claude/skills/humanizer" "$T/stub.log" || fail "humanizer clone missing"
grep -q "npx skills add nutlope/hallmark$" "$T/stub.log" || fail "hallmark missing"
grep -q "npx skills add jakubkrehel/skills$" "$T/stub.log" || fail "better-* missing"
: > "$T/stub.log"
mkdir "$T/s3" && git -C "$T/s3" init -q
PATH="$T/bin:$PATH" inst "$T/s3" --project s --recommended-skills no-ai-slop,hallmark --skills-scope global >/dev/null 2>&1
[ "$(wc -l < "$T/stub.log")" = 2 ] || fail "list selection ran $(wc -l < "$T/stub.log") commands"
grep -q "no-ai-slop --skill no-ai-slop -g" "$T/stub.log" && grep -q "nutlope/hallmark -g" "$T/stub.log" || fail "global commands wrong"
: > "$T/stub.log"
mkdir "$T/s4" && git -C "$T/s4" init -q
out=$(PATH="$T/bin:$PATH" inst "$T/s4" --project s --recommended-skills all --skills-scope global --dry-run 2>&1)
[ ! -s "$T/stub.log" ] || fail "dry run executed skill commands"
echo "$out" | grep -q "would run (global) npx skills add jakubkrehel/skills -g" || fail "dry run does not print commands"
none=$(inst "$T/s4" --project s --recommended-skills none --dry-run 2>&1); echo "$none" | grep -q "skills:" && fail "none printed skills" || true
python3 -c 'import json; d=json.load(open("'"$HERE"'/skills.recommended.json")); assert {s["name"] for s in d["skills"]}=={"no-ai-slop","humanizer","hallmark","better-ui"}; assert all(s["repo"].startswith("https://github.com/") and s["purpose"] and s["install_global"] and s["install_project"] for s in d["skills"])' || fail "skills.recommended.json shape"

# 10. ChatGPT via gateway needs the explicit consent option
mkdir "$T/g1" && git -C "$T/g1" init -q
inst "$T/g1" --project g --modules delegate,gateway >/dev/null 2>&1 || fail "gateway install without chatgpt option failed"
[ -e "$T/g1/tools/gateway/litellm.chatgpt.example.yaml" ] && fail "chatgpt file installed without consent"
grep -rEq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/g1/tools" && fail "chatgpt model installed without consent: $(grep -rEl '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/g1/tools" | head -3)"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/g1/tools/gateway/litellm.config.example.yaml" && fail "neutral gateway config contains chatgpt model"

mkdir "$T/g2" && git -C "$T/g2" init -q
inst "$T/g2" --project g --modules delegate,gateway --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 || fail "chatgpt option with accepted-risk failed"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/g2/tools/gateway/litellm.chatgpt.example.yaml" || fail "chatgpt example file has no chatgpt model"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/g2/tools/gateway/litellm.config.example.yaml" && fail "neutral gateway config contains chatgpt model with option"

mkdir "$T/g3" && git -C "$T/g3" init -q
inst "$T/g3" --project g --modules delegate,gateway --chatgpt-via-gateway yes >/dev/null 2>&1 && fail "chatgpt option value 'yes' accepted" || true
mkdir "$T/g4" && git -C "$T/g4" init -q
inst "$T/g4" --project g --modules delegate,gateway --chatgpt-via-gateway "" >/dev/null 2>&1 && fail "empty chatgpt option value accepted" || true
mkdir "$T/g5" && git -C "$T/g5" init -q
inst "$T/g5" --project g --modules delegate --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 && fail "chatgpt option accepted without module gateway" || true

echo "install tests: ok"

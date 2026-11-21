#!/usr/bin/env bash
# Installer smoke test: fresh repo, module combinations, agents, docs-notion module, existing files, idempotence, skills.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap '[ -z "${GW_PID:-}" ] || kill "$GW_PID" 2>/dev/null || true; [ -z "${EXTRA_PIDS:-}" ] || kill $EXTRA_PIDS 2>/dev/null || true; rm -rf "$T"' EXIT
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

# 4. exclusive trackers, unknown module, bad agent
mkdir "$T/n"
inst "$T/n" --project x --modules tracker-itsaplan,tracker-linear >/dev/null 2>&1 && fail "both trackers accepted" || true
inst "$T/n" --project x --modules bogus >/dev/null 2>&1 && fail "unknown module accepted" || true
inst "$T/n" --project x --agent nope >/dev/null 2>&1 && fail "bad agent accepted" || true
inst "$T/n" --project x --modules autopilot --scope docs >/dev/null 2>&1 && fail "autopilot with scope docs accepted" || true
inst "$T/n" --project x --recommended-skills all --skills-scope nowhere >/dev/null 2>&1 && fail "bad skills scope accepted" || true

# 4b. docs-notion module: installs with its config block; old name refused with a hint to the new name
mkdir "$T/dn1" && git -C "$T/dn1" init -q
inst "$T/dn1" --project p --modules docs-notion >/dev/null 2>&1 || fail "docs-notion install failed"
python3 - "$T/dn1/.foreman.json" <<'PY' || fail "docs-notion: modules or docsNotion block wrong"
import json, sys
d = json.load(open(sys.argv[1]))
assert "docs-notion" in d["modules"], d["modules"]
dn = d.get("docsNotion")
assert isinstance(dn, dict), "no docsNotion object"
assert dn.get("rootPageId") == "", dn
assert dn.get("include") == ["docs/**/*.md"], dn
assert isinstance(dn.get("exclude"), list), dn
PY
[ -f "$T/dn1/scripts/docs-notion.mjs" ] || fail "docs-notion: scripts/docs-notion.mjs missing"
(cd "$T/dn1" && bash scripts/check-config.sh >/dev/null) || fail "docs-notion: check-config failed"

# docs-notion absent by default: no module files, no docsNotion key
mkdir "$T/dn0" && git -C "$T/dn0" init -q
inst "$T/dn0" --project p >/dev/null 2>&1 || fail "default install failed"
[ -e "$T/dn0/scripts/docs-notion.mjs" ] && fail "docs-notion.mjs installed without its module" || true
[ -e "$T/dn0/scripts/lib/docs-notion.mjs" ] && fail "lib/docs-notion.mjs installed without its module" || true
python3 - "$T/dn0/.foreman.json" <<'PY' || fail "docsNotion key written without the module"
import json, sys
assert "docsNotion" not in json.load(open(sys.argv[1]))
PY

# docs-notion combined with other modules installs fine
for mods in docs-notion,delegate docs-notion,tracker-itsaplan; do
  d="$T/dnc-$(echo "$mods" | tr ',' '_')"; mkdir "$d" && git -C "$d" init -q
  inst "$d" --project p --modules "$mods" >/dev/null 2>&1 || fail "combination '$mods' failed"
done

# unknown module still refused
mkdir "$T/dnu" && git -C "$T/dnu" init -q
inst "$T/dnu" --project p --modules docs-notion,bogus >/dev/null 2>&1 && fail "unknown module with docs-notion accepted" || true

# old name refused with exit nonzero and a hint to docs-notion
mkdir "$T/dno" && git -C "$T/dno" init -q; rc=0
err=$(inst "$T/dno" --project p --modules notion 2>&1) || rc=$?
[ "$rc" != 0 ] || fail "old module name 'notion' accepted"
echo "$err" | grep -q 'docs-notion' || fail "old module name 'notion': message lacks docs-notion: $err"

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

# 10. --workspace <file>: infra block copied into .foreman.json, invalid or key-like files refused
WS="$HERE/docs/workspace.example.json"
[ -f "$WS" ] || fail "docs/workspace.example.json missing"
cp "$WS" "$T/ws-ok.json"
mkdir "$T/w" && git -C "$T/w" init -q
inst "$T/w" --project w --workspace "$T/ws-ok.json" >/dev/null 2>&1 || fail "--workspace install failed"
python3 - "$T/w/.foreman.json" "$T/ws-ok.json" <<'PY' || fail "infra block does not equal workspace file"
import json,sys
d=json.load(open(sys.argv[1])); w=json.load(open(sys.argv[2]))
assert d["infra"]==w, "infra differs"
PY
[ "$(jf "$T/w/.foreman.json" infra.gateway.running)" = yes ] || fail "infra.gateway.running not yes"
[ "$(jf "$T/w/.foreman.json" foreman)" = "$(cat "$HERE/VERSION")" ] || fail "version changed with --workspace"
[ "$(jf "$T/w/.foreman.json" tracker.type)" = none ] || fail "tracker type changed with --workspace"
# without --workspace there is no infra key
mkdir "$T/w2" && git -C "$T/w2" init -q
inst "$T/w2" --project w >/dev/null 2>&1 || fail "install without --workspace failed"
python3 - "$T/w2/.foreman.json" <<'PY' || fail "infra written without --workspace"
import json,sys
assert "infra" not in json.load(open(sys.argv[1]))
PY
# invalid workspace file (extra top-level field) is refused, nothing written
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["bogus"]=1; json.dump(d,open(sys.argv[2],"w"))' "$WS" "$T/ws-bogus.json"
mkdir "$T/w3" && git -C "$T/w3" init -q
err=$(inst "$T/w3" --project w --workspace "$T/ws-bogus.json" 2>&1) && fail "invalid workspace accepted" || true
echo "$err" | grep -qi workspace || fail "invalid workspace message: $err"
[ -e "$T/w3/.foreman.json" ] && fail ".foreman.json written despite invalid workspace" || true
# key-like value inside ai is refused, and the value is not echoed
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d.setdefault("ai",{})["other"]=["sk-" + "ant-abcdefghijklmnop12345"]; json.dump(d,open(sys.argv[2],"w"))' "$WS" "$T/ws-key.json"
mkdir "$T/w4" && git -C "$T/w4" init -q
err=$(inst "$T/w4" --project w --workspace "$T/ws-key.json" 2>&1) && fail "key-like workspace value accepted" || true
echo "$err" | grep -qi workspace || fail "key-like workspace message: $err"
echo "$err" | grep -q 'sk-ant' && fail "key value echoed in message" || true
[ -e "$T/w4/.foreman.json" ] && fail ".foreman.json written despite key-like value" || true
# nonexistent workspace file is refused with a workspace message
mkdir "$T/w5" && git -C "$T/w5" init -q
err=$(inst "$T/w5" --project w --workspace "$T/does-not-exist.json" 2>&1) && fail "missing workspace file accepted" || true
echo "$err" | grep -qi workspace || fail "missing workspace file message: $err"
# second run with the same --workspace keeps the existing .foreman.json
cp "$T/w/.foreman.json" "$T/fj.before"
out=$(inst "$T/w" --project w --workspace "$T/ws-ok.json" 2>&1) || fail "second run with --workspace failed"
echo "$out" | grep -q 'kept.*\.foreman\.json' || fail "second run did not keep .foreman.json"
cmp -s "$T/fj.before" "$T/w/.foreman.json" || fail ".foreman.json changed on second run"

# 11. gateway preset: --gateway-url, --fallback-model, --chatgpt-via-gateway; stub gateway on 127.0.0.1
# The fake key is assembled at runtime so no key-like literal sits in this file.
GW_KEY_HEAD="sk-test"; GW_KEY_TAIL="value0123456789abcdef"
export FOREMAN_GATEWAY_KEY="$GW_KEY_HEAD$GW_KEY_TAIL"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'; }
wait_port() {
  for _ in $(seq 100); do
    python3 -c 'import socket,sys; socket.create_connection(("127.0.0.1",int(sys.argv[1])),1).close()' "$1" >/dev/null 2>&1 && return 0
    sleep 0.1
  done
  return 1
}
GW_PORT=$(free_port)
GW_URL="http://127.0.0.1:$GW_PORT"
mkdir "$T/gw"
# stub gateway: 200 on /health/liveliness, 404 elsewhere; mode "redirect" answers 302 to another port instead
cat > "$T/gw-stub.py" <<'PY'
import http.server, sys
mode, port = sys.argv[1], int(sys.argv[2])
other = sys.argv[3] if len(sys.argv) > 3 else ""
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") == "/health/liveliness":
            if mode == "redirect":
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{other}/health/liveliness")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            body = b'"alive"'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()
    def log_message(self, *a):
        pass
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
PY
python3 "$T/gw-stub.py" ok "$GW_PORT" >/dev/null 2>&1 &
GW_PID=$!
wait_port "$GW_PORT" || fail "stub gateway did not answer on $GW_URL"

# case 1: reachable stub, no ChatGPT target without consent
mkdir "$T/g1" && git -C "$T/g1" init -q
out=$(inst "$T/g1" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model 2>&1) || fail "gateway preset install failed: $out"
G1="$T/g1/tools/delegate/config.toml"
echo "$out" | grep -q 'gateway dry-run: ok' || fail "gateway dry-run not ok: $out"
grep -qE '^[[:space:]]*# foreman: gateway preset, reachability checked: yes[[:space:]]*$' "$G1" || fail "reachability line (yes) missing"
python3 - "$G1" "$GW_URL" <<'PY' || fail "gateway preset config wrong (see above)"
import sys, tomllib
d = tomllib.load(open(sys.argv[1], "rb"))
gw = d.get("gateway")
assert isinstance(gw, dict), "no active [gateway] table"
assert gw.get("base_url") == sys.argv[2], gw
assert gw.get("api_key_env") == "FOREMAN_GATEWAY_KEY", gw
assert gw.get("fallback_model") == "claude/test-model", gw
assert d["meta"]["active"] == "gateway", d["meta"]
roles = d["roles"]
for r in ("research", "execution_simple", "completion", "subagent"):
    want = "gateway/task-research" if r == "research" else "gateway/task-simple"
    assert roles[r]["model"] == want, (r, roles[r])
for r in ("planning", "validation"):
    assert roles[r]["model"].startswith("claude/"), (r, roles[r])
PY
! grep -vE '^[[:space:]]*#' "$G1" | grep -qE 'task-(normal|complex|testing)' || fail "ChatGPT target active without consent"
grep -rqF -- "$FOREMAN_GATEWAY_KEY" "$T/g1" && fail "gateway key value written into the target" || true

# case 2: same with ChatGPT consent: execution goes to task-normal, task-complex stays off
mkdir "$T/g2" && git -C "$T/g2" init -q
out=$(inst "$T/g2" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model --chatgpt-via-gateway accepted-risk 2>&1) || fail "accepted-risk install failed: $out"
G2="$T/g2/tools/delegate/config.toml"
python3 - "$G2" <<'PY' || fail "execution role not gateway/task-normal"
import sys, tomllib
d = tomllib.load(open(sys.argv[1], "rb"))
assert d["roles"]["execution"]["model"] == "gateway/task-normal", d["roles"]["execution"]
PY
! grep -vE '^[[:space:]]*#' "$G2" | grep -q 'task-complex' || fail "task-complex active with accepted-risk"

# case 3: unreachable gateway: installs, marks the check as not done
mkdir "$T/g3" && git -C "$T/g3" init -q
out=$(inst "$T/g3" --project g --modules delegate --session-model m --gateway-url http://127.0.0.1:1 --fallback-model claude/test-model 2>&1) || fail "unreachable gateway install failed: $out"
echo "$out" | grep -q unreachable || fail "no 'unreachable' message: $out"
grep -qE '^[[:space:]]*# foreman: gateway preset, reachability checked: no[[:space:]]*$' "$T/g3/tools/delegate/config.toml" || fail "reachability line (no) missing"
echo "$out" | grep -q 'gateway dry-run: ok' && fail "dry-run reported ok for an unreachable gateway" || true

# case 4: refused with exit 2, a gateway message, and nothing written under tools/
gw_refused() {
  local label="$1" d="$T/gwref-$1" rc=0 err; shift
  mkdir "$d" && git -C "$d" init -q
  err=$(inst "$d" --project g "$@" 2>&1) || rc=$?
  [ "$rc" = 2 ] || fail "refusal $label ('$*'): exit $rc, expected 2"
  echo "$err" | grep -q gateway || fail "refusal $label: no gateway message: $err"
  [ ! -e "$d/tools" ] || fail "refusal $label wrote tools/"
}
gw_refused ftp --gateway-url ftp://x --fallback-model claude/test-model
gw_refused plainhttp --gateway-url http://example.com --fallback-model claude/test-model
gw_refused nofallback --gateway-url "$GW_URL"
gw_refused badconsent --gateway-url "$GW_URL" --fallback-model claude/test-model --chatgpt-via-gateway yes

# case 5: --gateway-url without --modules delegate adds delegate and gateway itself
mkdir "$T/g5" && git -C "$T/g5" init -q
out=$(inst "$T/g5" --project g --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model 2>&1) || fail "gateway without --modules failed: $out"
echo "$out" | grep -i 'note' | grep -qi gateway || fail "no note about gateway modules: $out"
python3 - "$T/g5/.foreman.json" <<'PY' || fail "modules lack delegate or gateway"
import json, sys
m = json.load(open(sys.argv[1]))["modules"]
assert "delegate" in m and "gateway" in m, m
PY

# case 6: defaults from a workspace file (accepted-risk and declined)
python3 - "$HERE/docs/workspace.example.json" "$T/ws-gw-accepted.json" "$GW_URL" accepted-risk <<'PY'
import json, sys
src, dst, url, choice = sys.argv[1:5]
d = json.load(open(src))
d["gateway"]["url"] = url
d["gateway"]["keyEnv"] = "FOREMAN_GATEWAY_KEY"
d["chatgptViaGateway"] = choice
json.dump(d, open(dst, "w"), indent=2)
PY
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["chatgptViaGateway"]="declined"; json.dump(d,open(sys.argv[2],"w"),indent=2)' "$T/ws-gw-accepted.json" "$T/ws-gw-declined.json"
mkdir "$T/g6" && git -C "$T/g6" init -q
out=$(inst "$T/g6" --project g --modules delegate --session-model m --workspace "$T/ws-gw-accepted.json" --fallback-model claude/test-model 2>&1) || fail "workspace gateway defaults failed: $out"
python3 - "$T/g6/tools/delegate/config.toml" "$GW_URL" <<'PY' || fail "workspace defaults not applied (accepted-risk)"
import sys, tomllib
d = tomllib.load(open(sys.argv[1], "rb"))
assert d["gateway"]["base_url"] == sys.argv[2], d["gateway"]
assert d["roles"]["execution"]["model"] == "gateway/task-normal", d["roles"]["execution"]
PY
mkdir "$T/g6d" && git -C "$T/g6d" init -q
out=$(inst "$T/g6d" --project g --modules delegate --session-model m --workspace "$T/ws-gw-declined.json" --fallback-model claude/test-model 2>&1) || fail "workspace declined install failed: $out"
! grep -vE '^[[:space:]]*#' "$T/g6d/tools/delegate/config.toml" | grep -q 'task-normal' || fail "task-normal active with chatgptViaGateway declined"

# case 7: idempotence; without --force config.toml stays byte-identical, with --force one [gateway] table
mkdir "$T/g7" && git -C "$T/g7" init -q
inst "$T/g7" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model >/dev/null 2>&1 || fail "idempotence: first run failed"
cp "$T/g7/tools/delegate/config.toml" "$T/g7-before.toml"
inst "$T/g7" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model >/dev/null 2>&1 || fail "idempotence: second run failed"
cmp -s "$T/g7-before.toml" "$T/g7/tools/delegate/config.toml" || fail "config.toml changed without --force"
inst "$T/g7" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model --force >/dev/null 2>&1 || fail "idempotence: --force run failed"
[ "$(grep -cE '^\[gateway\][[:space:]]*$' "$T/g7/tools/delegate/config.toml")" = 1 ] || fail "--force left not exactly one [gateway] table"

# ---- rework round 2 ----
valid_toml() { python3 -c 'import sys,tomllib; tomllib.load(open(sys.argv[1],"rb"))' "$1" 2>/dev/null; }
TPL_CFG="$HERE/template/tools/delegate/config.toml"
GWM="--fallback-model claude/test-model"
LIVE_NO='^[[:space:]]*# foreman: gateway preset, reachability checked: no[[:space:]]*$'
LIVE_YES='^[[:space:]]*# foreman: gateway preset, reachability checked: yes[[:space:]]*$'

# R1: strict URL check, installer and script agree
HEX40=$(python3 -c 'import os; print(os.urandom(20).hex())')
n=0
for bad in 'https://gw.example.com/a"b' 'https://gw.example.com/a\q' 'https://gw.example.com/?token=XYZ' 'https://gw.example.com/#x' \
           'https://.' 'https://gw.example.com:99999' "https://gw.example.com/$HEX40"; do
  n=$((n+1)); d="$T/r1-$n"; mkdir "$d" && git -C "$d" init -q; rc=0
  err=$(inst "$d" --project g --gateway-url "$bad" $GWM 2>&1) || rc=$?
  [ "$rc" = 2 ] || fail "R1 '$bad': exit $rc, expected 2"
  echo "$err" | grep -q gateway || fail "R1 '$bad': no gateway message: $err"
  echo "$err" | grep -qF "$HEX40" && fail "R1 '$bad': message echoes the secret-like segment" || true
  [ ! -e "$d/tools" ] || fail "R1 '$bad': wrote tools/"
  [ ! -e "$d/.foreman.json" ] || fail "R1 '$bad': wrote .foreman.json"
done
mkdir "$T/r1-script" && cp "$TPL_CFG" "$T/r1-script/config.toml" && cp "$TPL_CFG" "$T/r1-script/orig.toml"
rc=0; python3 "$HERE/scripts/gateway-preset.py" "$T/r1-script/config.toml" --url 'https://gw.example.com/a"b' --key-env FOREMAN_GATEWAY_KEY --fallback-model claude/x >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "R1 script: exit $rc, expected 2"
cmp -s "$T/r1-script/config.toml" "$T/r1-script/orig.toml" || fail "R1 script changed the config on a bad URL"
mkdir "$T/r1-ok" && git -C "$T/r1-ok" init -q
inst "$T/r1-ok" --project g --gateway-url "$GW_URL/v1" $GWM --dry-run >/dev/null 2>&1 || fail "R1: /v1 path refused"

# R2: --scope docs with a gateway URL
mkdir "$T/r2" && git -C "$T/r2" init -q; rc=0
err=$(inst "$T/r2" --project g --scope docs --gateway-url "$GW_URL" $GWM 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "R2: exit $rc, expected 2"
echo "$err" | grep -q gateway || fail "R2: no gateway message: $err"
[ -z "$(ls -A "$T/r2" | grep -v '^\.git$' || true)" ] || fail "R2: wrote files: $(ls -A "$T/r2")"

# R3: consent value handling
mkdir "$T/r3a" && git -C "$T/r3a" init -q
inst "$T/r3a" --project g --modules delegate --session-model m --workspace "$T/ws-gw-accepted.json" $GWM --chatgpt-via-gateway declined >/dev/null 2>&1 || fail "R3: declined refused"
valid_toml "$T/r3a/tools/delegate/config.toml" || fail "R3a: config.toml is not valid TOML"
! grep -vE '^[[:space:]]*#' "$T/r3a/tools/delegate/config.toml" | grep -q 'task-normal' || fail "R3: declined did not override workspace accepted-risk"
mkdir "$T/r3b" && git -C "$T/r3b" init -q; rc=0
inst "$T/r3b" --project g --modules delegate --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "R3: accepted-risk without gateway URL: exit $rc, expected 2"
python3 - "$T/ws-gw-accepted.json" "$T/ws-gw-off.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["gateway"]["running"] = "no"; d["chatgptViaGateway"] = "accepted-risk"
json.dump(d, open(sys.argv[2], "w"), indent=2)
PY
mkdir "$T/r3c" && git -C "$T/r3c" init -q
inst "$T/r3c" --project g --modules delegate --session-model m --workspace "$T/ws-gw-off.json" $GWM >/dev/null 2>&1 || fail "R3: workspace with gateway.running no failed"
cmp -s "$T/r3c/tools/delegate/config.toml" "$TPL_CFG" || fail "R3: preset written although gateway.running is no"
valid_toml "$T/r3c/tools/delegate/config.toml" || fail "R3c: config.toml is not valid TOML"
mkdir "$T/r3d" && git -C "$T/r3d" init -q; rc=0
inst "$T/r3d" --project g --gateway-url "$GW_URL" $GWM --chatgpt-via-gateway yes >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "R3: consent 'yes': exit $rc, expected 2"

# R4: probe needs a 200 on /health/liveliness; no redirects; no proxies
P404=$(free_port); python3 -m http.server "$P404" --bind 127.0.0.1 --directory "$T/gw" >/dev/null 2>&1 &
EXTRA_PIDS="${EXTRA_PIDS:-} $!"
P302=$(free_port); python3 "$T/gw-stub.py" redirect "$P302" "$GW_PORT" >/dev/null 2>&1 &
EXTRA_PIDS="$EXTRA_PIDS $!"
wait_port "$P404" || fail "R4: 404 server did not start"
wait_port "$P302" || fail "R4: 302 server did not start"
mkdir "$T/r4a" && git -C "$T/r4a" init -q
out=$(inst "$T/r4a" --project g --modules delegate --session-model m --gateway-url "http://127.0.0.1:$P404" $GWM 2>&1) || fail "R4 404: install failed: $out"
echo "$out" | grep -q 'does not look like a gateway' || fail "R4 404: no 'does not look like a gateway': $out"
echo "$out" | grep -q 'gateway dry-run: ok' && fail "R4 404: dry-run ok for a non-gateway" || true
grep -qE "$LIVE_NO" "$T/r4a/tools/delegate/config.toml" || fail "R4 404: marker is not 'no'"
valid_toml "$T/r4a/tools/delegate/config.toml" || fail "R4a: config.toml is not valid TOML"
mkdir "$T/r4b" && git -C "$T/r4b" init -q
out=$(inst "$T/r4b" --project g --modules delegate --session-model m --gateway-url "http://127.0.0.1:$P302" $GWM 2>&1) || fail "R4 302: install failed: $out"
grep -qE "$LIVE_NO" "$T/r4b/tools/delegate/config.toml" || fail "R4 302: redirect was followed or counted (marker not 'no')"
valid_toml "$T/r4b/tools/delegate/config.toml" || fail "R4b: config.toml is not valid TOML"
mkdir "$T/r4c" && git -C "$T/r4c" init -q
out=$(HTTP_PROXY=http://127.0.0.1:1 http_proxy=http://127.0.0.1:1 HTTPS_PROXY=http://127.0.0.1:1 https_proxy=http://127.0.0.1:1 NO_PROXY= no_proxy= \
  inst "$T/r4c" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM 2>&1) || fail "R4 proxy: install failed: $out"
grep -qE "$LIVE_YES" "$T/r4c/tools/delegate/config.toml" || fail "R4 proxy: proxy was used (marker not 'yes')"
valid_toml "$T/r4c/tools/delegate/config.toml" || fail "R4c: config.toml is not valid TOML"

# R5: dry-run honesty
mkdir "$T/r5" && git -C "$T/r5" init -q
out=$(inst "$T/r5" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM 2>&1) || fail "R5: install failed: $out"
echo "$out" | grep -q 'still need exact model IDs' || fail "R5: output lacks 'still need exact model IDs': $out"
grep -q 'means the config resolves' "$HERE/plugins/foreman/skills/foreman-setup/references/gateway-block.md" && fail "R5: gateway-block.md still says 'means the config resolves'" || true

# R6: dry-run red path, direct script call
cp -r "$HERE/template/tools/delegate" "$T/r6"
echo 'this is not toml' >> "$T/r6/config.toml"
rc=0; out=$(python3 "$HERE/scripts/gateway-preset.py" "$T/r6/config.toml" --url "$GW_URL" --key-env FOREMAN_GATEWAY_KEY --fallback-model claude/test-model 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "R6: exit $rc, expected 0: $out"
echo "$out" | grep -q 'gateway dry-run: FAILED' || fail "R6: no 'gateway dry-run: FAILED': $out"
grep -qE "$LIVE_NO" "$T/r6/config.toml" || fail "R6: marker is not 'no'"

# R7: hand-edited table header
cp -r "$HERE/template/tools/delegate" "$T/r7"
sed -i 's/^\[roles\.research\]$/[roles.research]  # mine/' "$T/r7/config.toml"
grep -q '^\[roles\.research\]  # mine$' "$T/r7/config.toml" || fail "R7: setup: header not edited"
python3 "$HERE/scripts/gateway-preset.py" "$T/r7/config.toml" --url "$GW_URL" --key-env FOREMAN_GATEWAY_KEY --fallback-model claude/test-model >/dev/null 2>&1 || fail "R7: preset failed"
python3 - "$T/r7/config.toml" <<'PY' || fail "R7: config wrong (see above)"
import re, sys, tomllib
raw = open(sys.argv[1], encoding="utf-8").read()
d = tomllib.loads(raw)
assert "research" in d["roles"], "no active [roles.research]"
n = len(re.findall(r"^\[roles\.research\]", raw, re.M))
assert n == 1, f"{n} active [roles.research] headers"
assert d["roles"]["research"]["model"] == "gateway/task-research", d["roles"]["research"]
PY

# R8: existing install, changed environment
mkdir "$T/r8" && git -C "$T/r8" init -q
inst "$T/r8" --project w --workspace "$T/ws-ok.json" >/dev/null 2>&1 || fail "R8: first install failed"
python3 - "$T/ws-ok.json" "$T/ws-new.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["machines"][0]["name"] = "renamed-box"
json.dump(d, open(sys.argv[2], "w"), indent=2)
PY
cp "$T/r8/.foreman.json" "$T/r8-before.json"
rc=0; out=$(inst "$T/r8" --project w --workspace "$T/ws-new.json" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "R8: second install exit $rc: $out"
echo "$out" | grep -q 'infra block updated' || fail "R8: no 'infra block updated': $out"
python3 - "$T/r8/.foreman.json" "$T/r8-before.json" "$T/ws-new.json" <<'PY' || fail "R8: .foreman.json wrong (see above)"
import json, sys
n, o, w = (json.load(open(f)) for f in sys.argv[1:4])
assert n["infra"] == w, "infra is not the new workspace file"
o.pop("infra", None); n.pop("infra")
assert n == o, "other keys changed"
PY
cp "$T/r8/.foreman.json" "$T/r8-mid.json"
echo '{"schema": 1, "broken": ' > "$T/ws-bad.json"
rc=0; inst "$T/r8" --project w --workspace "$T/ws-bad.json" >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "R8: invalid workspace: exit $rc, expected 2"
cmp -s "$T/r8-mid.json" "$T/r8/.foreman.json" || fail "R8: invalid workspace changed .foreman.json"

# R9: closing message
mkdir "$T/r9" && git -C "$T/r9" init -q
inst "$T/r9" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM >/dev/null 2>&1 || fail "R9: first run failed"
out=$(inst "$T/r9" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM 2>&1) || fail "R9: second run failed: $out"
echo "$out" | grep -q 'kept' || fail "R9: second run does not say 'kept': $out"
echo "$out" | grep -q 'Gateway preset written' && fail "R9: second run claims 'Gateway preset written'" || true
mkdir "$T/r9d" && git -C "$T/r9d" init -q
out=$(inst "$T/r9d" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM --dry-run 2>&1) || fail "R9: dry run failed: $out"
echo "$out" | grep -q 'Gateway preset written' && fail "R9: dry run claims 'Gateway preset written'" || true
echo "$out" | grep -q 'would write gateway preset' || fail "R9: dry run lacks 'would write gateway preset': $out"

# R10: fallback model shape
mkdir "$T/r10" && git -C "$T/r10" init -q; rc=0
err=$(inst "$T/r10" --project g --gateway-url "$GW_URL" --fallback-model nonsense 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "R10: exit $rc, expected 2"
echo "$err" | grep -qi fallback || fail "R10: no fallback message: $err"
[ ! -e "$T/r10/tools" ] || fail "R10: wrote tools/"

# R11: kept config.toml hint, --help range, existing .foreman.json with --workspace
mkdir "$T/r11" && git -C "$T/r11" init -q
inst "$T/r11" --project g --modules delegate --session-model m >/dev/null 2>&1 || fail "R11: first run failed"
out=$(inst "$T/r11" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM --chatgpt-via-gateway accepted-risk 2>&1) || fail "R11: second run failed: $out"
echo "$out" | grep -q 'config.toml kept' || fail "R11: no 'config.toml kept' hint: $out"
echo "$out" | grep -q -- '--chatgpt' || fail "R11: kept hint lacks --chatgpt: $out"
echo "$out" | grep -q 'from the target directory' || fail "R11: kept hint does not say to run it from the target directory: $out"
echo "$out" | grep -qF "$HERE/scripts/gateway-preset.py" || fail "R11: kept hint lacks the script path: $out"
mkdir "$T/r11b" && git -C "$T/r11b" init -q
inst "$T/r11b" --project g --modules delegate --session-model m >/dev/null 2>&1 || fail "R11b: first run failed"
out=$(inst "$T/r11b" --project g --modules delegate --session-model m --gateway-url "$GW_URL" $GWM 2>&1) || fail "R11b: second run failed: $out"
echo "$out" | grep 'config.toml kept' | grep -q -- '--chatgpt' && fail "R11b: kept hint has --chatgpt without consent" || true

help_out=$("$HERE/install.sh" --help) || fail "R11: --help failed"
[ "$(printf '%s\n' "$help_out" | head -n 1)" = "foreman installer: copies the repo-side workflow into a target repo." ] || fail "R11: --help first line wrong"
printf '%s\n' "$help_out" | grep -q 'set -euo pipefail' && fail "R11: --help prints 'set -euo pipefail'" || true
printf '%s\n' "$help_out" | tail -n 1 | grep -q 'FOREMAN_GATEWAY_KEY' || fail "R11: --help does not end with the last header line: $(printf '%s\n' "$help_out" | tail -n 1)"

mkdir "$T/r11c" && git -C "$T/r11c" init -q
inst "$T/r11c" --project w --workspace "$T/ws-ok.json" >/dev/null 2>&1 || fail "R11c: first install failed"
cp "$T/r11c/.foreman.json" "$T/r11c-orig.json"
inst "$T/r11c" --project w --workspace "$T/ws-new.json" >/dev/null 2>&1 || fail "R11c: second install failed"
cmp -s "$T/r11c-orig.json" "$T/r11c/.foreman.json.before-foreman" || fail "R11c: .foreman.json.before-foreman is not a copy of the old file"
mkdir "$T/r11d" && git -C "$T/r11d" init -q
echo '{"foreman": ' > "$T/r11d/.foreman.json"
cp "$T/r11d/.foreman.json" "$T/r11d-orig.json"
rc=0; err=$(inst "$T/r11d" --project w --workspace "$T/ws-ok.json" 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "R11d: broken .foreman.json: exit $rc, expected 2"
echo "$err" | grep -qF 'workspace: existing .foreman.json is not valid JSON; nothing written' || fail "R11d: wrong message: $err"
cmp -s "$T/r11d-orig.json" "$T/r11d/.foreman.json" || fail "R11d: .foreman.json changed"
[ -z "$(ls -A "$T/r11d" | grep -vE '^(\.git|\.foreman\.json)$' || true)" ] || fail "R11d: wrote files: $(ls -A "$T/r11d")"

# case 8: docs
grep -qE 'accepted-risk|terms' "$HERE/gateway/README.md" || fail "gateway/README.md has neither accepted-risk nor terms"
REF="$HERE/plugins/foreman/skills/foreman-setup/references/gateway-block.md"
[ -f "$REF" ] || fail "references/gateway-block.md missing"
for s in '45 minutes' 'terms of use' 'Codex CLI' 'API key' 'Ollama and Claude only'; do
  grep -qF "$s" "$REF" || fail "gateway-block.md does not mention '$s'"
done

# ChatGPT consent with a reachable stub gateway: the example file follows the consent flag
mkdir "$T/cg6" && git -C "$T/cg6" init -q
inst "$T/cg6" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 || fail "stub gateway with accepted-risk: install failed"
[ -f "$T/cg6/tools/gateway/litellm.chatgpt.example.yaml" ] || fail "accepted-risk with stub gateway: litellm.chatgpt.example.yaml not installed"
mkdir "$T/cg7" && git -C "$T/cg7" init -q
inst "$T/cg7" --project g --modules delegate --session-model m --gateway-url "$GW_URL" --fallback-model claude/test-model --chatgpt-via-gateway declined >/dev/null 2>&1 || fail "stub gateway with declined: install failed"
[ -e "$T/cg7/tools/gateway/litellm.chatgpt.example.yaml" ] && fail "declined with stub gateway: litellm.chatgpt.example.yaml installed" || true
# --help stops before the script body
help_plain=$(bash "$HERE/install.sh" --help) || fail "bash install.sh --help failed"
printf '%s\n' "$help_plain" | grep -q 'set -euo pipefail' && fail "--help output contains 'set -euo pipefail'" || true

kill "$GW_PID" ${EXTRA_PIDS:-} 2>/dev/null || true; wait "$GW_PID" 2>/dev/null || true; GW_PID=""
# 10. ChatGPT via gateway needs the explicit consent option
mkdir "$T/cg1" && git -C "$T/cg1" init -q
inst "$T/cg1" --project g --modules delegate,gateway >/dev/null 2>&1 || fail "gateway install without chatgpt option failed"
[ -e "$T/cg1/tools/gateway/litellm.chatgpt.example.yaml" ] && fail "chatgpt file installed without consent"
grep -rEq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/cg1/tools" && fail "chatgpt model installed without consent: $(grep -rEl '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/cg1/tools" | head -3)"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/cg1/tools/gateway/litellm.config.example.yaml" && fail "neutral gateway config contains chatgpt model"

mkdir "$T/cg2" && git -C "$T/cg2" init -q
inst "$T/cg2" --project g --modules delegate,gateway --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 || fail "chatgpt option with accepted-risk failed"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/cg2/tools/gateway/litellm.chatgpt.example.yaml" || fail "chatgpt example file has no chatgpt model"
grep -Eq '^[[:space:]]*(-[[:space:]]*)?model:[[:space:]]*chatgpt/' "$T/cg2/tools/gateway/litellm.config.example.yaml" && fail "neutral gateway config contains chatgpt model with option"

mkdir "$T/cg3" && git -C "$T/cg3" init -q
rc=0; inst "$T/cg3" --project g --modules delegate,gateway --chatgpt-via-gateway yes >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "chatgpt option value 'yes': expected exit 2, got $rc"
mkdir "$T/cg4" && git -C "$T/cg4" init -q
rc=0; inst "$T/cg4" --project g --modules delegate,gateway --chatgpt-via-gateway "" >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "empty chatgpt option value: expected exit 2, got $rc"
mkdir "$T/cg5" && git -C "$T/cg5" init -q
rc=0; inst "$T/cg5" --project g --modules delegate --chatgpt-via-gateway accepted-risk >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "chatgpt option without module gateway: expected exit 2, got $rc"
# the refusals above write nothing: no tools/ and no .foreman.json in the target
for d in cg3 cg4 cg5; do
  [ -e "$T/$d/tools" ] && fail "refused install $d wrote tools/" || true
  [ -e "$T/$d/.foreman.json" ] && fail "refused install $d wrote .foreman.json" || true
done

# a value-taking option as the last argument exits 2 with a message, not 1
mkdir "$T/tv1" && git -C "$T/tv1" init -q
rc=0; err=$(inst "$T/tv1" --project g --chatgpt-via-gateway 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "trailing --chatgpt-via-gateway: exit $rc, expected 2"
echo "$err" | grep -q 'option --chatgpt-via-gateway needs a value' || fail "trailing --chatgpt-via-gateway: no message: $err"
mkdir "$T/tv2" && git -C "$T/tv2" init -q
rc=0; err=$(inst "$T/tv2" --project g --modules delegate --gateway-url 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "trailing --gateway-url: exit $rc, expected 2"
echo "$err" | grep -q 'option --gateway-url needs a value' || fail "trailing --gateway-url: no message: $err"

echo "install tests: ok"

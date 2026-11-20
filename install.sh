#!/usr/bin/env bash
# foreman installer: copies the repo-side workflow into a target repo.
#
#   ./install.sh <target-repo> --project <slug> [--name "Display Name"]
#                [--modules tracker-itsaplan|tracker-linear,delegate,gateway,autopilot,pretest]
#                [--scope docs|repo|autopilot] [--agent claude-code|opencode|other]
#                [--recommended-skills all|none|<name,name>] [--skills-scope global|project]
#                [--session-model <exact model id>] [--no-staging] [--force] [--dry-run]
#
# Existing files are never overwritten without --force. An existing CLAUDE.md is kept and the
# foreman rules are written to CLAUDE.foreman.md for you to merge. An existing .claude/settings.json
# is merged (hooks and permissions added, a backup is written next to it).
# Recommended third-party skills (skills.recommended.json) are installed only after confirmation: the flag
# --recommended-skills is the confirmation, or the script asks when it runs in a terminal. Without a terminal and
# without the flag nothing is installed. The tracker modules tracker-itsaplan and tracker-linear exclude each other;
# without one, the tracker is "none" (files in the repo).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/template"
VERSION="$(cat "$HERE/VERSION" 2>/dev/null || echo 0.2.0)"

target="" project="" name="" modules="" scope="" model="" agent=claude-code rec="" skills_scope="" staging=yes force=no dry=no
while [ $# -gt 0 ]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --modules) modules="$2"; shift 2 ;;
    --scope) scope="$2"; shift 2 ;;
    --session-model) model="$2"; shift 2 ;;
    --agent) agent="$2"; shift 2 ;;
    --recommended-skills) rec="$2"; shift 2 ;;
    --skills-scope) skills_scope="$2"; shift 2 ;;
    --no-staging) staging=no; shift ;;
    --force) force=yes; shift ;;
    --dry-run) dry=yes; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) target="$1"; shift ;;
  esac
done

[ -n "$target" ] || { echo "usage: ./install.sh <target-repo> --project <slug> [options]  (see --help)" >&2; exit 2; }
[ -d "$target" ] || { echo "target not found: $target" >&2; exit 2; }
[ -n "$project" ] || { echo "--project <slug> is required" >&2; exit 2; }
[[ "$project" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "--project must be a lowercase slug" >&2; exit 2; }
target="$(cd "$target" && pwd)"
name="${name:-$project}"
modules="$(echo "$modules" | tr -d ' ')"
norm=()
for m in ${modules//,/ }; do
  case "$m" in
    tracker-itsaplan|tracker-linear|delegate|gateway|autopilot|pretest) norm+=("$m") ;;
    notion) echo "notion was removed in 0.2. Use --modules tracker-itsaplan, tracker-linear or none." >&2; exit 2 ;;
    ollama) echo "note: module 'ollama' is now 'delegate'" >&2; norm+=(delegate) ;;
    linear) echo "note: module 'linear' is now 'tracker-linear'" >&2; norm+=(tracker-linear) ;;
    *) echo "unknown module: $m" >&2; exit 2 ;;
  esac
done
modules="$(printf '%s\n' "${norm[@]:-}" | awk 'NF && !s[$0]++' | paste -sd, -)"
has() { [[ ",$modules," == *",$1,"* ]]; }
if has tracker-itsaplan && has tracker-linear; then echo "tracker-itsaplan and tracker-linear exclude each other; choose one (or none)" >&2; exit 2; fi
case "$agent" in claude-code|opencode|other) ;; *) echo "--agent must be claude-code, opencode or other" >&2; exit 2 ;; esac
case "$skills_scope" in ""|global|project) ;; *) echo "--skills-scope must be global or project" >&2; exit 2 ;; esac
tracker=none; has tracker-itsaplan && tracker=itsaplan; has tracker-linear && tracker=linear
if [ -z "$scope" ]; then has autopilot && scope=autopilot || scope=repo; fi
case "$scope" in docs|repo|autopilot) ;; *) echo "--scope must be docs, repo or autopilot" >&2; exit 2 ;; esac
if has autopilot && [ "$scope" != autopilot ]; then echo "module autopilot needs --scope autopilot (or no --scope)" >&2; exit 2; fi
if [ -z "$model" ]; then
  model="opus"
  echo "note: --session-model not given; settings.json uses the alias 'opus'. Set an exact model ID later." >&2
fi
if [ "$model" = "opusplan" ]; then
  echo "refusing --session-model opusplan: autonomous runs never enter plan mode and run on the smaller model" >&2; exit 2
fi

installed=() kept=() skipped=()

skip_file() {
  local rel="$1"
  [ "$scope" = docs ] && [[ "$rel" != docs/* ]] && return 0
  if ! has autopilot; then
    case "$rel" in docs/routines/*|scripts/autopilot-check.*|scripts/test-autopilot-check.mjs|scripts/lib/autopilot-check.mjs|.claude/skills/foreman-dispatch-run/*) return 0 ;; esac
  fi
  if ! has pretest; then
    case "$rel" in .claude/skills/foreman-pretest/*|scripts/pretest-run.mjs|scripts/pretest-prepare.sh|scripts/pretest/*|scripts/test-pretest.mjs|scripts/lib/pretest-run.mjs|docs/test-login.md) return 0 ;; esac
  fi
  [ "$rel" = AGENTS.md ] && [ "$agent" = claude-code ] && return 0
  return 1
}

render() {
  sed -e "s|{{PROJECT}}|$project|g" -e "s|{{PROJECT_NAME}}|$name|g" -e "s|{{SCOPE}}|$scope|g" \
      -e "s|{{MODULES}}|${modules:-none}|g" -e "s|{{AGENT}}|$agent|g" -e "s|{{SESSION_MODEL}}|$model|g" "$1"
}

copy_one() {
  local src="$1" rel="$2" dst="$target/$2"
  if [ "$rel" = "CLAUDE.md" ] && [ -f "$dst" ] && [ "$force" = no ]; then
    dst="$target/CLAUDE.foreman.md"; rel="CLAUDE.foreman.md"
  fi
  if [ "$rel" = ".claude/settings.json" ] && [ -f "$dst" ]; then
    merge_settings "$src" "$dst"; return
  fi
  if [ -e "$dst" ] && [ "$force" = no ]; then kept+=("$rel"); return; fi
  installed+=("$rel")
  [ "$dry" = yes ] && return
  mkdir -p "$(dirname "$dst")"
  if grep -Iq . "$src" 2>/dev/null || [ ! -s "$src" ]; then render "$src" > "$dst"; else cp "$src" "$dst"; fi
  [ -x "$src" ] && chmod +x "$dst"
  return 0
}

merge_settings() {
  local src="$1" dst="$2"
  installed+=(".claude/settings.json (merged)")
  [ "$dry" = yes ] && return
  cp "$dst" "$dst.before-foreman"
  render "$src" > "$dst.foreman.tmp"
  python3 - "$dst" "$dst.foreman.tmp" <<'PY'
import json, sys
cur_path, new_path = sys.argv[1], sys.argv[2]
cur, new = json.load(open(cur_path)), json.load(open(new_path))
if cur.get("model") in (None, "opusplan"):
    cur["model"] = new["model"]
hooks = cur.setdefault("hooks", {})
for event, entries in new.get("hooks", {}).items():
    have = json.dumps(hooks.get(event, []))
    for e in entries:
        if all(h["command"] not in have for h in e["hooks"]):
            hooks.setdefault(event, []).append(e)
perms = cur.setdefault("permissions", {})
for k, v in new.get("permissions", {}).items():
    perms[k] = sorted(set(perms.get(k, [])) | set(v))
json.dump(cur, open(cur_path, "w"), indent=2)
open(cur_path, "a").write("\n")
PY
  rm -f "$dst.foreman.tmp"
}

while IFS= read -r -d '' f; do
  rel="${f#"$TEMPLATE"/}"
  if skip_file "$rel"; then skipped+=("$rel"); continue; fi
  copy_one "$f" "$rel"
done < <(find "$TEMPLATE" -type f -print0 | sort -z)

if [ "$dry" = no ]; then
  # .gitignore: worker task files never go into the repo.
  touch "$target/.gitignore"
  grep -qxF 'tools/delegate/tasks/*' "$target/.gitignore" || printf '\n# foreman: worker task files\ntools/delegate/tasks/*\n!tools/delegate/tasks/.gitkeep\n' >> "$target/.gitignore"

  if [ ! -f "$target/.foreman.json" ] || [ "$force" = yes ]; then
    python3 - "$target/.foreman.json" "$VERSION" "$project" "$name" "$scope" "$agent" "$modules" "$staging" "$tracker" <<'PY'
import json, sys
path, version, project, name, scope, agent, modules, staging, tracker = sys.argv[1:10]
mods = [m for m in modules.split(",") if m]
st = staging == "yes"
conf = {
    "foreman": version, "project": project, "name": name, "scope": scope, "agent": agent, "modules": mods,
    "tracker": {"type": tracker},
    "staging": st,
    "branches": {"dev": "dev", "staging": "main" if st else None, "production": "prod" if st else "main"},
    "context": {"stagingUrl": "", "devUrl": "", "testTenant": "", "offLimits": "", "language": "", "timeZone": "UTC", "releaseDay": "Friday", "workRun": ""},
    "mirror": {},
}
if tracker == "itsaplan":
    conf["mirror"]["itsaplan"] = {"projectKey": "", "labelPrefix": "AP: "}
if tracker == "linear":
    conf["mirror"]["linear"] = {"teamKey": "", "labelPrefix": "AP: ", "archiveDoneAfterDays": 7}
if "pretest" in mods:
    conf["pretest"] = {
        "targets": {"dev": "", "staging": ""}, "productionHosts": [], "tenants": {"dev": [], "staging": []}, "blocked": [],
        "login": {"path": "/api/test-login", "secretEnv": {"dev": "TEST_LOGIN_SECRET_DEV", "staging": "TEST_LOGIN_SECRET_STAGING"},
                  "roles": {"owner": "TEST_LOGIN_USER_OWNER", "member": "TEST_LOGIN_USER_MEMBER"},
                  "fields": {"secret": "secret", "user": "userId", "tenant": "tenant"}},
    }
json.dump(conf, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
    installed+=(".foreman.json")
  else
    kept+=(".foreman.json")
  fi
  if has gateway; then
    mkdir -p "$target/tools/gateway"
    for g in README.md litellm.config.example.yaml; do
      if [ -e "$target/tools/gateway/$g" ] && [ "$force" = no ]; then kept+=("tools/gateway/$g"); continue; fi
      cp "$HERE/gateway/$g" "$target/tools/gateway/$g"; installed+=("tools/gateway/$g")
    done
  fi
  if [ -d "$target/.git" ] && [ -d "$target/.githooks" ]; then
    git -C "$target" config core.hooksPath .githooks
  fi
fi

echo "foreman $VERSION → $target (scope: $scope, agent: $agent, tracker: $tracker, modules: ${modules:-none})"
echo "  installed: ${#installed[@]} files"
[ ${#kept[@]} -gt 0 ] && printf '  kept (exists, use --force to overwrite): %s\n' "${kept[@]}"
[ ${#skipped[@]} -gt 0 ] && echo "  skipped (module off or scope docs): ${#skipped[@]} files"
[ -f "$target/CLAUDE.foreman.md" ] && echo "  NOTE: CLAUDE.md existed. Merge CLAUDE.foreman.md into it (keep it under ~2 KB)."

# ---- recommended third-party skills: only after confirmation ----
install_skills() {
  local sel="$1" sc="$2" listing
  listing=$(python3 - "$HERE/skills.recommended.json" "$sel" "$sc" <<'PY'
import json, sys
path, sel, sc = sys.argv[1:4]
skills = json.load(open(path))["skills"]
want = None if sel == "all" else set(sel.split(","))
known = {s["name"] for s in skills}
for w in (want or set()):
    if w not in known:
        print("ERROR\t%s\tunknown skill (known: %s)" % (w, ", ".join(sorted(known))))
for s in skills:
    if want is None or s["name"] in want:
        print("%s\t%s\t%s" % (s["name"], s["repo"], s["install_global" if sc == "global" else "install_project"]))
PY
)
  while IFS=$'\t' read -r sname srepo scmd; do
    [ -z "$sname" ] && continue
    if [ "$sname" = ERROR ]; then echo "  skills: $srepo: $scmd" >&2; continue; fi
    if [ "$dry" = yes ]; then echo "  skills: would run ($sc) $scmd    # $sname, $srepo"; continue; fi
    echo "  skills: installing $sname ($sc)"
    if [ "$sc" = project ]; then (cd "$target" && bash -c "$scmd") || echo "  skills: $sname failed; run manually: $scmd" >&2
    else bash -c "$scmd" || echo "  skills: $sname failed; run manually: $scmd" >&2; fi
  done <<< "$listing"
}
if [ -z "$rec" ] && [ -t 0 ] && [ -t 1 ] && [ "$dry" = no ]; then
  echo
  echo "Recommended third-party skills (installed only after you confirm):"
  python3 - "$HERE/skills.recommended.json" <<'PY'
import json, sys
for s in json.load(open(sys.argv[1]))["skills"]:
    print("  - %s: %s (%s)" % (s["name"], s["purpose"], s["repo"]))
PY
  read -r -p "Install them? [a]ll / [n]one / comma-separated names: " ans || ans=none
  case "${ans:-none}" in a|all) rec=all ;; n|none|"") rec=none ;; *) rec="$ans" ;; esac
  if [ "$rec" != none ] && [ -z "$skills_scope" ]; then
    read -r -p "Where? [g]lobal (~/.claude/skills) / [p]roject (this repo): " ans || ans=project
    case "${ans:-project}" in g|global) skills_scope=global ;; *) skills_scope=project ;; esac
  fi
fi
rec="${rec:-none}"
if [ "$rec" != none ]; then install_skills "$rec" "${skills_scope:-project}"; fi

cat <<EOF

Next steps:
  1. Fill exact model IDs in tools/delegate/config.toml (roles → models), then:
       python3 tools/delegate/run_task.py --dry-run --role execution
  2. Run the checks:  bash scripts/check-config.sh && python3 scripts/test-guard.py && bash scripts/test-pre-push.sh
  3. Put project setup (dependencies, database) into scripts/session-setup.local.sh.
  4. Fill the "context" block of .foreman.json (staging and dev URLs, test tenant, time zone, release day); the chat skills read it.
  5. Install the foreman plugin (claude.ai: Plugins → Add marketplace → AndreasByr/foreman; Claude Code: /plugin marketplace add AndreasByr/foreman) and start with foreman-setup.
EOF
if [ "$agent" != claude-code ]; then echo "  AGENTS.md was written. $agent has no Claude hooks: .githooks/pre-push is the push guard (core.hooksPath is set when the target is a git repo). Skills are read from .claude/skills/."; fi
if has tracker-itsaplan; then echo "  Tracker itsaplan: create the columns and labels (docs/trackers.md), set ITSAPLAN_URL and ITSAPLAN_API_KEY, fill mirror.itsaplan.projectKey, then: node scripts/state-mirror.mjs --dry-run"; fi
if has tracker-linear; then echo "  Tracker linear: set LINEAR_API_KEY, fill mirror.linear.teamKey, then: node scripts/state-mirror.mjs --dry-run"; fi
if [ "$tracker" = none ]; then echo "  Tracker none: answers go to docs/answers/<unit>.md, UAT approval to docs/uat/<unit>.md (docs/trackers.md)."; fi
if has pretest; then echo "  Pretest: fill pretest.* in .foreman.json and build the test login (docs/test-login.md)."; fi
if has gateway; then echo "  Gateway: read tools/gateway/README.md, then enable the gateway preset in tools/delegate/config.toml."; fi
if has autopilot; then
  echo "  Autopilot needs GitHub (or similar), a Claude Code routine for the work run (docs/routines/work-run.md, about 20 min) and a machine that is on for the dispatcher"
  echo "  (dispatcher/ of the foreman repo, about 15 min; Plan B without a server: docs/routines/delegation.md). Create routines from a Claude Code cloud session or the routines UI, never from a chat."
fi
exit 0

#!/usr/bin/env bash
# foreman installer: copies the repo-side workflow into a target repo.
#
#   ./install.sh <target-repo> --project <slug> [--name "Display Name"]
#                [--modules ollama,linear,notion,autopilot] [--scope docs|repo|autopilot]
#                [--session-model <exact model id>] [--no-staging] [--force] [--dry-run]
#
# Existing files are never overwritten without --force. An existing CLAUDE.md is kept and the
# foreman rules are written to CLAUDE.foreman.md for you to merge. An existing .claude/settings.json
# is merged (hooks and permissions added, a backup is written next to it).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/template"
VERSION="$(cat "$HERE/VERSION" 2>/dev/null || echo 0.1.0)"

target="" project="" name="" modules="" scope="" model="" staging=yes force=no dry=no
while [ $# -gt 0 ]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --modules) modules="$2"; shift 2 ;;
    --scope) scope="$2"; shift 2 ;;
    --session-model) model="$2"; shift 2 ;;
    --no-staging) staging=no; shift ;;
    --force) force=yes; shift ;;
    --dry-run) dry=yes; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
for m in ${modules//,/ }; do
  case "$m" in ollama|linear|notion|autopilot) ;; *) echo "unknown module: $m" >&2; exit 2 ;; esac
done
has() { [[ ",$modules," == *",$1,"* ]]; }
if [ -z "$scope" ]; then has autopilot && scope=autopilot || scope=repo; fi
case "$scope" in docs|repo|autopilot) ;; *) echo "--scope must be docs, repo or autopilot" >&2; exit 2 ;; esac
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
    case "$rel" in docs/routines/*|scripts/autopilot-check.sh|.claude/skills/foreman-dispatch-run/*) return 0 ;; esac
  fi
  return 1
}

render() {
  sed -e "s|{{PROJECT}}|$project|g" -e "s|{{PROJECT_NAME}}|$name|g" -e "s|{{SCOPE}}|$scope|g" \
      -e "s|{{MODULES}}|${modules:-none}|g" -e "s|{{SESSION_MODEL}}|$model|g" "$1"
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

  mods_json=$(python3 -c 'import json,sys; print(json.dumps([m for m in sys.argv[1].split(",") if m]))' "$modules")
  if [ ! -f "$target/.foreman.json" ] || [ "$force" = yes ]; then
    cat > "$target/.foreman.json" <<EOF
{
  "foreman": "$VERSION",
  "project": "$project",
  "name": "$name",
  "scope": "$scope",
  "modules": $mods_json,
  "staging": $([ "$staging" = yes ] && echo true || echo false),
  "branches": { "dev": "dev", "staging": $([ "$staging" = yes ] && echo '"main"' || echo null), "production": $([ "$staging" = yes ] && echo '"prod"' || echo '"main"') },
  "mirror": {}
}
EOF
    installed+=(".foreman.json")
  else
    kept+=(".foreman.json")
  fi
  if [ -d "$target/.git" ] && [ -d "$target/.githooks" ]; then
    git -C "$target" config core.hooksPath .githooks
  fi
fi

echo "foreman $VERSION → $target (scope: $scope, modules: ${modules:-none})"
echo "  installed: ${#installed[@]} files"
[ ${#kept[@]} -gt 0 ] && printf '  kept (exists, use --force to overwrite): %s\n' "${kept[@]}"
[ ${#skipped[@]} -gt 0 ] && echo "  skipped (module off or scope docs): ${#skipped[@]} files"
[ -f "$target/CLAUDE.foreman.md" ] && echo "  NOTE: CLAUDE.md existed. Merge CLAUDE.foreman.md into it (keep it under ~2 KB)."
cat <<EOF

Next steps:
  1. Fill exact model IDs in tools/delegate/config.toml (roles → models), then:
       python3 tools/delegate/run_task.py --dry-run --role execution
  2. Run the checks:  bash scripts/check-config.sh && python3 scripts/test-guard.py
  3. Put project setup (dependencies, database) into scripts/session-setup.local.sh.
  4. Upload chat-skills/foreman-* to claude.ai (see README) and start with foreman-setup.
EOF
has autopilot && echo "  5. Create the routines from docs/routines/*.md (from a Claude Code session in the cloud environment or the routines UI, never from a chat)."
has linear || has notion && echo "  6. Fill \"mirror\" in .foreman.json, then: node scripts/state-mirror.mjs --dry-run"
exit 0

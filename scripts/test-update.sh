#!/usr/bin/env bash
# Update test: ./install.sh <target> --update [--dry-run]. Classes kept, idempotence, errors write nothing,
# symlink escape, uncommitted foreman files, write failure keeps the version, modules stay off, missing files return.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "update test FAIL: $*"; exit 1; }
inst() { "$HERE/install.sh" "$@"; }
# field of .foreman.json
jf() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1]));
for k in sys.argv[2].split("."): d=d[k]
print(json.dumps(d) if isinstance(d,(list,dict)) else d)' "$1" "$2"; }
# upd <dir> [options]: runs --update, sets RC, OUT, ERR
RC=0 OUT="" ERR=""
upd() {
  local d="$1"; shift
  "$HERE/install.sh" "$d" --update "$@" >"$T/upd.out" 2>"$T/upd.err" && RC=0 || RC=$?
  OUT=$(cat "$T/upd.out"); ERR=$(cat "$T/upd.err")
}
tree_hash() {
  [ -d "$1" ] || { echo none; return; }
  (cd "$1" && find . -type f -not -path '*/.git/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum)
}
as_old() { sed -i 's/"foreman": *"[^"]*"/"foreman": "0.1.9"/' "$1/.foreman.json"; grep -q '"foreman": *"0.1.9"' "$1/.foreman.json" || fail "as_old did not set 0.1.9 in $1"; }
gitinit() { mkdir -p "$1" && git -C "$1" init -q && git -C "$1" config user.email t@e.com && git -C "$1" config user.name t; }
commit() { git -C "$1" add -A && git -C "$1" commit -qm "${2:-c}"; }
newver="$(cat "$HERE/VERSION")"
has_line() { printf '%s\n' "$OUT" | grep -qxF -- "$1"; }
need_line() { has_line "$2" || fail "$1: line missing: '$2'; stdout was: $OUT"; }

# 1. classes are kept
d="$T/k"; gitinit "$d"
inst "$d" --project demo --name "Demo App" --modules delegate,tracker-itsaplan,gateway,autopilot,pretest --session-model test-model-id >/dev/null 2>&1 || fail "1: install failed"
commit "$d" install
for f in CLAUDE.md tools/delegate/config.toml docs/learnings.md; do echo "my own line in $f" >> "$d/$f"; done
commit "$d" mine
echo "// stale, different text" > "$d/scripts/lib/state.mjs"
commit "$d" stale
as_old "$d"; commit "$d" old
mkdir "$T/saved"
for f in CLAUDE.md tools/delegate/config.toml docs/learnings.md .foreman.json; do mkdir -p "$T/saved/$(dirname "$f")"; cp "$d/$f" "$T/saved/$f"; done
h0=$(tree_hash "$d")
upd "$d" --dry-run
[ "$RC" = 0 ] || fail "1: dry run exit $RC: $ERR"
need_line "1 dry" "foreman update: 0.1.9 -> $newver"
need_line "1 dry" "(dry run, nothing written)"
need_line "1 dry" "  update  scripts/lib/state.mjs"
need_line "1 dry" "  keep  CLAUDE.md  (mixed: merge by hand)"
need_line "1 dry" "  keep  tools/delegate/config.toml  (mixed: merge by hand)"
need_line "1 dry" "  keep  docs/learnings.md"
need_line "1 dry" "foreman update: dry run, nothing written"
printf '%s\n' "$OUT" | grep -q '^summary: ' || fail "1 dry: summary line missing"
[ "$(tree_hash "$d")" = "$h0" ] || fail "1: dry run changed the tree"
upd "$d"
[ "$RC" = 0 ] || fail "1: update exit $RC: $ERR"
need_line "1 update" "foreman update: done"
cmp -s "$d/scripts/lib/state.mjs" "$HERE/template/scripts/lib/state.mjs" || fail "1: state.mjs not restored from template"
for f in CLAUDE.md tools/delegate/config.toml docs/learnings.md; do
  cmp -s "$d/$f" "$T/saved/$f" || fail "1: project/mixed file $f was touched"
done
[ "$(jf "$d/.foreman.json" foreman)" = "$newver" ] || fail "1: foreman version is $(jf "$d/.foreman.json" foreman), expected $newver"
python3 - "$d/.foreman.json" "$T/saved/.foreman.json" <<'PY' || fail "1: .foreman.json fields other than foreman changed"
import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
a.pop("foreman"); b.pop("foreman")
assert a==b
PY
(cd "$d" && bash scripts/check-config.sh >/dev/null 2>&1) || fail "1: check-config.sh failed after update"
h1=$(tree_hash "$d")
upd "$d"
[ "$RC" = 0 ] || fail "1: second update exit $RC: $ERR"
need_line "1 second" "nothing to do"
[ "$(tree_hash "$d")" = "$h1" ] || fail "1: second update changed the tree"

# 2. idempotence after a fresh install
n=0
for set in "none" "delegate" "autopilot,pretest" "gateway" "tracker-linear,delegate" "scope-docs"; do
  n=$((n+1)); d="$T/idem$n"; gitinit "$d"
  case "$set" in
    none) inst "$d" --project idem --session-model test-model-id >/dev/null 2>&1 ;;
    scope-docs) inst "$d" --project idem --scope docs --session-model test-model-id >/dev/null 2>&1 ;;
    *) inst "$d" --project idem --modules "$set" --session-model test-model-id >/dev/null 2>&1 ;;
  esac || fail "2 ($set): install failed"
  commit "$d" install
  h=$(tree_hash "$d")
  upd "$d"
  [ "$RC" = 0 ] || fail "2 ($set): update exit $RC: $ERR"
  need_line "2 ($set)" "nothing to do"
  [ "$(tree_hash "$d")" = "$h" ] || fail "2 ($set): tree changed"
done

# 3. errors write nothing
mk() { rm -rf "$T/e"; mkdir "$T/e"; inst "$T/e" --project err --modules delegate --session-model test-model-id >/dev/null 2>&1 || fail "3: install failed"; }
expect2() {
  local label="$1" dir="$2"; shift 2
  local h; h=$(tree_hash "$dir")
  upd "$dir" "$@"
  [ "$RC" = 2 ] || fail "3 ($label): exit $RC, expected 2; stderr: $ERR"
  case "$ERR" in "foreman update:"*) ;; *) fail "3 ($label): stderr does not start with 'foreman update:': $ERR" ;; esac
  [ "$(tree_hash "$dir")" = "$h" ] || fail "3 ($label): tree changed"
}
mk; rm "$T/e/.foreman.json"; expect2 "no .foreman.json" "$T/e"
mk; echo '{ not json' > "$T/e/.foreman.json"; expect2 "invalid json" "$T/e"
mk; echo '{"project":"err","modules":[]}' > "$T/e/.foreman.json"; expect2 "no foreman field" "$T/e"
mk; sed -i 's/"foreman": *"[^"]*"/"foreman": "99.0.0"/' "$T/e/.foreman.json"; expect2 "version 99.0.0" "$T/e"
expect2 "target missing" "$T/does-not-exist"
mk; expect2 "--modules" "$T/e" --modules delegate
mk; expect2 "--force" "$T/e" --force
mk; expect2 "--project" "$T/e" --project err

# 4. symlink out of the target
d="$T/sl"; mkdir "$d"; mkdir "$T/outside"
inst "$d" --project sl --session-model test-model-id >/dev/null 2>&1 || fail "4: install failed"
as_old "$d"
rm -rf "$d/scripts/lib"; ln -s "$T/outside" "$d/scripts/lib"
upd "$d"
[ "$RC" = 2 ] || fail "4: exit $RC, expected 2; stderr: $ERR"
printf '%s' "$ERR" | grep -q 'outside' || fail "4: stderr does not mention 'outside': $ERR"
[ -z "$(ls -A "$T/outside")" ] || fail "4: outside directory was written to"
[ "$(jf "$d/.foreman.json" foreman)" = "0.1.9" ] || fail "4: version changed"

# 5. uncommitted changes in foreman-owned files
d="$T/uc"; gitinit "$d"
inst "$d" --project uc --session-model test-model-id >/dev/null 2>&1 || fail "5: install failed"
commit "$d" install; as_old "$d"; commit "$d" old
echo "// local edit" >> "$d/scripts/lib/state.mjs"
h=$(tree_hash "$d")
upd "$d"
[ "$RC" = 2 ] || fail "5: exit $RC, expected 2; stderr: $ERR"
printf '%s' "$ERR" | grep -q 'scripts/lib/state.mjs' || fail "5: stderr does not name scripts/lib/state.mjs: $ERR"
case "$ERR" in "foreman update:"*) ;; *) fail "5: stderr does not start with 'foreman update:'" ;; esac
[ "$(tree_hash "$d")" = "$h" ] || fail "5: tree changed"
git -C "$d" commit -qam "local edit"
upd "$d"
[ "$RC" = 0 ] || fail "5: update after commit exit $RC: $ERR"
d="$T/uc2"; gitinit "$d"
inst "$d" --project uc --session-model test-model-id >/dev/null 2>&1 || fail "5b: install failed"
commit "$d" install; as_old "$d"; commit "$d" old
echo "my note" >> "$d/docs/learnings.md"
upd "$d"
[ "$RC" = 0 ] || fail "5b: uncommitted project file blocked the update, exit $RC: $ERR"
grep -q 'my note' "$d/docs/learnings.md" || fail "5b: project file lost its edit"

# 6. write failure keeps the version
d="$T/wf"; mkdir "$d"
inst "$d" --project wf --session-model test-model-id >/dev/null 2>&1 || fail "6: install failed"
as_old "$d"
rm -rf "$d/scripts/lib"; echo "not a directory" > "$d/scripts/lib"
upd "$d"
case "$RC" in 1|2) ;; *) fail "6: exit $RC, expected 1 or 2" ;; esac
[ -n "$ERR" ] || fail "6: no message on stderr"
[ "$(jf "$d/.foreman.json" foreman)" = "0.1.9" ] || fail "6: version changed despite failed write"
rm "$d/scripts/lib"; cp -r "$HERE/template/scripts/lib" "$d/scripts/lib"
upd "$d"
[ "$RC" = 0 ] || fail "6: rerun exit $RC: $ERR"
[ "$(jf "$d/.foreman.json" foreman)" = "$newver" ] || fail "6: version after rerun is $(jf "$d/.foreman.json" foreman)"

# 7. modules stay off
d="$T/off"; mkdir "$d"
inst "$d" --project off --session-model test-model-id >/dev/null 2>&1 || fail "7: install failed"
as_old "$d"
mods=$(jf "$d/.foreman.json" modules)
upd "$d"
[ "$RC" = 0 ] || fail "7: update exit $RC: $ERR"
for f in scripts/autopilot-check.sh docs/routines scripts/pretest-run.mjs tools/gateway; do
  [ -e "$d/$f" ] && fail "7: $f exists without its module"
done
[ "$(jf "$d/.foreman.json" modules)" = "$mods" ] || fail "7: modules changed"

# 8. missing files come back
d="$T/miss"; mkdir "$d"
inst "$d" --project miss --session-model test-model-id >/dev/null 2>&1 || fail "8: install failed"
rm "$d/scripts/lib/state.mjs" "$d/docs/learnings.md"
upd "$d"
[ "$RC" = 0 ] || fail "8: update exit $RC: $ERR"
need_line "8" "  new  scripts/lib/state.mjs"
need_line "8" "  create  docs/learnings.md"
[ -f "$d/scripts/lib/state.mjs" ] || fail "8: state.mjs not restored"
[ -f "$d/docs/learnings.md" ] || fail "8: learnings.md not created"

echo "update tests: ok"

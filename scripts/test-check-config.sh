#!/usr/bin/env bash
# Tests scripts/check-config.sh in small temporary git projects (the autopilot-check --no-fetch warning). Run: bash scripts/test-check-config.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CHECK="$HERE/scripts/check-config.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { echo "check-config test FAIL: $*"; exit 1; }

# new_project NAME: a git repo with a copy of check-config.sh in scripts/; prints its path
new_project() {
  local p="$T/$1"
  mkdir -p "$p/scripts"
  git init -q "$p"
  cp "$CHECK" "$p/scripts/check-config.sh"
  echo "$p"
}

# run_check DIR: runs the check from DIR; sets OUT and RC
run_check() {
  RC=0
  OUT=$(cd "$1" && bash "$1/scripts/check-config.sh" 2>&1) || RC=$?
}

# a. no autopilot-check file at all
p=$(new_project a)
run_check "$p"
[ "$RC" -eq 0 ] || fail "a: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "a: missing ok line: $OUT"
grep -q "no-fetch" <<<"$OUT" && fail "a: unexpected no-fetch text: $OUT"
echo "ok a"

# b. scripts/autopilot-check.sh knows --no-fetch
p=$(new_project b)
cat > "$p/scripts/autopilot-check.sh" <<'SH'
#!/usr/bin/env bash
case "$1" in
  --no-fetch|--now) ;;
  *) echo "unknown option" >&2; exit 2 ;;
esac
SH
run_check "$p"
[ "$RC" -eq 0 ] || fail "b: exit $RC, expected 0: $OUT"
grep -q "no-fetch" <<<"$OUT" && fail "b: unexpected no-fetch warning: $OUT"
echo "ok b"

# c. scripts/autopilot-check.sh does not know --no-fetch: warning, exit still 0
p=$(new_project c)
cat > "$p/scripts/autopilot-check.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ $# -eq 0 ] || { echo "unknown option" >&2; exit 2; }
SH
run_check "$p"
[ "$RC" -eq 0 ] || fail "c: exit $RC, expected 0: $OUT"
grep -E '^WARN:.*--no-fetch.*scripts/autopilot-check' <<<"$OUT" >/dev/null || fail "c: missing WARN line for --no-fetch: $OUT"
echo "ok c"

# d. the .sh delegates to the .mjs, which knows --no-fetch: no warning
p=$(new_project d)
cat > "$p/scripts/autopilot-check.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec node scripts/autopilot-check.mjs "$@"
SH
cat > "$p/scripts/autopilot-check.mjs" <<'JS'
// usage: node scripts/autopilot-check.mjs [--no-fetch] [--now <ISO time>]
if (process.argv.includes("--no-fetch")) console.log("no fetch");
JS
run_check "$p"
[ "$RC" -eq 0 ] || fail "d: exit $RC, expected 0: $OUT"
grep -q "no-fetch" <<<"$OUT" && fail "d: unexpected no-fetch warning: $OUT"
echo "ok d"

echo "check-config tests: ok"

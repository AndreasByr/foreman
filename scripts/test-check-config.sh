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

# bad_value NAME JSON KEY: .foreman.json holding JSON must exit 1 with a FAIL line naming KEY
bad_value() {
  local p line
  p=$(new_project "$1")
  printf '%s\n' "$2" > "$p/.foreman.json"
  run_check "$p"
  [ "$RC" -eq 1 ] || fail "$1: exit $RC, expected 1: $OUT"
  line=$(grep -F "FAIL:" <<<"$OUT" | grep -F -- "$3" || true)
  [ -n "$line" ] || fail "$1: no FAIL line naming $3: $OUT"
  echo "ok $1"
}

# f. valid .foreman.json settings: exit 0 and ok line
p=$(new_project f-valid)
printf '%s\n' '{"context":{"timeZone":"Europe/Berlin"},"autopilot":{"batchHours":[3,7,11],"waitHours":4,"mainAutoMerge":false}}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "f-valid: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "f-valid: missing ok line: $OUT"
echo "ok f-valid"

# g. no .foreman.json: exit 0 and ok line
p=$(new_project g-none)
run_check "$p"
[ "$RC" -eq 0 ] || fail "g-none: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "g-none: missing ok line: $OUT"
echo "ok g-none"

# h. .foreman.json without autopilot and context: exit 0 and ok line
p=$(new_project h-no-block)
printf '%s\n' '{"unrelated":true}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "h-no-block: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "h-no-block: missing ok line: $OUT"
echo "ok h-no-block"

# i. invalid settings: exit 1 with a FAIL line naming the key
bad_value i-tz-mars '{"context":{"timeZone":"Mars/Base"}}' context.timeZone
bad_value i-tz-num '{"context":{"timeZone":5}}' context.timeZone
bad_value i-tz-null '{"context":{"timeZone":null}}' context.timeZone
# an empty zone means "not set": exit 0 and ok line
p=$(new_project i-tz-empty)
printf '%s\n' '{"context":{"timeZone":""}}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "i-tz-empty: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "i-tz-empty: missing ok line: $OUT"
echo "ok i-tz-empty"
p=$(new_project i-tz-utc)
printf '%s\n' '{"context":{"timeZone":"UTC"}}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "i-tz-utc: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "i-tz-utc: missing ok line: $OUT"
echo "ok i-tz-utc"
bad_value i-batch-24 '{"autopilot":{"batchHours":[24]}}' autopilot.batchHours
bad_value i-batch-neg '{"autopilot":{"batchHours":[-1]}}' autopilot.batchHours
bad_value i-batch-str '{"autopilot":{"batchHours":["3"]}}' autopilot.batchHours
bad_value i-batch-float '{"autopilot":{"batchHours":[3.5]}}' autopilot.batchHours
bad_value i-batch-string '{"autopilot":{"batchHours":"3,7"}}' autopilot.batchHours
bad_value i-batch-empty '{"autopilot":{"batchHours":[]}}' autopilot.batchHours
bad_value i-wait-0 '{"autopilot":{"waitHours":0}}' autopilot.waitHours
bad_value i-wait-neg '{"autopilot":{"waitHours":-1}}' autopilot.waitHours
bad_value i-wait-str '{"autopilot":{"waitHours":"4"}}' autopilot.waitHours
bad_value i-wait-169 '{"autopilot":{"waitHours":169}}' autopilot.waitHours
bad_value i-wait-null '{"autopilot":{"waitHours":null}}' autopilot.waitHours
bad_value i-merge-str '{"autopilot":{"mainAutoMerge":"true"}}' autopilot.mainAutoMerge
bad_value i-merge-1 '{"autopilot":{"mainAutoMerge":1}}' autopilot.mainAutoMerge
bad_value i-merge-null '{"autopilot":{"mainAutoMerge":null}}' autopilot.mainAutoMerge

# j. .foreman.json that is not valid JSON: exit 1 with a FAIL line naming .foreman.json
bad_value j-invalid-json '{"autopilot":' .foreman.json

echo "check-config tests: ok"

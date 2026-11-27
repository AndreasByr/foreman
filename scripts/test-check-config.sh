#!/usr/bin/env bash
# Tests scripts/check-config.sh in small temporary git projects (the autopilot-check --no-fetch warning). Run: bash scripts/test-check-config.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CHECK="$HERE/scripts/check-config.sh"
T=$(mktemp -d); SRV_PID=""
trap 'if [ -n "$SRV_PID" ]; then kill "$SRV_PID" 2>/dev/null || true; fi; rm -rf "$T"' EXIT
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
bad_value i-models-class '{"models":{"threads":{"fixpack":"huge"}}}' models.threads.fixpack
bad_value i-models-cat '{"models":{"threads":{"unknowncat":"standard"}}}' models.threads.unknowncat
bad_value i-models-coord '{"models":{"coordinator":"max"}}' models.coordinator
bad_value i-models-effort '{"models":{"effort":"extreme"}}' models.effort
bad_value i-models-type '{"models":"standard"}' models
p=$(new_project i-models-ok)
printf '%s\n' '{"models":{"coordinator":"standard","effort":"medium","threads":{"fixpack":"standard","roadmap":"strong","docs":"cheap"}}}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "i-models-ok: exit $RC, expected 0: $OUT"
echo "ok i-models-ok"
# models.ids: optional object with keys strong, standard, cheap; values non-empty strings matching ^[A-Za-z0-9][A-Za-z0-9._\[\]-]*$
bad_value i-models-ids-type '{"models":{"ids":"strong-test-id"}}' models.ids
bad_value i-models-ids-huge '{"models":{"ids":{"huge":"strong-test-id"}}}' models.ids
bad_value i-models-ids-empty '{"models":{"ids":{"strong":""}}}' models.ids
bad_value i-models-ids-space '{"models":{"ids":{"strong":"two words"}}}' models.ids
p=$(new_project i-models-ids-ok)
printf '%s\n' '{"models":{"ids":{"strong":"strong-test-id","standard":"standard-test-id","cheap":"cheap-test-id"}}}' > "$p/.foreman.json"
run_check "$p"
[ "$RC" -eq 0 ] || fail "i-models-ids-ok: exit $RC, expected 0: $OUT"
echo "ok i-models-ids-ok"
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

# k. itsaplan name check. A local stub stands in for the itsaplan API on 127.0.0.1; the stub writes its port to $T/port.
cat > "$T/stub.py" <<'PY'
import http.server, os, sys
T = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path != "/projects/TST":
            return self._send(404, b'{"error":"not found"}')
        if self.headers.get("x-api-key") != "secret-test-key":
            return self._send(401, b'{"error":"unauthorized"}')
        with open(os.path.join(T, "body.json"), "rb") as fh:
            return self._send(200, fh.read())
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
tmp = os.path.join(T, "port.tmp")
with open(tmp, "w") as fh:
    fh.write(str(srv.server_address[1]))
os.replace(tmp, os.path.join(T, "port"))
srv.serve_forever()
PY
python3 "$T/stub.py" "$T" >"$T/stub.log" 2>&1 &
SRV_PID=$!
for _ in $(seq 1 100); do [ -s "$T/port" ] && break; sleep 0.1; done
[ -s "$T/port" ] || fail "itsaplan stub did not start: $(cat "$T/stub.log")"
URL="http://127.0.0.1:$(cat "$T/port")"

# project_json COLUMNS LABELS: the stub's answer for GET /projects/TST; both lists are |-separated names
project_json() {
  python3 - "$T/body.json" "$1" "$2" <<'PY'
import json, sys
out, cols, labels = sys.argv[1:4]
doc = {"key": "TST",
       "columns": [{"name": n} for n in cols.split("|") if n],
       "labels": [{"name": n} for n in labels.split("|") if n]}
with open(out, "w", encoding="utf-8") as fh:
    json.dump(doc, fh)
PY
}

# run_env DIR ENV_ARGS...: runs the check from DIR under `env ENV_ARGS` (this call only); sets OUT and RC
run_env() {
  local dir=$1; shift
  RC=0
  OUT=$(cd "$dir" && env "$@" bash "$dir/scripts/check-config.sh" 2>&1) || RC=$?
}

# itsaplan_project NAME CONFIG_JSON: new project whose .foreman.json is CONFIG_JSON; prints its path
itsaplan_project() {
  local p
  p=$(new_project "$1")
  printf '%s\n' "$2" > "$p/.foreman.json"
  echo "$p"
}

ITS_CFG='{"tracker":{"type":"itsaplan"},"mirror":{"itsaplan":{"projectKey":"TST"}}}'
ENG_COLS="Backlog|Todo|In Progress|Action Required|Wait for Merge|Testing|In Review|Done"
ENG_LABELS="Milestone|Fix pack|AP: Coding|AP: Fix round|AP: Action Required|AP: Waiting for merge|AP: Pretest waiting|AP: Pretest running|AP: UAT ready|AP: Release ready"
FAIL_OUT=""

# k-english: all English names: exit 0 and ok line
p=$(itsaplan_project k-english "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-english: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "k-english: missing ok line: $OUT"
echo "ok k-english"

# k-label-typo: "AP: UAT bereit" instead of "AP: UAT ready": exit 1, FAIL lines name both labels
p=$(itsaplan_project k-label-typo "$ITS_CFG")
project_json "$ENG_COLS" "Milestone|Fix pack|AP: Coding|AP: Fix round|AP: Action Required|AP: Waiting for merge|AP: Pretest waiting|AP: Pretest running|AP: UAT bereit|AP: Release ready"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-label-typo: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*AP: UAT bereit' <<<"$OUT" || fail "k-label-typo: no FAIL line naming AP: UAT bereit: $OUT"
grep -q '^FAIL:.*AP: UAT ready' <<<"$OUT" || fail "k-label-typo: no FAIL line naming AP: UAT ready: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-label-typo"

# k-column-typo: "Wartet auf Merge" instead of "Wait for Merge": exit 1, FAIL lines name both
p=$(itsaplan_project k-column-typo "$ITS_CFG")
project_json "Backlog|Todo|In Progress|Action Required|Wartet auf Merge|Testing|In Review|Done" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-column-typo: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Wait for Merge' <<<"$OUT" || fail "k-column-typo: no FAIL line naming Wait for Merge: $OUT"
grep -q '^FAIL:.*Wartet auf Merge' <<<"$OUT" || fail "k-column-typo: no FAIL line naming Wartet auf Merge: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-column-typo"

# k-alias-intervention: "Intervention needed" is an alias of "Action Required": exit 0, no FAIL line
p=$(itsaplan_project k-alias-intervention "$ITS_CFG")
project_json "Backlog|Todo|In Progress|Intervention needed|Wait for Merge|Testing|In Review|Done" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-alias-intervention: exit $RC, expected 0: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-alias-intervention: unexpected FAIL line: $OUT"
echo "ok k-alias-intervention"

# k-alias-config: tracker.columnAliases maps "Waiting" to "Wait for Merge": exit 0, no FAIL line
p=$(itsaplan_project k-alias-config '{"tracker":{"type":"itsaplan","columnAliases":{"Wait for Merge":["Waiting"]}},"mirror":{"itsaplan":{"projectKey":"TST"}}}')
project_json "Backlog|Todo|In Progress|Action Required|Waiting|Testing|In Review|Done" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-alias-config: exit $RC, expected 0: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-alias-config: unexpected FAIL line: $OUT"
echo "ok k-alias-config"

# k-prefix: mirror.itsaplan.labelPrefix "X: " is used for the expected labels: exit 0, no FAIL line
p=$(itsaplan_project k-prefix '{"tracker":{"type":"itsaplan"},"mirror":{"itsaplan":{"projectKey":"TST","labelPrefix":"X: "}}}')
project_json "$ENG_COLS" "Milestone|Fix pack|X: Coding|X: Fix round|X: Action Required|X: Waiting for merge|X: Pretest waiting|X: Pretest running|X: UAT ready|X: Release ready"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-prefix: exit $RC, expected 0: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-prefix: unexpected FAIL line: $OUT"
echo "ok k-prefix"

# k-no-env: ITSAPLAN_URL and ITSAPLAN_API_KEY unset: exit 0 and a note: line naming itsaplan
p=$(itsaplan_project k-no-env "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" -u ITSAPLAN_URL -u ITSAPLAN_API_KEY
[ "$RC" -eq 0 ] || fail "k-no-env: exit $RC, expected 0: $OUT"
grep -Ei '^note:.*itsaplan' <<<"$OUT" >/dev/null || fail "k-no-env: missing note: line naming itsaplan: $OUT"
echo "ok k-no-env"

# k-tracker-none: tracker "none" with the stub reachable: exit 0, output does not mention itsaplan
p=$(itsaplan_project k-tracker-none '{"tracker":{"type":"none"},"mirror":{"itsaplan":{"projectKey":"TST"}}}')
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-tracker-none: exit $RC, expected 0: $OUT"
grep -Eqi 'itsaplan' <<<"$OUT" && fail "k-tracker-none: output mentions itsaplan: $OUT"
echo "ok k-tracker-none"

# k-wrong-key: wrong API key: exit 0, WARN line with HTTP 401, the key never printed
p=$(itsaplan_project k-wrong-key "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=wrong
[ "$RC" -eq 0 ] || fail "k-wrong-key: exit $RC, expected 0: $OUT"
grep -q "WARN:" <<<"$OUT" || fail "k-wrong-key: missing WARN line: $OUT"
grep -q "401" <<<"$OUT" || fail "k-wrong-key: WARN line does not contain 401: $OUT"
grep -q "wrong" <<<"$OUT" && fail "k-wrong-key: output contains the wrong key: $OUT"
grep -q "secret-test-key" <<<"$OUT" && fail "k-wrong-key: output contains the API key: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-wrong-key"

# k-unreachable: server not reachable (port 9): exit 0 and a WARN line
p=$(itsaplan_project k-unreachable "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL=http://127.0.0.1:9 ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-unreachable: exit $RC, expected 0: $OUT"
grep -q "WARN:" <<<"$OUT" || fail "k-unreachable: missing WARN line: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-unreachable"

# k-extra-label: extra labels and an extra column that foreman does not use: exit 0, ok line, no FAIL line
p=$(itsaplan_project k-extra-label "$ITS_CFG")
project_json "$ENG_COLS|Canceled" "$ENG_LABELS|Bug|Feature|v0.2.0"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-extra-label: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "k-extra-label: missing ok line: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-extra-label: unexpected FAIL line: $OUT"
echo "ok k-extra-label"

# k-extra-prefix-label: a label with the foreman prefix that foreman does not use: exit 1, FAIL line names it
p=$(itsaplan_project k-extra-prefix-label "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|AP: Something else"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-extra-prefix-label: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*AP: Something else' <<<"$OUT" || fail "k-extra-prefix-label: no FAIL line naming AP: Something else: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-extra-prefix-label"

# k-empty-project: the project has no columns and no labels: exit 1, FAIL lines name a column and a label, no key printed
p=$(itsaplan_project k-empty-project "$ITS_CFG")
project_json "" ""
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-empty-project: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Wait for Merge' <<<"$OUT" || fail "k-empty-project: no FAIL line naming Wait for Merge: $OUT"
grep -q '^FAIL:.*AP: UAT ready' <<<"$OUT" || fail "k-empty-project: no FAIL line naming AP: UAT ready: $OUT"
grep -q "secret-test-key" <<<"$OUT" && fail "k-empty-project: output contains the API key: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-empty-project"

# k-wrong-project-key: projectKey NOPE, the stub answers 404: exit 0, WARN line with 404, no key printed
p=$(itsaplan_project k-wrong-project-key '{"tracker":{"type":"itsaplan"},"mirror":{"itsaplan":{"projectKey":"NOPE"}}}')
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-wrong-project-key: exit $RC, expected 0: $OUT"
grep -q '^WARN:.*404' <<<"$OUT" || fail "k-wrong-project-key: no WARN line containing 404: $OUT"
grep -q "secret-test-key" <<<"$OUT" && fail "k-wrong-project-key: output contains the API key: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-wrong-project-key"

# k-invalid-json: the stub answers 200 with a body that is not JSON: exit 0, WARN line, no key printed
p=$(itsaplan_project k-invalid-json "$ITS_CFG")
printf '%s' 'not json' > "$T/body.json"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-invalid-json: exit $RC, expected 0: $OUT"
grep -q '^WARN:' <<<"$OUT" || fail "k-invalid-json: missing WARN line: $OUT"
grep -q "secret-test-key" <<<"$OUT" && fail "k-invalid-json: output contains the API key: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-invalid-json"

# k-modules-only: the itsaplan module is listed, no tracker block: the name check still runs, label typo is a FAIL
p=$(itsaplan_project k-modules-only '{"modules":["tracker-itsaplan"],"mirror":{"itsaplan":{"projectKey":"TST"}}}')
project_json "$ENG_COLS" "Milestone|Fix pack|AP: Coding|AP: Fix round|AP: Action Required|AP: Waiting for merge|AP: Pretest waiting|AP: Pretest running|AP: UAT bereit|AP: Release ready"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-modules-only: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*AP: UAT bereit' <<<"$OUT" || fail "k-modules-only: no FAIL line naming AP: UAT bereit: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-modules-only"

# k-string-alias: columnAliases with a string instead of a list: exit 1, the column "Waiting" is not a name foreman uses
p=$(itsaplan_project k-string-alias '{"tracker":{"type":"itsaplan","columnAliases":{"Wait for Merge":"Waiting"}},"mirror":{"itsaplan":{"projectKey":"TST"}}}')
project_json "Backlog|Todo|In Progress|Action Required|Waiting|Testing|In Review|Done" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-string-alias: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Waiting' <<<"$OUT" || fail "k-string-alias: no FAIL line naming Waiting: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-string-alias"

# k-german-extra-label: all English names plus the extra label "Fix-Paket": exit 1, FAIL lines name "Fix-Paket" and "Fix pack"
p=$(itsaplan_project k-german-extra-label "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|Fix-Paket"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-german-extra-label: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Fix-Paket' <<<"$OUT" || fail "k-german-extra-label: no FAIL line naming Fix-Paket: $OUT"
grep -q '^FAIL:.*Fix pack' <<<"$OUT" || fail "k-german-extra-label: no FAIL line naming Fix pack: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-german-extra-label"

# k-german-extra-column: all English names plus the extra column "Abgebrochen": exit 1, FAIL line names it
p=$(itsaplan_project k-german-extra-column "$ITS_CFG")
project_json "$ENG_COLS|Abgebrochen" "$ENG_LABELS"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-german-extra-column: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Abgebrochen' <<<"$OUT" || fail "k-german-extra-column: no FAIL line naming Abgebrochen: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-german-extra-column"

# k-german-prefix-label: all English names plus the label "AP: UAT bereit": exit 1, FAIL lines name it and "AP: UAT ready"
p=$(itsaplan_project k-german-prefix-label "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|AP: UAT bereit"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-german-prefix-label: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*AP: UAT bereit' <<<"$OUT" || fail "k-german-prefix-label: no FAIL line naming AP: UAT bereit: $OUT"
grep -q '^FAIL:.*AP: UAT ready' <<<"$OUT" || fail "k-german-prefix-label: no FAIL line naming AP: UAT ready: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-german-prefix-label"

# k-german-umlaut: all English names plus the extra label "Prüfung": exit 1, FAIL line names it
p=$(itsaplan_project k-german-umlaut "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|Prüfung"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-german-umlaut: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Prüfung' <<<"$OUT" || fail "k-german-umlaut: no FAIL line naming Prüfung: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-german-umlaut"

# k-english-art-mit: all English names plus the extra labels "Concept art", "UI art" and "MIT": exit 0, ok line, no FAIL line
p=$(itsaplan_project k-english-art-mit "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|Concept art|UI art|MIT"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-english-art-mit: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "k-english-art-mit: missing ok line: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-english-art-mit: unexpected FAIL line: $OUT"
echo "ok k-english-art-mit"

# k-art-exact: all English names plus the extra label "Art": exit 1, FAIL line names "Art" and the English name "Type"
p=$(itsaplan_project k-art-exact "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS|Art"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-art-exact: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*"Art".*Type' <<<"$OUT" || fail "k-art-exact: no FAIL line naming Art and Type: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-art-exact"

# k-extra-names: extra labels Bug, Feature, Improvement, v0.2.0 and extra column Canceled: exit 0, ok line, no FAIL line
p=$(itsaplan_project k-extra-names "$ITS_CFG")
project_json "$ENG_COLS|Canceled" "$ENG_LABELS|Bug|Feature|Improvement|v0.2.0"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 0 ] || fail "k-extra-names: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "k-extra-names: missing ok line: $OUT"
grep -q "FAIL:" <<<"$OUT" && fail "k-extra-names: unexpected FAIL line: $OUT"
echo "ok k-extra-names"

# k-missing-found-name: the project has "Meilenstein" instead of "Milestone": exit 1, FAIL lines name both
p=$(itsaplan_project k-missing-found-name "$ITS_CFG")
project_json "$ENG_COLS" "Meilenstein|Fix pack|AP: Coding|AP: Fix round|AP: Action Required|AP: Waiting for merge|AP: Pretest waiting|AP: Pretest running|AP: UAT ready|AP: Release ready"
run_env "$p" ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key
[ "$RC" -eq 1 ] || fail "k-missing-found-name: exit $RC, expected 1: $OUT"
grep -q '^FAIL:.*Meilenstein' <<<"$OUT" || fail "k-missing-found-name: no FAIL line naming Meilenstein: $OUT"
grep -q '^FAIL:.*Milestone' <<<"$OUT" || fail "k-missing-found-name: no FAIL line naming Milestone: $OUT"
FAIL_OUT="$FAIL_OUT$OUT"
echo "ok k-missing-found-name"

# k-proxy-ignored: proxy variables point at port 9, NO_PROXY unset, stub on 127.0.0.1: exit 0, ok line, no WARN line
p=$(itsaplan_project k-proxy-ignored "$ITS_CFG")
project_json "$ENG_COLS" "$ENG_LABELS"
run_env "$p" -u NO_PROXY -u no_proxy ITSAPLAN_URL="$URL" ITSAPLAN_API_KEY=secret-test-key HTTP_PROXY=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9
[ "$RC" -eq 0 ] || fail "k-proxy-ignored: exit $RC, expected 0: $OUT"
grep -q "foreman config check: ok" <<<"$OUT" || fail "k-proxy-ignored: missing ok line: $OUT"
grep -q "WARN:" <<<"$OUT" && fail "k-proxy-ignored: unexpected WARN line: $OUT"
echo "ok k-proxy-ignored"

# k-no-key-in-output: the API key appears in no output of the failing and warning cases
grep -q "secret-test-key" <<<"$FAIL_OUT" && fail "k-no-key-in-output: the API key appears in the output of a failing case"
echo "ok k-no-key-in-output"

# k-copy-identical: the template copy of check-config.sh is byte-identical to scripts/check-config.sh
[ -f "$HERE/template/scripts/check-config.sh" ] || fail "k-copy-identical: template/scripts/check-config.sh is missing"
cmp -s "$HERE/scripts/check-config.sh" "$HERE/template/scripts/check-config.sh" || fail "k-copy-identical: template/scripts/check-config.sh differs from scripts/check-config.sh (copy the file so both are identical)"
echo "ok k-copy-identical"

# l. wiki block in .foreman.json: exit 1 with a FAIL line naming the field, exit 0 with the ok line otherwise
# good_value NAME JSON: .foreman.json holding JSON must exit 0 and print the ok line
good_value() {
  local p
  p=$(new_project "$1")
  printf '%s\n' "$2" > "$p/.foreman.json"
  run_check "$p"
  [ "$RC" -eq 0 ] || fail "$1: exit $RC, expected 0: $OUT"
  grep -q "foreman config check: ok" <<<"$OUT" || fail "$1: missing ok line: $OUT"
  echo "ok $1"
}

# l-no-wiki: no wiki key: exit 0 and ok line
good_value l-no-wiki '{"unrelated":true}'

# l-enabled-*: enabled must be a boolean
bad_value l-enabled-string '{"wiki":{"enabled":"true"}}' wiki.enabled
bad_value l-enabled-null '{"wiki":{"enabled":null}}' wiki.enabled
bad_value l-enabled-number '{"wiki":{"enabled":1}}' wiki.enabled

# l-disabled-empty: enabled false needs nothing else: empty language, audiences and rootPageId pass
good_value l-disabled-empty '{"wiki":{"enabled":false,"language":"","audiences":[],"rootPageId":"","forbidden":[]}}'

# l-lang-*: enabled true needs a language, from wiki.language or context.language
bad_value l-lang-empty '{"wiki":{"enabled":true,"language":"","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123"}}' wiki.language
good_value l-ok-wiki-language '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123","forbidden":["Projekt B"]}}'
good_value l-ok-context-language '{"context":{"language":"de"},"wiki":{"enabled":true,"language":"","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123","forbidden":[]}}'

# l-audiences-*: enabled true needs a non-empty list of audiences, each with a non-empty name, names unique (case-insensitive)
bad_value l-audiences-empty '{"wiki":{"enabled":true,"language":"de","audiences":[],"rootPageId":"123"}}' wiki.audiences
bad_value l-audiences-string '{"wiki":{"enabled":true,"language":"de","audiences":"Spieler und Tester","rootPageId":"123"}}' wiki.audiences
bad_value l-audience-noname '{"wiki":{"enabled":true,"language":"de","audiences":[{"description":"ohne Name"}],"rootPageId":"123"}}' wiki.audiences
bad_value l-audience-blank-name '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"","description":"leerer Name"}],"rootPageId":"123"}}' wiki.audiences
bad_value l-audience-dup '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Tester"},{"name":"tester"}],"rootPageId":"123"}}' wiki.audiences

# l-rootpage-empty: enabled true needs a rootPageId
bad_value l-rootpage-empty '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":""}}' wiki.rootPageId
# l-rootpage-missing: enabled true with no rootPageId key at all: FAIL naming wiki.rootPageId
bad_value l-rootpage-missing '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}]}}' wiki.rootPageId

# l-forbidden-*: entries must be non-empty strings, also when disabled
bad_value l-forbidden-number '{"wiki":{"enabled":false,"forbidden":[42]}}' wiki.forbidden
bad_value l-forbidden-empty-string '{"wiki":{"enabled":false,"forbidden":[""]}}' wiki.forbidden
bad_value l-forbidden-enabled-empty '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123","forbidden":[""]}}' wiki.forbidden

# l-root-*: with the wiki enabled, wiki.rootPageId must differ from docsNotion.rootPageId
bad_value l-root-same '{"docsNotion":{"rootPageId":"123"},"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123"}}' wiki.rootPageId
good_value l-root-different '{"docsNotion":{"rootPageId":"456"},"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"123"}}'
# l-root-same-normalized: the ids are equal once dashes are removed and case is ignored
bad_value l-root-same-dashes '{"docsNotion":{"rootPageId":"0123456789abcdef0123456789abcdef"},"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"0123-4567-89AB-CDEF-0123-4567-89AB-CDEF"}}' wiki.rootPageId
bad_value l-root-same-case '{"docsNotion":{"rootPageId":"0123456789ABCDEF0123456789ABCDEF"},"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler und Tester"}],"rootPageId":"0123456789abcdef0123456789abcdef"}}' wiki.rootPageId

# l-audience-slug-*: an audience name needs a non-empty slug, and two names must not share one
bad_value l-audience-slug-empty '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"!!!"}],"rootPageId":"123"}}' wiki.audiences
bad_value l-audience-slug-dup '{"wiki":{"enabled":true,"language":"de","audiences":[{"name":"Spieler/Tester"},{"name":"Spieler Tester"}],"rootPageId":"123"}}' wiki.audiences

echo "check-config tests: ok"

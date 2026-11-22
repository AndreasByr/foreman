#!/usr/bin/env bash
# Test for the section "## What is measured" in docs/learnings.md (M012 S3; moved out of the README).
# Runs from any directory. Success: prints "readme test: ok". Failure: "FAIL: <reason>" on stderr, exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

README="docs/learnings.md"
BASELINE_COMMIT="9c51ceb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# Parser and checks 1, 2, 3 (baseline numbers), 4 and 5. Reads README_FILE and JSON_FILE (empty = skip check 3).
cat > "$TMP/check.js" <<'JS'
"use strict";
const fs = require("fs");

function fail(msg) {
  console.error("FAIL: " + msg);
  process.exit(1);
}

const file = process.env.README_FILE;
const jsonFile = process.env.JSON_FILE || "";
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

// Section: from the heading up to the next "## " heading.
const HEADING = "## What is measured";
const start = lines.indexOf(HEADING);
if (start < 0) fail(`${file} has no line "${HEADING}"`);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) { end = i; break; }
}
const sec = lines.slice(start + 1, end);
const secText = sec.join("\n");

// Check 2: table rows. Columns: label, 0.2.1 value, 0.2.x value, change.
const LABELS = { "Milestone": "milestone-run", "Fix pack": "fixpack-run", "Batch": "batch-run" };
const NUM = "(\\d{1,3}(?:,\\d{3})+|\\d+)";
const VALUE_RE = new RegExp(`^${NUM} B$`);
const CHANGE_RE = new RegExp(`^([+-]?)${NUM} B$`);
const toInt = (s) => Number(s.replace(/,/g, ""));

const rows = {};
for (const line of sec) {
  const m = /^\| (Milestone|Fix pack|Batch) \|/.exec(line);
  if (!m) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length !== 4) fail(`row "${m[1]}" has ${cells.length} columns, need 4 (label, 0.2.1, 0.2.x, change)`);
  rows[cells[0]] = cells;
}

const parsed = {};
for (const label of Object.keys(LABELS)) {
  const cells = rows[label];
  if (!cells) fail(`section "${HEADING}" has no table row "| ${label} |"`);
  const [, base, now, change] = cells;
  const vb = VALUE_RE.exec(base);
  const vn = VALUE_RE.exec(now);
  const vc = CHANGE_RE.exec(change);
  if (!vb) fail(`${label}: 0.2.1 value "${base}" is not like "43,065 B"`);
  if (!vn) fail(`${label}: 0.2.x value "${now}" is not like "42,636 B"`);
  if (!vc) fail(`${label}: change "${change}" is not like "-429 B", "+12 B" or "0 B"`);
  const b = toInt(vb[1]);
  const n = toInt(vn[1]);
  const c = (vc[1] === "-" ? -1 : 1) * toInt(vc[2]);
  if (c !== n - b) fail(`${label}: change "${change}" is ${c} B, but 0.2.x minus 0.2.1 is ${n - b} B`);
  if (n > b) fail(`${label}: 0.2.x (${now}) is above 0.2.1 (${base}); the rule is never more than 0.2.1`);
  parsed[label] = { base: b, now: n };
}

// Check 3: the 0.2.1 values equal the baseline of the three work-run scenarios.
if (jsonFile) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  } catch (e) {
    fail(`scripts/measure-reads.mjs --json gave no readable JSON (${e.message})`);
  }
  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
  for (const label of Object.keys(LABELS)) {
    const name = LABELS[label];
    const sc = scenarios.find((s) => s.name === name);
    if (!sc) fail(`measure-reads JSON has no scenario "${name}"`);
    if (sc.baseline !== parsed[label].base) {
      fail(`${label}: 0.2.1 in README is ${parsed[label].base} B, but the baseline of ${name} is ${sc.baseline} B`);
    }
    if (sc.current !== parsed[label].now) {
      fail(`${label}: README says ${parsed[label].now} B for 0.2.x but scripts/measure-reads.mjs measures ${sc.current} B; update the table`);
    }
  }
}

// Check 4: "**Fake APIs only in CI**" followed by at least 3 bullet lines.
const MARK = "**Fake APIs only in CI**";
const mi = sec.findIndex((l) => l.startsWith(MARK));
if (mi < 0) fail(`section "${HEADING}" has no line starting with "${MARK}"`);
let bullets = 0;
for (let j = mi + 1; j < sec.length; j++) {
  const l = sec[j];
  if (/^- /.test(l)) { bullets++; continue; }
  if (l.trim() === "" && j + 1 < sec.length && /^- /.test(sec[j + 1])) continue;
  break;
}
if (bullets < 3) fail(`"${MARK}" is followed by ${bullets} bullet lines, need at least 3`);

// Check 5: the section names the metrics doc and the script that writes it.
for (const token of ["docs/metrics.md", "scripts/measure.mjs"]) {
  if (!secText.includes(token)) fail(`section "${HEADING}" does not mention ${token}`);
}
JS

# check_readme FILE: all checks on FILE. Exits 1 with FAIL on the first broken check.
check_readme() {
  local file="$1" json=""
  if git cat-file -e "${BASELINE_COMMIT}^{commit}" 2>/dev/null; then
    node scripts/measure-reads.mjs --json > "$TMP/measure.json" 2>/dev/null || true
    json="$TMP/measure.json"
  elif [ -n "${CI:-}" ]; then
    fail "baseline commit ${BASELINE_COMMIT} missing in CI; use fetch-depth: 0"
  else
    echo "readme test: baseline numbers not checked (${BASELINE_COMMIT} missing)"
  fi
  README_FILE="$file" JSON_FILE="$json" node "$TMP/check.js"
}

check_readme "$README"

# Negative self-check: a copy with the Fix pack change set to -1 B must be rejected by the same check.
sed -E '/^\| Fix pack \|/ s/\| [+-]?[0-9,]+ B \|$/| -1 B |/' "$README" > "$TMP/mutated.md"
if cmp -s "$README" "$TMP/mutated.md"; then
  fail "self-check: could not alter the Fix pack change in the copy"
fi
if msg="$(check_readme "$TMP/mutated.md" 2>&1)"; then
  fail "self-check: copy with Fix pack change -1 B was accepted"
fi
case "$msg" in
  *"FAIL: "*"Fix pack"*) ;;
  *) fail "self-check: copy failed for another reason: $msg" ;;
esac

# Second negative self-check (only when the measure-reads JSON is available): Batch 0.2.x lowered by 1 B and its
# change adjusted (change = now - base, more negative) keep checks 1-2 valid even when Batch equals the baseline,
# so only the comparison with the measured value can reject it. Skipped when the Batch 0.2.x value is 0.
if git cat-file -e "${BASELINE_COMMIT}^{commit}" 2>/dev/null && [ -s "$TMP/measure.json" ]; then
  rc=0
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith("| Batch |"));
    const c = lines[i].split("|").map((s) => s.trim());
    const n = (s) => Number(s.replace(/[^0-9]/g, ""));
    const fmt = (v) => v.toLocaleString("en-US") + " B";
    if (n(c[3]) === 0) process.exit(3);
    const now = n(c[3]) - 1;
    const ch = now - n(c[2]);
    lines[i] = "| Batch | " + c[2] + " | " + fmt(now) + " | " + (ch > 0 ? "+" : ch < 0 ? "-" : "") + fmt(Math.abs(ch)) + " |";
    fs.writeFileSync(process.argv[2], lines.join("\n"));
  ' "$README" "$TMP/mutated2.md" || rc=$?
  if [ "$rc" -eq 3 ]; then
    echo "readme test: second self-check skipped (Batch 0.2.x is 0 B)"
  elif [ "$rc" -ne 0 ]; then
    fail "self-check: could not build the Batch copy"
  else
    if cmp -s "$README" "$TMP/mutated2.md"; then
      fail "self-check: could not alter the Batch 0.2.x value in the copy"
    fi
    if msg="$(check_readme "$TMP/mutated2.md" 2>&1)"; then
      fail "self-check: copy with a changed Batch 0.2.x value was accepted"
    fi
    case "$msg" in
      *"FAIL: Batch: README says "*" B for 0.2.x"*) ;;
      *) fail "self-check: copy failed for another reason: $msg" ;;
    esac
  fi
fi

echo "readme test: ok"

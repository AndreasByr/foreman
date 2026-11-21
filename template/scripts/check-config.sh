#!/usr/bin/env bash
# CI guard for the foreman setup: no opusplan, size limits, no committed worker task files, autopilot-check --no-fetch warning (warn only), .foreman.json settings.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fail=0

if grep -rqs '"opusplan"\|opusplan' .claude/settings.json .claude/settings.local.json 2>/dev/null; then
  echo "FAIL: opusplan in .claude/settings*.json (autonomous runs never enter plan mode and run on the smaller model). Set a fixed model name."; fail=1
fi
if grep -vs '^[[:space:]]*#' tools/delegate/config.toml | grep -q 'opusplan'; then
  echo "FAIL: opusplan in tools/delegate/config.toml. Set a fixed model name."; fail=1
fi

size() { wc -c < "$1" | tr -d ' '; }
if [ -f CLAUDE.md ] && [ "$(size CLAUDE.md)" -gt 2600 ]; then
  echo "FAIL: CLAUDE.md is $(size CLAUDE.md) bytes (limit ~2 KB, move details into skills or docs/learnings.md)"; fail=1
fi
skill=.claude/skills/foreman-delegation/SKILL.md
if [ -f "$skill" ]; then
  core=$(awk '/^## Core[[:space:]]*$/{on=1; next} on && /^## /{exit} on{print}' "$skill" | wc -c | tr -d ' ')
  if [ "$core" -gt 1800 ]; then echo "FAIL: Core section of $skill is $core bytes (limit ~1.5 KB)"; fail=1; fi
fi
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  if [ "$(size "$f")" -gt 10240 ]; then
    echo "WARN: $f is $(size "$f") bytes (target ~8 KB, move parts to references/)"
  fi
done

n=$(git ls-files tools/delegate/tasks 2>/dev/null | grep -v '\.gitkeep$' | wc -l | tr -d ' ')
if [ "$n" -gt 0 ]; then echo "FAIL: $n worker task files are committed in tools/delegate/tasks. Remove them with git rm --cached."; fail=1; fi

ap=(scripts/autopilot-check.*)
if [ -e "${ap[0]}" ] && ! grep -qs -- '--no-fetch' "${ap[@]}"; then
  echo "WARN: scripts/autopilot-check.* does not support --no-fetch. The dispatcher passes it; without support the check fails with its exit code and nothing is started. Add the option (see the template scripts/autopilot-check.mjs)."
fi

# .foreman.json settings: python3 stdlib only; a missing file or missing python3 is fine.
if [ -f .foreman.json ] && command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' || fail=1
import json, re, sys
import zoneinfo

bad = False
try:
    with open(".foreman.json", encoding="utf-8") as fh:
        cfg = json.load(fh)
except (ValueError, OSError):
    print("FAIL: .foreman.json is not valid JSON")
    sys.exit(1)
if not isinstance(cfg, dict):
    cfg = {}

ctx = cfg.get("context")
if isinstance(ctx, dict) and "timeZone" in ctx:
    tz = ctx["timeZone"]
    ok = isinstance(tz, str) and re.fullmatch(r"[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){0,2}", tz) is not None
    if ok:
        try:
            zoneinfo.ZoneInfo(tz)
        except Exception:
            ok = False
    if not ok:
        print("FAIL: context.timeZone must be a non-empty IANA time zone name such as Europe/Berlin")
        bad = True

ap = cfg.get("autopilot")
if isinstance(ap, dict):
    if "batchHours" in ap:
        bh = ap["batchHours"]
        if not (isinstance(bh, list) and bh and all(type(h) is int and 0 <= h <= 23 for h in bh)):
            print("FAIL: autopilot.batchHours must be a non-empty list of integers from 0 to 23")
            bad = True
    if "waitHours" in ap:
        w = ap["waitHours"]
        if not (type(w) in (int, float) and 0 < w <= 168):
            print("FAIL: autopilot.waitHours must be a number greater than 0 and at most 168")
            bad = True
    if "mainAutoMerge" in ap and not isinstance(ap["mainAutoMerge"], bool):
        print("FAIL: autopilot.mainAutoMerge must be true or false")
        bad = True

sys.exit(1 if bad else 0)
PY
fi

[ $fail = 0 ] && echo "foreman config check: ok"
exit $fail

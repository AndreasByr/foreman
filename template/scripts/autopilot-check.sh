#!/usr/bin/env bash
# Delegation check: reads every unit's STATE.md on origin/batch/*, open batch PRs and the clock,
# and prints finished lines. The delegation model never computes times, locks or statuses itself.
#
# Output lines (TASK lines are already in priority order):
#   TASK|batch-finish|<unit>|...     unit stuck in batch-pr > 30 min, branch already in target
#   TASK|batch|batch:<dev|main>|...
#   TASK|release-reminder|-|<units>
#   TASK|coding|<unit>|<status>, since <time>
#   CHECK-PRETEST|<unit>|<status>|<tracker>
#   CHECK-INPUT|<unit>|<status>|<tracker>
#   LOCKED|<unit>|<status>|lock <time>
#   TIME|weekday <1-7>, hour <HH> (<tz>)
#   NOTHING                          when there is no TASK/CHECK line
#
# Settings (env): FOREMAN_TZ (default UTC), FOREMAN_BATCH_HOURS (default "03 07 11 15 19 23"),
# FOREMAN_RELEASE_WEEKDAY (default 5), FOREMAN_RELEASE_HOUR (default 09),
# FOREMAN_LOCK_SECONDS (default 10800), FOREMAN_WAIT_SECONDS (default 14400).
set -uo pipefail

TZ_NAME="${FOREMAN_TZ:-UTC}"
BATCH_HOURS="${FOREMAN_BATCH_HOURS:-03 07 11 15 19 23}"
REL_WD="${FOREMAN_RELEASE_WEEKDAY:-5}"
REL_H="${FOREMAN_RELEASE_HOUR:-09}"
LOCK_S="${FOREMAN_LOCK_SECONDS:-10800}"
WAIT_S="${FOREMAN_WAIT_SECONDS:-14400}"

git fetch -q --depth 1 origin '+refs/heads/batch/*:refs/remotes/origin/batch/*' \
  '+refs/heads/dev:refs/remotes/origin/dev' '+refs/heads/main:refs/remotes/origin/main' 2>/dev/null

now=$(date -u +%s)
h=$(TZ="$TZ_NAME" date +%H)
wd=$(TZ="$TZ_NAME" date +%u)
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo "")
owner=${repo%%/*}
tmp=$(mktemp)
out=$(mktemp)
trap 'rm -f "$tmp" "$out"' EXIT

epoch() { date -u -d "$1" +%s 2>/dev/null || echo 0; }
field() { printf '%s\n' "$1" | sed -nE "s/^$2:[[:space:]]*(.*)$/\\1/p" | head -1; }

for b in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/batch/'); do
  n=${b#origin/batch/}
  case $n in
    main|dev) files=$(git ls-tree -r --name-only "$b" docs/fixpacks 2>/dev/null | grep '/STATE.md$' | grep -v _TEMPLATE) ;;
    m[0-9]*)  files="docs/milestones/M${n#m}/STATE.md" ;;
    *) continue ;;
  esac
  for f in $files; do
    s=$(git show "$b:$f" 2>/dev/null) || continue
    st=$(field "$s" Status | sed -nE 's/^([a-z-]+).*/\1/p')
    [ -z "$st" ] && continue
    case $n in
      main|dev)
        target=$(field "$s" Target | sed -nE 's/^`?(main|dev).*/\1/p')
        [ -n "$target" ] && [ "$target" != "$n" ] && continue
        unit="$n:$(basename "$(dirname "$f")")" ;;
      *) unit="M${n#m}" ;;
    esac
    since=$(field "$s" Status | sed -nE 's/.*since ([0-9T:-]+Z).*/\1/p'); since=${since:-0000}
    lock=$(field "$s" Lock | sed -nE 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z).*/\1/p')
    tracker=$(field "$s" Tracker)
    # A unit whose batch PR is merged but which was never closed: finish it, even when locked.
    if [ "$st" = batch-pr ] && [ "$since" != 0000 ] && [ $(( now - $(epoch "$since") )) -gt 1800 ]; then
      tgt=dev; [ "$n" = main ] && tgt=main
      if git merge-base --is-ancestor "$b" "origin/$tgt" 2>/dev/null; then
        echo "0|$since|batch-finish|$unit|branch already in $tgt" >> "$tmp"; continue
      fi
    fi
    if [ -n "$lock" ] && [ $(( now - $(epoch "$lock") )) -lt "$LOCK_S" ]; then
      echo "LOCKED|$unit|$st|lock $lock" >> "$out"; continue
    fi
    case $st in
      pretest-waiting|pretest-running) echo "CHECK-PRETEST|$unit|$st|${tracker:--}" >> "$out" ;;
      needs-input) echo "CHECK-INPUT|$unit|$st|${tracker:--}" >> "$out" ;;
      planning|slice|rework|validation|batch-pr|fixpack) echo "3|$since|coding|$unit|$st" >> "$tmp" ;;
      awaiting-merge) case $n in main|dev) echo "WM|$n|$since" >> "$tmp" ;; esac ;;
      release-ready) echo "RR|$unit" >> "$tmp" ;;
    esac
  done
done

slot=0
for x in $BATCH_HOURS; do [ "$x" = "$h" ] && slot=1; done
for z in dev main; do
  prs=0
  [ -n "$repo" ] && prs=$(gh api "repos/$repo/pulls?state=open&head=$owner:batch/$z" --jq length 2>/dev/null || echo 0)
  wm=$(grep -c "^WM|$z|" "$tmp")
  oldest=$(grep "^WM|$z|" "$tmp" | cut -d'|' -f3 | sort | head -1)
  inz=0; git merge-base --is-ancestor "origin/batch/$z" "origin/$z" 2>/dev/null && inz=1
  old=0; [ -n "$oldest" ] && [ "$oldest" != 0000 ] && [ $(( now - $(epoch "$oldest") )) -gt "$WAIT_S" ] && old=1
  if [ "${prs:-0}" -gt 0 ] || { [ "$wm" -gt 0 ] && { [ $slot = 1 ] || [ $old = 1 ] || [ $inz = 1 ]; }; }; then
    echo "1|${oldest:-0000}|batch|batch:$z|open PRs ${prs:-0}, awaiting-merge $wm" >> "$tmp"
  fi
done
rr=$(grep -c '^RR|' "$tmp")
if [ "$wd" = "$REL_WD" ] && [ "$h" = "$REL_H" ] && [ "$rr" -gt 0 ]; then
  echo "2|0000|release-reminder|-|$(grep '^RR|' "$tmp" | cut -d'|' -f2 | tr '\n' ' ')" >> "$tmp"
fi

grep -E '^[0-3]\|' "$tmp" | sort -t'|' -k1,1n -k2,2 | while IFS='|' read -r _ s kind unit info; do
  echo "TASK|$kind|$unit|$info, since $s"
done
cat "$out"
if ! grep -qE '^[0-3]\|' "$tmp" && ! grep -qE '^CHECK-' "$out"; then echo "NOTHING"; fi
echo "TIME|weekday $wd, hour $h ($TZ_NAME)"

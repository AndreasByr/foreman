#!/usr/bin/env bash
# Checks that the dispatcher docs, module docs, learnings and skill rules name the required terms,
# and that the skill carries the rule without its reasoning. Run: bash scripts/test-dispatcher-docs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "dispatcher docs test FAIL: $*"; exit 1; }

# need FILE TERM: FILE must exist and contain TERM (fixed string)
need() {
  [ -f "$1" ] || fail "missing file $1"
  grep -q -F -- "$2" "$1" || fail "$1 does not contain '$2'"
  echo "ok $1 contains '$2'"
}

# forbid FILE TERM: FILE must exist and must not contain TERM (fixed string)
forbid() {
  [ -f "$1" ] || fail "missing file $1"
  if grep -q -F -- "$2" "$1"; then fail "$1 must not contain '$2'"; fi
  echo "ok $1 does not contain '$2'"
}

# dispatcher/README.md
for term in webhook_format pass_env fire_command fire-claude.example.sh mainAutoMerge "PATH, HOME, LANG"; do
  need dispatcher/README.md "$term"
done

# docs/MODULES.md
for term in webhook_format pass_env fire_command mainAutoMerge fire-claude.example.sh; do
  need docs/MODULES.md "$term"
done

# docs/learnings.md
for term in pass_env webhook_format mainAutoMerge; do
  need docs/learnings.md "$term"
done

# skill: the rule only, not the reasoning
need plugins/foreman/skills/foreman-fix/SKILL.md mainAutoMerge
forbid plugins/foreman/skills/foreman-fix/SKILL.md outward-facing

# dispatcher env example
need dispatcher/dispatcher.env.example webhook_format

# dispatcher env example: the old global FOREMAN_TZ override must not be an active or commented-out default line
[ -f dispatcher/dispatcher.env.example ] || fail "missing file dispatcher/dispatcher.env.example"
if grep -q -E '^# FOREMAN_TZ=' dispatcher/dispatcher.env.example; then
  fail "dispatcher/dispatcher.env.example must not contain a line starting with '# FOREMAN_TZ='"
fi
echo "ok dispatcher/dispatcher.env.example has no line starting with '# FOREMAN_TZ='"

# foreman-setup references: Claude Code without a routine can run through fire_command
need plugins/foreman/skills/foreman-setup/references/prerequisites.md fire-claude.example.sh
need plugins/foreman/skills/foreman-setup/references/profiles-and-modules.md fire-claude.example.sh

# dispatcher/README.md: local run details
need dispatcher/README.md claude_login
need dispatcher/README.md SSH_AUTH_SOCK

# docs/MODULES.md: FOREMAN_* override upgrade note
need docs/MODULES.md FOREMAN_TZ

# docs/MODULES.md: check script loses GITHUB_TOKEN unless listed in pass_env
need docs/MODULES.md GITHUB_TOKEN

# dispatcher/fire-claude.example.sh: FOREMAN_CLAUDE_FLAGS split rule
need dispatcher/fire-claude.example.sh "quotes inside it are NOT interpreted"

# skills and template: no jargon the rule does not need
forbid plugins/foreman/skills/foreman-fix/SKILL.md "reaches the outside"
forbid template/.claude/skills/foreman-dispatch-run/references/batch-run.md outward-facing
forbid template/.claude/skills/foreman-dispatch-run/references/batch-run.md "reaches the outside"

# batch-run.md: the Units line of an order is the rule for which units a run touches
need template/.claude/skills/foreman-dispatch-run/references/batch-run.md 'The `Units:` line of the order is authoritative'

# M007 S4: foreman update notice (version source, update_notice, releases/latest)
# dispatcher/README.md
for term in foreman_version_source foreman_repo update_notice "foreman update available" releases/latest ITSAPLAN_URL ITSAPLAN_API_KEY "Action Required"; do
  need dispatcher/README.md "$term"
done

# dispatcher/config.example.json
for term in foreman_version_source foreman_repo update_notice; do
  need dispatcher/config.example.json "$term"
done

# docs/MODULES.md
for term in foreman_version_source foreman_repo update_notice "foreman update available"; do
  need docs/MODULES.md "$term"
done

# CHANGELOG.md: only the section that introduced the update notice counts (Unreleased, or 0.2.5 once released; later patch sections do not repeat it). Its parts run from the heading to the next ## or ### heading.
[ -f CHANGELOG.md ] || fail "missing file CHANGELOG.md"
unreleased=$(awk '/^## /{on = ($0 ~ /^## (Unreleased|0\.2\.5|0\.2\.2)( |$)/)} on' CHANGELOG.md)
[ -n "$unreleased" ] || fail "CHANGELOG.md has no section"
# part HEADING: the lines under HEADING inside the Unreleased section
part() { awk -v h="$1" '$0 == h {on = 1; next} /^#{2,3} / {on = 0} on' <<<"$unreleased"; }
upgrade=$(part "### Upgrade")
new=$(part "### New")
for term in foreman_version_source foreman_repo update_notice ITSAPLAN_API_KEY "dispatcher machine"; do
  grep -q -F -- "$term" <<<"$upgrade" || fail "CHANGELOG.md Unreleased ### Upgrade does not contain '$term'"
  echo "ok CHANGELOG.md Unreleased ### Upgrade contains '$term'"
done
grep -q -F -- "foreman update available" <<<"$new" || fail "CHANGELOG.md Unreleased ### New does not contain 'foreman update available'"
echo "ok CHANGELOG.md Unreleased ### New contains 'foreman update available'"

# docs/learnings.md
need docs/learnings.md "foreman update available"

# fix pack 2026-11-23-module-alarm: heartbeat, watcher, alarm, status
for term in heartbeat watch.sh status.sh ALARM_PUSH_URL repeat_hours tracker-sync FOREMAN_STATUS_DIR limits_minutes; do
  need dispatcher/README.md "$term"
done
for term in heartbeat alarm channels limits_minutes repeat_hours; do
  need dispatcher/config.example.json "$term"
done
need dispatcher/dispatcher.env.example ALARM_PUSH_URL
need dispatcher/crontab.example watch.sh
need dispatcher/systemd/foreman-watcher.service watch.sh
need dispatcher/systemd/foreman-watcher.timer OnUnitActiveSec
for term in heartbeat tracker-sync watch.sh; do
  need docs/MODULES.md "$term"
done
need docs/learnings.md heartbeat
grep -q -F -- "heartbeat" <<<"$new" || fail "CHANGELOG.md Unreleased ### New does not contain 'heartbeat'"
for term in watch.sh "dispatcher machine"; do
  grep -q -F -- "$term" <<<"$upgrade" || fail "CHANGELOG.md Unreleased ### Upgrade does not contain '$term'"
done
echo "ok CHANGELOG.md names heartbeat and the watcher upgrade step"

# dispatcher limits: max_tasks_cap, cooldown_minutes and max_tasks are asked for, not defaulted
need dispatcher/README.md max_tasks_cap
need dispatcher/README.md cooldown_minutes
need dispatcher/README.md "Limits"
need plugins/foreman/skills/foreman-project/references/tracker-and-dispatcher.md max_tasks_cap
need plugins/foreman/skills/foreman-project/references/tracker-and-dispatcher.md cooldown_minutes
need plugins/foreman/skills/foreman-project/SKILL.md cooldown_minutes
need plugins/foreman/skills/foreman-setup/references/prerequisites.md cooldown_minutes
need plugins/foreman/skills/foreman-update/SKILL.md max_tasks
need plugins/foreman/skills/foreman-update/SKILL.md cooldown_minutes
need docs/MODULES.md max_tasks_cap
need CHANGELOG.md max_tasks_cap
need docs/learnings.md max_tasks_cap

echo "dispatcher docs tests: ok"

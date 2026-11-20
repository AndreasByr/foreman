#!/usr/bin/env bash
# Installs what the pretest runner needs inside the current worktree (a fresh cloud worktree has no node_modules; the
# runner then fails with ERR_MODULE_NOT_FOUND). Idempotent. `--check` only reports.
#   bash scripts/pretest-prepare.sh [--check]
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
have() { node -e "Promise.all([import('@playwright/test'),import('@axe-core/playwright')]).then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null; }
if have; then echo "pretest dependencies: present"; ok=1; else echo "pretest dependencies: missing"; ok=0; fi
[ "${1:-}" = "--check" ] && exit $((1 - ok))
if [ $ok = 0 ]; then
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile && pnpm add -D @playwright/test @axe-core/playwright
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile && yarn add -D @playwright/test @axe-core/playwright
  else { [ -f package-lock.json ] && npm ci || npm install; } && npm install --no-save @playwright/test @axe-core/playwright
  fi || { echo "install failed" >&2; exit 1; }
  have || { echo "dependencies still missing after install" >&2; exit 1; }
fi
if [ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then echo "browser: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"; else npx playwright install chromium || { echo "browser install failed" >&2; exit 1; }; fi
echo "pretest dependencies: ready"

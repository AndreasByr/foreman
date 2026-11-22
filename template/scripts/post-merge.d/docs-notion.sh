#!/usr/bin/env bash
# Post-merge hook: one-way mirror of the repo docs to Notion, run after each batch merge.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
exec node scripts/docs-notion.mjs "$@"

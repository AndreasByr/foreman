#!/usr/bin/env bash
# Scan the repo for things that must not be published: routine and environment IDs, keys, tokens.
# Extra private words (product names, hosts, people) go into .privacy-patterns, one regex per line.
# That file is git-ignored, so the list itself is never published.
set -uo pipefail
cd "$(dirname "$0")/.."
pat='trig_[0-9A-Za-z]{10,}|env_[0-9A-Za-z]{10,}|cse_[0-9A-Za-z]{10,}|sk-ant-[0-9A-Za-z_-]{10,}|lin_api_[0-9A-Za-z]{10,}|secret_[0-9A-Za-z]{20,}|ntn_[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{20,}|claude\.ai/artifact/[0-9A-Za-z]+'
[ -f .privacy-patterns ] && pat="$pat|$(grep -v '^\s*$' .privacy-patterns | paste -sd'|')"
hits=$(git ls-files -co --exclude-standard | grep -v '^\.privacy-patterns$' | xargs grep -nIiE "$pat" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "$hits"; echo "privacy scan: FOUND"; exit 1; fi
echo "privacy scan: clean"

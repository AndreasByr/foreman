#!/usr/bin/env bash
# Package every chat skill as a zip for upload to claude.ai (Settings → Capabilities → Skills).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
for d in chat-skills/foreman-*/; do
  n=$(basename "$d")
  rm -f "dist/$n.zip"
  (cd chat-skills && zip -qr "../dist/$n.zip" "$n")
  echo "dist/$n.zip"
done

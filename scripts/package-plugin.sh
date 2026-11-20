#!/usr/bin/env bash
# Optional: build dist/foreman-plugin.zip for places that only take an upload.
# Normal install needs no zip: add the marketplace AndreasByr/foreman (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/foreman-plugin.zip
(cd plugins && zip -qr ../dist/foreman-plugin.zip foreman)
echo dist/foreman-plugin.zip

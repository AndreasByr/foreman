#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re
import sys

PATH = "CHANGELOG.md"
REQUIRED_WORDS = ("pass_env", "webhook_format", "mainAutoMerge")
REQUIRED_VERSIONS = ("0.2.1", "0.2.0", "0.1.0")

problems = []

try:
    with open(PATH, encoding="utf-8") as f:
        lines = f.read().splitlines()
except OSError as e:
    print(f"FAIL: cannot read {PATH}: {e}")
    sys.exit(1)

# Parse sections. Lines inside ``` fences are content only: a "### Upgrade"
# or "## " line inside a fence neither opens a section nor an upgrade part.
sections = []
current = None
in_upgrade = False
in_fence = False

for line in lines:
    if line.startswith("```"):
        in_fence = not in_fence
        if in_upgrade:
            current["upgrade"].append(line)
        continue
    if in_fence:
        if in_upgrade:
            current["upgrade"].append(line)
        continue
    if line.startswith("## "):
        current = {"title": line[3:].strip(), "has_upgrade": False, "upgrade": []}
        sections.append(current)
        in_upgrade = False
    elif line.startswith("### "):
        in_upgrade = current is not None and line.rstrip() == "### Upgrade"
        if in_upgrade:
            current["has_upgrade"] = True
    elif in_upgrade:
        current["upgrade"].append(line)

# 1. At least one section.
if not sections:
    problems.append("no '## ' section headings found in CHANGELOG.md")

# 2. Every section has a non-empty upgrade part.
for s in sections:
    if not s["has_upgrade"]:
        problems.append(f"section '{s['title']}': no '### Upgrade' part")
    elif not any(l.strip() for l in s["upgrade"]):
        problems.append(f"section '{s['title']}': '### Upgrade' part is empty")

# 3. The newest section (Unreleased, or the latest version once released) exists and its upgrade part names the required words.
unreleased = sections[:1]
if not unreleased:
    problems.append("section 'Unreleased' is missing")
else:
    text = "\n".join(unreleased[0]["upgrade"])
    for word in REQUIRED_WORDS:
        if word not in text:
            problems.append(f"section 'Unreleased': upgrade part does not mention '{word}'")

# 4. Required version sections exist.
def version_of(title):
    m = re.match(r"^(\d+\.\d+\.\d+)\b", title)
    return m.group(1) if m else None

found_versions = {version_of(s["title"]) for s in sections}
for v in REQUIRED_VERSIONS:
    if v not in found_versions:
        problems.append(f"version section {v} is missing")

# 4b. Every upgrade part (except "- None") names Files, Steps and Optional.
for s in sections:
    nonempty = [l for l in s["upgrade"] if l.strip()]
    if nonempty and nonempty[0].startswith("- None"):
        continue
    text = "\n".join(s["upgrade"])
    for word in ("Files", "Steps", "Optional"):
        if word not in text:
            problems.append(f"section '{s['title']}': upgrade part does not contain '{word}'")

# 4c. Unreleased upgrade part says the dispatcher code must be updated.
if unreleased:
    if not any(re.search(r"dispatcher", l, re.I) and re.search(r"update", l, re.I)
               for l in unreleased[0]["upgrade"]):
        problems.append("section 'Unreleased': upgrade part has no line with 'dispatcher' and 'update'")
    if not any(l.startswith("- Steps:") and re.search(r"dispatcher", l, re.I) and re.search(r"pull", l, re.I)
               for l in unreleased[0]["upgrade"]):
        problems.append("section 'Unreleased': the '- Steps:' bullet must contain 'dispatcher' and 'pull'")

# 5. Report.
if problems:
    for p in problems:
        print(f"FAIL: {p}")
    sys.exit(1)

print(f"changelog upgrade sections: ok ({len(sections)} sections)")
PY

#!/usr/bin/env bash
# foreman-update skill: frontmatter, required commands and checklist, numbered steps, size limit.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import os, re, sys
path = "plugins/foreman/skills/foreman-update/SKILL.md"
problems = []
if not os.path.isfile(path):
    print(f"update skill: {path} missing")
    sys.exit(1)
raw = open(path, "rb").read()
t = raw.decode("utf-8")

# 1. frontmatter
fm = re.match(r"^---\n(.*?)\n---\n", t, re.S)
if not fm:
    problems.append("frontmatter missing")
    fm_text, body = "", t
else:
    fm_text, body = fm.group(1), t[fm.end():]
    if not re.search(r"^name: foreman-update$", fm_text, re.M):
        problems.append("frontmatter: 'name: foreman-update' missing")
    d = re.search(r"^description: (.+)$", fm_text, re.M)
    if not d:
        problems.append("frontmatter: description missing")
    else:
        desc = d.group(1)
        if len(desc) > 1024:
            problems.append(f"description is {len(desc)} chars (max 1024)")
        if "update" not in desc.lower():
            problems.append("description does not mention 'update'")
        if ": " in desc and not desc.startswith('"'):
            problems.append("description contains ': ' and must be wrapped in double quotes")

# 2. required plain substrings in the body
for s in (".foreman.json", "CHANGELOG.md", "### Upgrade", "install.sh",
          "--update --dry-run", "update-classes.json", "foreman-project-mode",
          "check-config.sh"):
    if s not in body:
        problems.append(f"body lacks '{s}'")

# 3. numbered list with at least 4 items, and at least 4 'N min' time estimates
numbered = re.findall(r"^\d+\. ", body, re.M)
if len(numbered) < 4:
    problems.append(f"numbered list has {len(numbered)} items (need at least 4)")
mins = re.findall(r"\d+ min", body)
if len(mins) < 4:
    problems.append(f"found {len(mins)} 'N min' estimates (need at least 4)")

# 4. new modules only after a yes
lines = body.splitlines()
if not any("module" in l.lower() and "yes" in l.lower() for l in lines):
    problems.append("no line states that new modules are added only after a yes")

# 5. checklist line and 'outdated'
if not any("Project instructions up to date" in l for l in lines):
    problems.append("checklist line 'Project instructions up to date' missing")
if "outdated" not in body:
    problems.append("text 'outdated' missing")

# 6. no running against live projects first
if not any("test project" in l.lower() for l in lines):
    problems.append("no line mentions 'test project'")
if not any("never" in l.lower() for l in lines):
    problems.append("no line contains 'never'")

# 7. size limit
if len(raw) > 9000:
    problems.append(f"SKILL.md is {len(raw)} bytes (max 9000)")

if problems:
    for p in problems:
        print(f"update skill: {p}")
    sys.exit(1)
print("update skill: ok")
PY

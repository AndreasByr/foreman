#!/usr/bin/env bash
# update-classes.json puts every file in template/ into exactly one class (foreman, project, mixed):
# each file matches exactly one entry, no entry is stale, and the project-owned files sit in their class.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, os, sys

CLASSES = {"foreman", "project", "mixed"}
EXPECTED = {
    "project": ["docs/learnings.md", "docs/release-path.md", "docs/test-login.md"],
    "mixed": ["CLAUDE.md", "AGENTS.md", ".claude/settings.json", "tools/delegate/config.toml"],
    "foreman": ["scripts/lib/state.mjs", ".claude/skills/foreman-delegation/SKILL.md"],
}
problems = []


def fail_and_exit():
    n = len(problems)
    print(f"update classes: FAILED ({n} problem{'s' if n != 1 else ''})")
    for p in problems:
        print(f"- {p}")
    sys.exit(1)


# 1. manifest
try:
    with open("update-classes.json", encoding="utf-8") as fh:
        data = json.load(fh)
except FileNotFoundError:
    problems.append("update-classes.json is missing (expected at the repo root)")
    fail_and_exit()
except json.JSONDecodeError as e:
    problems.append(f"update-classes.json is not valid JSON: {e}")
    fail_and_exit()

if not isinstance(data, dict):
    problems.append("update-classes.json: top level must be an object")
    fail_and_exit()
version = data.get("version")
if type(version) is not int or version != 1:
    problems.append(f"update-classes.json: version must be 1 (found {version!r})")
classes = data.get("classes")
if not isinstance(classes, dict):
    problems.append('update-classes.json: "classes" must be an object')
    fail_and_exit()
if set(classes) != CLASSES:
    problems.append(
        "update-classes.json: class names must be exactly foreman, project, mixed "
        f"(found: {', '.join(sorted(classes)) or 'none'})"
    )

# 2. entries
occurrences = []  # (class, entry)
for cls in sorted(classes):
    entries = classes[cls]
    if not isinstance(entries, list):
        problems.append(f'class "{cls}" must be a list')
        continue
    for e in entries:
        if not isinstance(e, str) or not e:
            problems.append(f'class "{cls}": entry {e!r} must be a non-empty string')
            continue
        if e.startswith("/") or ".." in e:
            problems.append(f'class "{cls}": entry "{e}" must be a relative path (no leading "/" and no "..")')
            continue
        occurrences.append((cls, e))

listed = {}
for cls, e in occurrences:
    listed.setdefault(e, []).append(cls)
for e, where in listed.items():
    if len(where) > 1:
        problems.append(f'entry "{e}" is listed {len(where)} times (in: {", ".join(where)})')

# 3. files under template/
if not os.path.isdir("template"):
    problems.append("template/ directory is missing")
    fail_and_exit()
files = []
for root, dirs, names in os.walk("template"):
    dirs[:] = [d for d in dirs if d != "__pycache__"]
    for n in names:
        if n.endswith(".pyc"):
            continue
        files.append(os.path.relpath(os.path.join(root, n), "template").replace(os.sep, "/"))
files.sort()


def matches(entry, path):
    return path.startswith(entry) if entry.endswith("/") else path == entry


# 4. every file matches exactly one entry
file_class = {}
for f in files:
    hits = [(cls, e) for cls, e in occurrences if matches(e, f)]
    if not hits:
        problems.append(f'no class: "{f}" matches no entry')
    elif len(hits) > 1:
        problems.append(
            f'ambiguous: "{f}" matches {len(hits)} entries: '
            + ", ".join(f'"{e}" ({cls})' for cls, e in hits)
        )
    else:
        file_class[f] = hits[0][0]

# 5. every entry matches at least one file
for cls, e in occurrences:
    if not any(matches(e, f) for f in files):
        problems.append(f'stale entry: "{e}" ({cls}) matches no file in template/')

# 6. project-owned files are in their expected class
for cls, paths in EXPECTED.items():
    for p in paths:
        if p not in files:
            problems.append(f'expected file "{p}" is not in template/')
        elif p in file_class and file_class[p] != cls:
            problems.append(f'wrong class: "{p}" is in "{file_class[p]}", expected "{cls}"')

if problems:
    fail_and_exit()
print(f"update classes: ok ({len(files)} files)")
PY

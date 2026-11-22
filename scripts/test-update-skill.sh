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

# A. section 6: numbered lines each carry a time estimate
sec6 = re.search(r"^## 6.*?\n(.*?)(?=^## |\Z)", t, re.S | re.M)
if not sec6:
    problems.append("section '## 6' missing")
else:
    nl = [l for l in sec6.group(1).splitlines() if re.match(r"^\d+\. ", l)]
    if len(nl) < 4:
        problems.append(f"section 6 has {len(nl)} numbered lines (need at least 4)")
    for l in nl:
        if " min" not in l:
            problems.append(f"section 6: numbered line without ' min': {l}")

# B. the order block changes into the project before check-config.sh
cd_idx = next((i for i, l in enumerate(lines) if "cd <project path>" in l), None)
cc_idx = next((i for i, l in enumerate(lines) if "check-config.sh" in l), None)
if cd_idx is None:
    problems.append("no line mentions 'cd <project path>'")
elif cc_idx is None or cd_idx >= cc_idx:
    problems.append("'cd <project path>' is not before the first line with 'check-config.sh'")

# C. refresh mode and block-status.py
if "call `foreman-project-mode`" not in t:
    problems.append("text lacks 'call `foreman-project-mode`'")
if "block-status.py" not in t:
    problems.append("text lacks 'block-status.py'")

# D. run-through at a test project
import subprocess, tempfile
root = os.getcwd()
marker = "(mixed: merge by hand)"
if marker not in t:
    problems.append(f"SKILL.md lacks '{marker}'")
if "--update --dry-run" not in t:
    problems.append("SKILL.md lacks '--update --dry-run'")
with tempfile.TemporaryDirectory() as T:
    p = os.path.join(T, "p")
    def run(*a, **k):
        return subprocess.run(a, capture_output=True, text=True, **k)
    os.makedirs(p)
    run("git", "init", "-q", T)
    r = run(os.path.join(root, "install.sh"), p, "--project", "skilltest", "--session-model", "test-model-id")
    if r.returncode != 0:
        problems.append(f"run-through: install failed: {r.stderr}")
    else:
        with open(os.path.join(p, "CLAUDE.md"), "a") as f:
            f.write("my own line\n")
        fj = os.path.join(p, ".foreman.json")
        s = open(fj).read()
        open(fj, "w").write(re.sub(r'"foreman": *"[^"]*"', '"foreman": "0.1.9"', s))
        run("git", "-C", T, "config", "user.email", "t@e.com")
        run("git", "-C", T, "config", "user.name", "t")
        run("git", "-C", T, "add", "-A")
        run("git", "-C", T, "commit", "-qm", "c")
        r = run(os.path.join(root, "install.sh"), p, "--update", "--dry-run")
        if marker not in r.stdout:
            problems.append(f"dry run output lacks '{marker}': {r.stdout} {r.stderr}")

# E. equal versions with an Unreleased section still get a dry run
if "Unreleased" not in t:
    problems.append("SKILL.md does not mention 'Unreleased'")

# F. no manual changelog: chat fetches CHANGELOG.md and VERSION itself
RAW = "https://raw.githubusercontent.com/AndreasByr/foreman/"
if RAW not in body:
    problems.append(f"body lacks '{RAW}'")
else:
    if not any("CHANGELOG.md" in l and RAW in l for l in lines):
        problems.append("no line with 'CHANGELOG.md' and the raw GitHub URL")
    if not any("VERSION" in l and RAW in l for l in lines):
        problems.append("no line with 'VERSION' and the raw GitHub URL")
if "no `v` prefix" not in body:
    problems.append("body lacks 'no `v` prefix'")
if "Never ask the human for the changelog" not in body:
    problems.append("body lacks 'Never ask the human for the changelog'")
if not any("main" in l.lower() and "fallback" in l.lower() for l in lines):
    problems.append("no line with 'main' and 'fallback'")

if problems:
    for p in problems:
        print(f"update skill: {p}")
    sys.exit(1)
print("update skill: ok")
PY

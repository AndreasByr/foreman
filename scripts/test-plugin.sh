#!/usr/bin/env bash
# Plugin and marketplace manifests are valid, names match, every skill has frontmatter.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, os, re, sys
m = json.load(open(".claude-plugin/marketplace.json"))
for k in ("name", "owner", "plugins"):
    assert k in m, f"marketplace.json: {k} missing"
for e in m["plugins"]:
    src = e["source"]; assert ".." not in src, src
    p = json.load(open(os.path.join(src, ".claude-plugin/plugin.json")))
    assert p["name"] == e["name"], f"entry {e['name']} != manifest {p['name']}"
    v = open("VERSION").read().strip()
    assert p.get("version") == v, f"plugin version {p.get('version')} != VERSION {v}"
    sk = os.path.join(src, "skills")
    names = sorted(os.listdir(sk))
    assert names, "no skills"
    for n in names:
        t = open(os.path.join(sk, n, "SKILL.md")).read()
        fm = re.match(r"^---\n(.*?)\n---\n", t, re.S); assert fm, f"{n}: no frontmatter"
        assert re.search(rf"^name: {re.escape(n)}$", fm.group(1), re.M), f"{n}: name mismatch"
        d = re.search(r"^description: (.+)$", fm.group(1), re.M); assert d and len(d.group(1)) <= 1024, f"{n}: description"
print(f"plugin tests: ok ({len(names)} skills)")
PY
if command -v claude >/dev/null 2>&1; then claude plugin validate . >/dev/null && claude plugin validate ./plugins/foreman >/dev/null && echo "claude plugin validate: ok"; fi

#!/usr/bin/env python3
"""Fail when a tracked text file contains a denylisted word (real project, host or person names).
The denylist stores sha256 hashes of lowercase words, so the list itself publishes nothing.
Usage: privacy-scan.py            scan tracked and untracked, non-ignored files
       privacy-scan.py --hash W   print the hash line to add for word W"""
import hashlib, re, subprocess, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) == 3 and sys.argv[1] == "--hash":
    print(hashlib.sha256(sys.argv[2].lower().encode()).hexdigest()); sys.exit(0)
deny = {l.strip() for l in (root / "scripts/privacy-denylist.sha256").read_text().splitlines() if l.strip() and not l.startswith("#")}
files = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
bad = 0
for f in files:
    p = root / f
    if not f or f == "scripts/privacy-denylist.sha256" or not p.is_file():
        continue
    try:
        text = p.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for n, line in enumerate(text.split("\n"), 1):
        for w in re.findall(r"[A-Za-z0-9]+", line):
            if hashlib.sha256(w.lower().encode()).hexdigest() in deny:
                print(f"{f}:{n}: denylisted word"); bad += 1
if bad:
    print("privacy denylist: FOUND"); sys.exit(1)
print("privacy denylist: clean")

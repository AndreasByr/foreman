#!/usr/bin/env python3
"""Compare the foreman project-instruction block with the reference block.

Usage: block-status.py [FILE]
  FILE is the project instruction text; "-" or no argument reads stdin.

Output (one line on stdout):
  missing                             exit 3
  current vN                          exit 0
  outdated vK (current is vN)         exit 1
  newer vK (this skill knows vN)      exit 0
  error: <reason>                     exit 2
"""
import os
import re
import sys

OPEN_RE = re.compile(r"<!--\s*foreman-project-block(?:\s+v(\d+))?\s*-->")
CLOSE_RE = re.compile(r"<!--\s*/foreman-project-block\s*-->")

HERE = os.path.dirname(os.path.abspath(__file__))
REF_PATH = os.path.normpath(os.path.join(HERE, "..", "references", "instruction-block.md"))


def error(reason):
    print(f"error: {reason}")
    return 2


def read_text(path):
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8")


def main(argv):
    if len(argv) > 2:
        return error("too many arguments")
    source = argv[1] if len(argv) == 2 else "-"

    try:
        ref_text = read_text(REF_PATH)
    except (OSError, UnicodeDecodeError) as exc:
        return error(f"cannot read reference {REF_PATH}: {exc}")
    ref_match = OPEN_RE.search(ref_text)
    if not ref_match or ref_match.group(1) is None:
        return error(f"no version in reference {REF_PATH}")
    current = int(ref_match.group(1))

    try:
        if source == "-":
            text = sys.stdin.buffer.read().decode("utf-8")
        else:
            text = read_text(source)
    except (OSError, UnicodeDecodeError) as exc:
        return error(f"cannot read input {source}: {exc}")

    opens = list(OPEN_RE.finditer(text))
    if not opens:
        print("missing")
        return 3
    if len(opens) > 1:
        return error(f"{len(opens)} opening markers, expected one")
    open_match = opens[0]
    if not any(c.start() > open_match.end() for c in CLOSE_RE.finditer(text)):
        return error("opening marker without closing marker")

    found = int(open_match.group(1)) if open_match.group(1) is not None else 0
    if found == current:
        print(f"current v{current}")
        return 0
    if found < current:
        print(f"outdated v{found} (current is v{current})")
        return 1
    print(f"newer v{found} (this skill knows v{current})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

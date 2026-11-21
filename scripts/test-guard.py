#!/usr/bin/env python3
"""Tests for .claude/hooks/guard-git.py. Run: python3 scripts/test-guard.py"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, ".claude", "hooks", "guard-git.py")

BLOCK = [
    "git push origin main",
    "git push origin prod",
    "git push origin HEAD:main",
    "git push origin agent/x:refs/heads/prod",
    "git -C /tmp/repo push origin main",
    "git -c push.default=current push origin prod",
    "GIT_TRACE=1 git push origin main",
    "git push --force origin dev",
    "git push -f origin batch/dev",
    "git push --force-with-lease origin agent/x",
    "git push --force-with-lease=agent/x origin agent/x",
    "git push -uf origin agent/x",
    "git push origin +agent/x",
    "git push origin --delete dev",
    "git push origin -d main",
    "git push origin :prod",
    "git status && git push origin main",
    "echo ok; git push origin main",
]

ALLOW = [
    "git push origin dev",
    "git push origin batch/dev",
    "git push -u origin agent/fix-login",
    "git push origin agent/x:batch/m004",
    "git push origin --delete agent/old",
    "git -C /tmp/repo -c push.negotiate=true push -u origin batch/main",
    "date +%Y && git push origin dev",
    "git commit -m 'merge into main later' && git push origin dev",
    "echo 'git push origin main'",
    "git log main..dev",
    "ls -la",
]


def run(command):
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    env = dict(os.environ, GIT_DIR="/nonexistent")  # no repo: current branch is unknown
    return subprocess.run([sys.executable, GUARD], input=payload, text=True,
                          capture_output=True, env=env).returncode


def main():
    failed = 0
    for c in BLOCK:
        if run(c) != 2:
            print(f"FAIL (should block): {c}")
            failed += 1
    for c in ALLOW:
        if run(c) != 0:
            print(f"FAIL (should allow): {c}")
            failed += 1
    total = len(BLOCK) + len(ALLOW)
    print(f"{total - failed}/{total} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

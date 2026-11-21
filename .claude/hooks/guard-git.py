#!/usr/bin/env python3
"""PreToolUse guard for Bash: blocks pushes to protected branches, force pushes and remote deletions.

Reads the hook payload (JSON) from stdin. Exit 0 = allow, exit 2 = block (reason on stderr).
Protected branches: FOREMAN_PROTECTED (default "main,prod"); branches that must never be deleted
remotely: FOREMAN_NO_DELETE (default "main,dev,prod").
"""
import json
import os
import re
import shlex
import subprocess
import sys

PROTECTED = {b.strip() for b in os.environ.get("FOREMAN_PROTECTED", "main,prod").split(",") if b.strip()}
NO_DELETE = {b.strip() for b in os.environ.get("FOREMAN_NO_DELETE", "main,dev,prod").split(",") if b.strip()}

# Options of `git` itself that take a value as the next argument.
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
# Options of `git push` that take a value as the next argument.
PUSH_OPTS_WITH_VALUE = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
FORCE_FLAGS = {"-f", "--force", "--force-with-lease", "--force-if-includes"}
DELETE_FLAGS = {"-d", "--delete"}


def split_commands(command: str):
    """Split a shell line into simple commands at ;, &&, ||, | and newlines (outside quotes)."""
    parts, buf, quote, i = [], [], None, 0
    while i < len(command):
        ch = command[i]
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            elif ch == "\\" and quote == '"' and i + 1 < len(command):
                buf.append(command[i + 1])
                i += 1
        elif ch in ("'", '"'):
            quote = ch
            buf.append(ch)
        elif ch in ";\n" or command.startswith("&&", i) or command.startswith("||", i) or ch == "|":
            parts.append("".join(buf))
            buf = []
            if command.startswith("&&", i) or command.startswith("||", i):
                i += 1
        else:
            buf.append(ch)
        i += 1
    parts.append("".join(buf))
    return [p.strip() for p in parts if p.strip()]


def tokens(cmd: str):
    try:
        return shlex.split(cmd)
    except ValueError:
        return cmd.split()


def strip_prefix(tok):
    """Drop env assignments and wrappers like `env`, `command`, `sudo` before the program."""
    i = 0
    while i < len(tok):
        t = tok[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t) or t in ("env", "command", "sudo", "nohup", "time"):
            i += 1
            continue
        break
    return tok[i:]


def branch_name(ref: str) -> str:
    ref = ref.strip()
    for prefix in ("refs/heads/", "heads/"):
        if ref.startswith(prefix):
            return ref[len(prefix):]
    return ref


def current_branch(git_dir_args):
    try:
        out = subprocess.run(["git", *git_dir_args, "symbolic-ref", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip()
    except Exception:
        return ""


def check_push(git_args, push_args):
    """Return a block reason or None."""
    positional, force, delete = [], False, False
    i = 0
    while i < len(push_args):
        a = push_args[i]
        if a in PUSH_OPTS_WITH_VALUE:
            i += 2
            continue
        if a.startswith("--") and "=" in a:
            name = a.split("=", 1)[0]
            if name in FORCE_FLAGS:
                force = True
            i += 1
            continue
        if a in FORCE_FLAGS:
            force = True
        elif a in DELETE_FLAGS:
            delete = True
        elif a.startswith("-") and not a.startswith("--") and len(a) > 1:
            # combined short flags, e.g. -uf
            if "f" in a[1:]:
                force = True
            if "d" in a[1:]:
                delete = True
        elif not a.startswith("-"):
            positional.append(a)
        i += 1

    if force:
        return "force push is not allowed"
    refspecs = positional[1:]  # first positional is the remote
    if any(r.startswith("+") for r in refspecs):
        return "force push (+refspec) is not allowed"

    if not refspecs:
        if delete:
            return None
        cur = current_branch(git_args)
        if cur in PROTECTED:
            return f"push from protected branch '{cur}' without refspec is not allowed"
        return None

    for r in refspecs:
        if delete:
            target = branch_name(r)
            if target in NO_DELETE:
                return f"deleting remote branch '{target}' is not allowed"
            continue
        if r.startswith(":"):
            target = branch_name(r[1:])
            if target in NO_DELETE:
                return f"deleting remote branch '{target}' is not allowed"
            continue
        dest = r.split(":", 1)[1] if ":" in r else r
        dest = branch_name(dest)
        if dest == "HEAD":
            dest = current_branch(git_args)
        if dest in PROTECTED:
            return f"direct push to protected branch '{dest}' is not allowed; use a batch PR"
    return None


def check_command(cmd: str):
    tok = strip_prefix(tokens(cmd))
    if not tok or os.path.basename(tok[0]) != "git":
        return None
    i, git_args = 1, []
    while i < len(tok):
        t = tok[i]
        if t in GIT_OPTS_WITH_VALUE:
            git_args += tok[i:i + 2]
            i += 2
            continue
        if t.startswith("-"):
            git_args.append(t)
            i += 1
            continue
        break
    if i >= len(tok) or tok[i] != "push":
        return None
    return check_push(git_args, tok[i + 1:])


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    command = (payload.get("tool_input") or {}).get("command") or ""
    for part in split_commands(command):
        reason = check_command(part)
        if reason:
            print(f"foreman guard: {reason}. Command: {part}", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

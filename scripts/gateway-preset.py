#!/usr/bin/env python3
"""Activates the "gateway" preset in a target's tools/delegate/config.toml.

Usage: python3 scripts/gateway-preset.py <config.toml> --url URL --key-env NAME --fallback-model ID [--chatgpt]

- sets [meta] active = "gateway" and comments out the active claude-only role tables
  (research, execution_simple, completion, subagent; execution only with --chatgpt)
- removes an earlier foreman gateway region (between the marker comments) and writes one new region
  before the line "# ===== Roles the session plays itself ====="
- never writes the key value: only the variable NAME goes into the file
- checks reachability with GET <url>/health/liveliness (5 s); any HTTP answer counts as reachable.
  Reachable: a dry run of the wrapper with a temporary copy of the config (placeholders replaced by the
  fallback model). A failed dry run is reported and marks the check as "no"; the script still exits 0.

Exit 0 when the config was written, 2 for invalid arguments, 1 when the config cannot be used.
Python stdlib only.
"""
import argparse
import http.client
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

BEGIN = "# >>> foreman gateway preset"
END = "# <<< foreman gateway preset"
ROLES_MARK = "# ===== Roles the session plays itself ====="
CLAUDE_ONLY = ["research", "execution_simple", "completion", "subagent"]
TIMEOUT = 5
URL_RE = re.compile(r"^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^\s\"]*)?$")
KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
MODEL_RE = re.compile(r"^claude/[A-Za-z0-9._:-]+$")
PLACEHOLDER_RE = re.compile(r"<[^<>\n]*-model-id>")
TABLE_RE = re.compile(r"^\[")


def fail(msg, code=2):
    print(f"gateway: {msg}", file=sys.stderr)
    sys.exit(code)


def remove_region(lines):
    out, inside = [], False
    for line in lines:
        s = line.strip()
        if s == BEGIN:
            inside = True
            continue
        if inside:
            if s == END:
                inside = False
            continue
        out.append(line)
    if inside:
        fail("found an unclosed foreman gateway region; fix or remove it by hand", 1)
    return out


def set_active(lines):
    try:
        start = lines.index("[meta]")
    except ValueError:
        fail("config has no [meta] table", 1)
    for i in range(start + 1, len(lines)):
        if TABLE_RE.match(lines[i]):
            break
        if re.match(r"^\s*active\s*=", lines[i]):
            lines[i] = 'active = "gateway"'
            return lines
    lines.insert(start + 1, 'active = "gateway"')
    return lines


def table_span(lines, header):
    """Index range of an active table (header line up to the next blank line or table), or None."""
    for i, line in enumerate(lines):
        if line.strip() == header:
            j = i + 1
            while j < len(lines) and lines[j].strip() and not TABLE_RE.match(lines[j]) and not lines[j].startswith("#"):
                j += 1
            return i, j
    return None


def comment_out(lines, role):
    span = table_span(lines, f"[roles.{role}]")
    if span is None:
        return lines
    i, j = span
    for k in range(i, j):
        lines[k] = "# " + lines[k]
    return lines


def restore_execution(lines):
    """Undo our own commenting of the claude-only execution table (exact original text only)."""
    original = ['# [roles.execution]', '# who = "worker"', '# model = "claude/<mid-model-id>"']
    for i in range(len(lines) - len(original) + 1):
        if lines[i:i + len(original)] == original:
            lines[i:i + len(original)] = original[0][2:], original[1][2:], original[2][2:]
            return lines
    return lines


def region(url, key_env, fallback, chatgpt, reachable):
    block = [
        BEGIN,
        f"# foreman: gateway preset, reachability checked: {'yes' if reachable else 'no'}",
        "[gateway]",
        f'base_url = "{url}"',
        f'api_key_env = "{key_env}"',
        f'fallback_model = "{fallback}"',
        "",
    ]
    roles = [("research", "gateway/task-research", True), ("execution_simple", "gateway/task-simple", False),
             ("completion", "gateway/task-simple", False), ("subagent", "gateway/task-simple", False)]
    if chatgpt:
        roles.append(("execution", "gateway/task-normal", False))
    for name, model, readonly in roles:
        block += [f"[roles.{name}]", 'who = "worker"', 'provider = "gateway"', f'model = "{model}"']
        if readonly:
            block.append("readonly = true")
        block.append("")
    block.append(END)
    block.append("")
    return block


def reachable(url):
    req = urllib.request.Request(url.rstrip("/") + "/health/liveliness", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT):
            return True
    except urllib.error.HTTPError:
        return True  # any HTTP answer, even 401 or 404, means the server is there
    except (urllib.error.URLError, OSError, ValueError, http.client.HTTPException):
        return False


def dry_run(config, fallback):
    """Run the wrapper's --dry-run on a temporary copy of the config. Returns (ok, last_lines)."""
    wrapper = config.parent / "run_task.py"
    if not wrapper.is_file():
        return False, [f"wrapper not found: {wrapper}"]
    tmp = Path(tempfile.mkdtemp(prefix="gateway-preset-"))
    try:
        cfg_tmp = tmp / "config.toml"
        cfg_tmp.write_text(PLACEHOLDER_RE.sub(fallback, config.read_text(encoding="utf-8")), encoding="utf-8")
        task = tmp / "task.md"
        task.write_text("---\nrole: execution_simple\n---\nGateway dry-run check: do nothing.\n", encoding="utf-8")
        try:
            res = subprocess.run([sys.executable, str(wrapper), "--dry-run", "--config", str(cfg_tmp), str(task)],
                                 capture_output=True, text=True, timeout=60)
            output = (res.stdout + res.stderr).splitlines()
            return res.returncode == 0, output[-8:]
        except subprocess.TimeoutExpired:
            return False, ["dry run timed out after 60 s"]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("--url", required=True)
    ap.add_argument("--key-env", required=True)
    ap.add_argument("--fallback-model", required=True)
    ap.add_argument("--chatgpt", action="store_true")
    a = ap.parse_args(argv)

    if not URL_RE.match(a.url) or (a.url.startswith("http://") and
            a.url[len("http://"):].split("/")[0].split(":")[0] not in ("localhost", "127.0.0.1")):
        fail("URL must be https://host[:port][/path] (http only for localhost or 127.0.0.1); nothing written")
    if not KEY_RE.match(a.key_env):
        fail("key variable name must be a plain name (letters, digits, underscore); nothing written")
    if "<" in a.fallback_model or ">" in a.fallback_model or not MODEL_RE.match(a.fallback_model):
        fail("fallback model must be an exact ID like claude/<id>; nothing written")

    config = Path(a.config)
    if not config.is_file():
        fail(f"config not found: {config}", 1)
    lines = config.read_text(encoding="utf-8").splitlines()
    if ROLES_MARK not in lines:
        fail(f"config has no line '{ROLES_MARK}'", 1)

    lines = remove_region(lines)
    lines = set_active(lines)
    for role in CLAUDE_ONLY:
        lines = comment_out(lines, role)
    if a.chatgpt:
        lines = comment_out(lines, "execution")
    else:
        lines = restore_execution(lines)

    ok = reachable(a.url)
    block = region(a.url, a.key_env, a.fallback_model, a.chatgpt, ok)
    at = lines.index(ROLES_MARK)
    lines[at:at] = block
    config.write_text("\n".join(lines) + "\n", encoding="utf-8")

    if not ok:
        print(f"gateway unreachable at {a.url}: preset written but NOT checked")
        return 0

    passed, tail = dry_run(config, a.fallback_model)
    if passed:
        print("gateway dry-run: ok (other roles still need exact model IDs)")
        return 0
    print("gateway dry-run: FAILED")
    for line in tail:
        print(f"  {line}")
    text = config.read_text(encoding="utf-8")
    text = text.replace("reachability checked: yes", "reachability checked: no", 1)
    config.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

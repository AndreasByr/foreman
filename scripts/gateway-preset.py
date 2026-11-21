#!/usr/bin/env python3
"""Activates the "gateway" preset in a target's tools/delegate/config.toml.

Usage: python3 scripts/gateway-preset.py <config.toml> --url URL --key-env NAME --fallback-model ID [--chatgpt]

- sets [meta] active = "gateway" and comments out the active claude-only role tables
  (research, execution_simple, completion, subagent; execution only with --chatgpt)
- removes an earlier foreman gateway region (between the marker comments) and writes one new region
  before the line "# ===== Roles the session plays itself ====="
- never writes the key value: only the variable NAME goes into the file
- checks reachability with GET <url>/health/liveliness (5 s, no proxy, no redirects): HTTP 200 is reachable,
  401 or 403 is reachable but needs auth (marker "yes"), any other answer or a connection error marks the check "no".
  Reachable: a dry run of the wrapper with a temporary copy of the config (other model placeholders replaced by
  the fallback model). A failed dry run is reported and marks the check as "no"; the script still exits 0.
- URL rule (same as install.sh): https, or http only for localhost/127.0.0.1; host labels [A-Za-z0-9-]; optional
  port 1-65535; path of [A-Za-z0-9._~/%-] only; no secret-like path segment (32+ characters of [A-Za-z0-9+/_=-]).
- the result must parse as TOML (checked before writing); a config that did not parse before is not checked.

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

try:
    import tomllib
except ImportError:  # Python < 3.11: the TOML check is skipped
    tomllib = None

BEGIN = "# >>> foreman gateway preset"
END = "# <<< foreman gateway preset"
ROLES_MARK = "# ===== Roles the session plays itself ====="
CLAUDE_ONLY = ["research", "execution_simple", "completion", "subagent"]
TIMEOUT = 5
LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
URL_RE = re.compile(rf"(https?)://({LABEL}(?:\.{LABEL})*)(?::([0-9]{{1,5}}))?(/[A-Za-z0-9._~/%-]*)?")
SECRET_SEG_RE = re.compile(r"[A-Za-z0-9+_=-]{32,}")
KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
MODEL_RE = re.compile(r"^claude/[A-Za-z0-9._:-]+$")
PLACEHOLDER_RE = re.compile(r"<[^<>\n]*-model-id>")
TABLE_RE = re.compile(r"^\[")


def check_url(url):
    """Returns None when the URL passes the strict rule, else a short reason (never contains the URL path)."""
    m = URL_RE.fullmatch(url)
    if not m:
        return "URL must be https://host[:port][/path] with plain host and path characters (no quotes, backslash, ?, # or spaces)"
    scheme, host, port, path = m.group(1), m.group(2), m.group(3), m.group(4) or ""
    local = host in ("localhost", "127.0.0.1")
    if scheme == "http" and not local:
        return "plain http is allowed only for localhost or 127.0.0.1; use https"
    if "." not in host and host != "localhost":
        return "URL host must be a full host name with at least one dot"
    if port is not None and not 1 <= int(port) <= 65535:
        return "URL port must be 1-65535"
    if any(SECRET_SEG_RE.fullmatch(seg) for seg in path.split("/")):
        return "URL has a secret-like path segment; put no key or token into the URL"
    return None


def toml_str(value):
    return value.replace("\\", "\\\\").replace('"', '\\"')


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


def table_span(lines, role):
    """Index range of an active table (header line, a trailing comment is fine, up to the next line starting with "["), or None."""
    header = re.compile(r"^\[roles\." + re.escape(role) + r"\]\s*(#.*)?$")
    for i, line in enumerate(lines):
        if header.match(line):
            j = i + 1
            while j < len(lines) and not TABLE_RE.match(lines[j]):
                j += 1
            return i, j
    return None


def comment_out(lines, role):
    span = table_span(lines, role)
    if span is None:
        return lines
    i, j = span
    for k in range(i, j):
        if lines[k].strip() and not lines[k].lstrip().startswith("#"):  # blank and comment lines stay as they are
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
        f'base_url = "{toml_str(url)}"',
        f'api_key_env = "{toml_str(key_env)}"',
        f'fallback_model = "{toml_str(fallback)}"',
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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def probe(url):
    """GET <url>/health/liveliness without proxy and without redirects. Returns (kind, code):
    kind is "ok" (200), "auth" (401, 403), "other" (any other HTTP answer) or "down" (no answer)."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect)
    req = urllib.request.Request(url.rstrip("/") + "/health/liveliness", method="GET")
    try:
        with opener.open(req, timeout=TIMEOUT) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    except (urllib.error.URLError, OSError, ValueError, http.client.HTTPException):
        return "down", 0
    if code == 200:
        return "ok", code
    if code in (401, 403):
        return "auth", code
    return "other", code


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

    reason = check_url(a.url)
    if reason:
        fail(f"{reason}; nothing written")
    if not KEY_RE.match(a.key_env):
        fail("key variable name must be a plain name (letters, digits, underscore); nothing written")
    if not MODEL_RE.match(a.fallback_model):
        fail("fallback model must be an exact ID like claude/ID (no placeholder); nothing written")

    config = Path(a.config)
    if not config.is_file():
        fail(f"config not found: {config}", 1)
    original = config.read_text(encoding="utf-8")
    lines = original.splitlines()
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

    kind, code = probe(a.url)
    ok = kind in ("ok", "auth")
    block = region(a.url, a.key_env, a.fallback_model, a.chatgpt, ok)
    at = lines.index(ROLES_MARK)
    lines[at:at] = block
    text = "\n".join(lines) + "\n"
    if tomllib is not None:
        try:
            tomllib.loads(original)
            was_valid = True
        except tomllib.TOMLDecodeError:
            was_valid = False
        if was_valid:
            try:
                tomllib.loads(text)
            except tomllib.TOMLDecodeError as e:
                fail(f"the result would not parse as TOML ({e}); config left untouched", 1)
    config.write_text(text, encoding="utf-8")

    if kind == "down":
        print(f"gateway unreachable at {a.url}: preset written but NOT checked")
        return 0
    if kind == "other":
        print(f"gateway at {a.url} answers but does not look like a gateway (HTTP {code}): preset written but NOT checked")
        return 0
    if kind == "auth":
        print("gateway answers (auth required)")

    passed, tail = dry_run(config, a.fallback_model)
    if passed:
        print("gateway dry-run: ok on a copy with the other model placeholders replaced; other roles still need exact model IDs")
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

#!/usr/bin/env python3
"""Run one task file with a worker model (a second, isolated `claude -p` instance).

Usage:  run_task.py <task.md> [--role ROLE] [--config FILE] [--workdir DIR] [--out FILE]
                    [--no-escalate] [--dry-run]

The role is required: `--role` or `role:` in the task front matter. A task without a role is rejected.
Front matter (all keys optional except role):
    role: execution_simple
    verify: <command>        # mechanical acceptance, exit 0 = done
    files: [src/**, tests/**]   # scope: changed files outside these globs are reported as findings

Exit codes: 0 done, 1 all steps failed (the session takes over), 2 call/config error,
            3 prerequisite missing (claude CLI, API key without fallback),
            4 the verify command itself is not runnable (no worker started).
"""
import argparse, fnmatch, hashlib, json, os, re, shlex, shutil, subprocess, sys, tempfile, time, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
PASS_ENV = ["PATH", "LANG", "LC_ALL", "TERM", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
            "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE",
            "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"]
# Never allowed to come from a verify assignment or [env]: endpoint, login, config, loaders.
UNSAFE_ENV = re.compile(r"^(?:ANTHROPIC_|CLAUDE_|OLLAMA_|LD_|DYLD_)|^(?:HOME|PATH|NODE_OPTIONS|SHELL|BASH_ENV|ENV)$")
# Always forbidden for workers, whatever the config says.
MANDATORY_DISALLOWED = ["Bash(git *)", "Bash(rm *)", "Bash(curl *)", "Bash(wget *)"]
READONLY_TOOLS = ["Read", "Glob", "Grep"]
VALID_WHO = ("worker", "session")
VALID_PROVIDERS = ("claude", "ollama")
DEFAULT_CLAUDE_AUTH_ENV = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]

# Provider outage patterns (auth, limit, server, network); only checked when an ollama instance failed.
INFRA_ERROR = re.compile(
    r"\b(?:401|402|403|404|408|429|500|502|503|504|529)\b|rate[ _-]?limit|quota|usage limit|too many requests|"
    r"overloaded|unauthori[sz]ed|forbidden|insufficient|billing|credit|time[d ]?-?out|econn\w*|enotfound|etimedout|"
    r"connection (?:refused|reset|error)|socket hang up|fetch failed|service unavailable|bad gateway|"
    r"failed to authenticate|unable to connect|api error", re.I)
# Patterns proving the verify command itself is broken (not a normal red result). Only read when exit != 0.
VERIFY_UNUSABLE = re.compile(
    r"syntax[ _]?error|unexpected token|command not found|^(?:ba)?sh: .*not found|no such file or directory|"
    r"unrecognized arguments|unknown option|no test files found|no tests found|no tests ran|collected 0 items|"
    r"cannot find module|err_module_not_found|no test suite found", re.I | re.M)
VERIFY_USAGE_EXIT2 = re.compile(r"usage:", re.I)
# Harmless child notices, never reported as the failure cause.
BENIGN_STDERR = re.compile(
    r"^\[claude-code:unrecognized_model\]|^Ignoring \d+ permissions\.allow entries from .*not been trusted|"
    r"^Warning: no stdin data received", re.I)
# Generic secret shapes masked in all output, in addition to the exact secret values.
SECRET_PATTERNS = [
    re.compile(r"(?i)\b(?:api[_-]?key|token|secret|password|authorization)\b(\s*[=:]\s*)(?:bearer\s+)?[^\s\"',;]{6,}"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"\b(?:sk|pk|ghp|gho|ghs|xox[a-z])[-_][A-Za-z0-9_-]{16,}"),
]

PREAMBLE = """You are an execution agent. The working directory is the repo. Do exactly the task below.
Do not change anything outside the task scope, do not use git (no add/commit/push), do not delete anything.
End with a short summary: which files you created or changed and what you checked.
If you cannot complete the task, say so plainly in the last paragraph.

=== TASK ===
"""
READONLY_PREAMBLE = """You are a research agent. The working directory is the repo. You may only read and search;
never change or create files. Answer the question below with concrete findings:
file paths with line numbers (`path:line`), a short reason, no guesses without evidence.
End with two clearly separated parts: "Established" and "Unclear / not found".

=== TASK ===
"""
ENV_HINT = """The environment for check commands is already set ({names}). Call check commands directly,
without a `VAR=...` prefix, without `env`/`export`, and without redirecting output to files outside the repo
(shorten long output with `| tail -n 80`). Such variants are rejected without a prompt.

"""


def die(msg, code):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


# ---------- masking ----------

def mask_secrets(text, secrets=()):
    """Replace every exact secret value and every generic secret shape with ***."""
    if not text:
        return text
    for s in sorted({x for x in secrets if x}, key=len, reverse=True):
        text = text.replace(s, "***")
    text = SECRET_PATTERNS[0].sub(lambda m: m.group(0).split(m.group(1))[0] + m.group(1) + "***", text)
    for pat in SECRET_PATTERNS[1:]:
        text = pat.sub("***", text)
    return text


# ---------- task file ----------

def _scalar(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    return v


def _split_list(v):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1]
    return [_scalar(x) for x in v.split(",") if x.strip()]


def parse_task(text):
    """Optional front matter (--- key: value ---). Keys: role, verify, files (inline, [list] or `- item` lines)."""
    meta = {}
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            key = None
            for line in text[4:end].splitlines():
                if re.match(r"^\s+-\s+", line) and key and isinstance(meta.get(key), list):
                    meta[key].append(_scalar(re.sub(r"^\s+-\s+", "", line)))
                elif ":" in line and not line.startswith(" "):
                    k, v = line.split(":", 1)
                    key, v = k.strip(), v.strip()
                    if key == "files":
                        meta[key] = _split_list(v) if v else []
                    else:
                        meta[key] = v
            text = text[end + 4:].lstrip("\n")
    return meta, text


# ---------- config ----------

def load_config(path):
    try:
        cfg = tomllib.loads(Path(path).read_text())
    except (OSError, tomllib.TOMLDecodeError) as e:
        die(f"cannot read config {path}: {e}", 2)
    cfg.setdefault("defaults", {})
    cfg.setdefault("roles", {})
    cfg.setdefault("escalation", {})
    cfg.setdefault("claude", {})
    cfg.setdefault("mcp", {})
    cfg.setdefault("env", {})
    return cfg


def split_model(spec):
    """"ollama/x" -> ("ollama", "x"), "claude/y" -> ("claude", "y"), "z" -> ("", "z")."""
    p, sep, name = spec.partition("/")
    return (p, name) if sep and p in VALID_PROVIDERS else ("", spec)


def provider_of(cfg, role):
    r = cfg["roles"][role]
    return r.get("provider") or split_model(r.get("model", ""))[0] or cfg["defaults"].get("provider", "claude")


def model_of(cfg, role):
    return split_model(cfg["roles"][role]["model"])[1]


def is_worker(cfg, role):
    return cfg["roles"][role].get("who") == "worker"


def fallback_of(cfg, role):
    """Fallback model of an ollama role (role setting, then [defaults]) or None."""
    if provider_of(cfg, role) != "ollama":
        return None
    return cfg["roles"][role].get("fallback_model") or cfg["defaults"].get("fallback_model")


def validate_config(cfg, name="config"):
    """Return a list of problems; empty means valid."""
    errs = []
    d = cfg["defaults"]
    for k in ("timeout_seconds",):
        if k not in d:
            errs.append(f"[defaults] {k} missing")
    if not cfg["roles"]:
        errs.append("no [roles.*] defined")
    for role, r in cfg["roles"].items():
        who = r.get("who")
        if who not in VALID_WHO:
            errs.append(f"roles.{role}.who must be one of {VALID_WHO}")
            continue
        if who == "session":
            continue
        m = r.get("model", "")
        if not m:
            errs.append(f"roles.{role}.model missing")
            continue
        if re.search(r"<[^>]*>", m):
            errs.append(f"roles.{role}.model is still a placeholder ({m}); fill in the exact model ID")
        p = provider_of(cfg, role)
        if p not in VALID_PROVIDERS:
            errs.append(f"roles.{role}: provider must be one of {VALID_PROVIDERS}, got '{p}'")
        elif p == "ollama" and not d.get("base_url"):
            errs.append(f"roles.{role} uses ollama but [defaults] base_url is missing")
        fb = fallback_of(cfg, role)
        if fb and re.search(r"<[^>]*>", fb):
            errs.append(f"fallback_model for {role} is still a placeholder ({fb})")
    for role, chain in cfg["escalation"].items():
        if role not in cfg["roles"]:
            errs.append(f"escalation.{role}: unknown role")
        for r in chain:
            if r not in cfg["roles"]:
                errs.append(f"escalation.{role}: unknown role '{r}'")
            elif not is_worker(cfg, r):
                errs.append(f"escalation.{role}: '{r}' is not a worker role")
    for nm, m in cfg["mcp"].items():
        if not (m.get("url") or m.get("command")):
            errs.append(f"mcp.{nm}: needs `url` (http) or `command`")
    for k in cfg["env"].get("set", {}):
        if UNSAFE_ENV.match(k):
            errs.append(f"env.set.{k}: variable name is not allowed")
    return errs


def claude_auth_names(cfg):
    return cfg["defaults"].get("claude_auth_env", DEFAULT_CLAUDE_AUTH_ENV)


# ---------- environment ----------

def verify_env(cmd):
    """Assignments at the start of a verify command: `export A=1; ...`, `A=1 B=2 cmd ...`."""
    lex = shlex.shlex(cmd or "", posix=True, punctuation_chars=";&|")
    lex.whitespace_split = True
    env = {}
    try:
        for tok in lex:
            if tok in ("export", ";", "&&"):
                continue
            m = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)=(.*)", tok, re.S)
            if not m:
                break
            if not UNSAFE_ENV.match(m.group(1)):
                env[m.group(1)] = m.group(2)
    except ValueError:
        return {}
    return env


def extra_env(cfg):
    """[env] pass = [host variable names], [env.set] = literal values. Unsafe names are dropped."""
    e = cfg["env"]
    out = {k: os.environ[k] for k in e.get("pass", []) if k in os.environ and not UNSAFE_ENV.match(k)}
    out.update({k: str(v) for k, v in e.get("set", {}).items() if not UNSAFE_ENV.match(k)})
    return out


def secret_names(cfg):
    names = {cfg["defaults"].get("api_key_env", "")} | set(claude_auth_names(cfg))
    names |= {m.get("api_key_env", "") for m in cfg["mcp"].values()}
    return {n for n in names if n}


def secret_values(cfg):
    return [os.environ[n] for n in secret_names(cfg) if os.environ.get(n)]


def build_mcp(cfg, readonly):
    """MCP servers, tool grants and prompt hints from [mcp.<name>]. Readonly roles only get `readonly_ok` servers."""
    servers, tools, hint = {}, [], ""
    for nm, m in cfg["mcp"].items():
        if not m.get("enabled", True) or (readonly and not m.get("readonly_ok", False)):
            continue
        if m.get("url"):
            s = {"type": m.get("type", "http"), "url": m["url"]}
            key_env, header = m.get("api_key_env"), m.get("api_key_header")
            if key_env and header and os.environ.get(key_env):  # expanded by Claude Code, value never on the command line
                s["headers"] = {header: "${%s}" % key_env}
        else:
            s = {"command": m["command"], "args": m.get("args", [])}
        servers[nm] = s
        tools.append(f"mcp__{nm}")
        if m.get("hint"):
            hint += m["hint"].strip() + "\n\n"
    return servers, tools, hint


def trust_workspace(state, workdir):
    """Trust entry in the worker's own config dir so project settings are not dropped as untrusted."""
    roots = {str(Path(workdir).resolve())}
    for args in (["rev-parse", "--show-toplevel"], ["rev-parse", "--path-format=absolute", "--git-common-dir"]):
        try:
            out = subprocess.run(["git", "-C", workdir, *args], capture_output=True, text=True, timeout=10).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            continue
        if out:
            roots.add(str(Path(out).parent if args[-1] == "--git-common-dir" else Path(out)))
    Path(state, ".claude.json").write_text(json.dumps({"projects": {r: {"hasTrustDialogAccepted": True} for r in roots}}))


def clean_stderr(err):
    return "\n".join(l for l in err.splitlines() if not BENIGN_STDERR.search(l.strip())).strip()


# ---------- scope check ----------

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".cache"}
HASH_LIMIT = 256 * 1024


def snapshot(root, skip_rel=()):
    """{relative path: (mtime_ns, size, sha1 or None)} for every file under root (workers have no git)."""
    snap, skip = {}, set(skip_rel)
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for f in fns:
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if rel in skip or any(rel.startswith(s) for s in skip if s.endswith("/")):
                continue
            try:
                st = os.lstat(p)
                h = None
                if st.st_size <= HASH_LIMIT and not os.path.islink(p):
                    h = hashlib.sha1(Path(p).read_bytes()).hexdigest()
            except OSError:
                continue
            snap[rel] = (st.st_mtime_ns, st.st_size, h)
    return snap


def diff_snapshots(before, after):
    """Sorted list of (path, 'added'|'modified'|'deleted')."""
    out = []
    for p, v in after.items():
        if p not in before:
            out.append((p, "added"))
        else:
            b = before[p]
            if (b[0], b[1]) != (v[0], v[1]) and not (b[2] and b[2] == v[2]):
                out.append((p, "modified"))
    out += [(p, "deleted") for p in before if p not in after]
    return sorted(out)


def glob_to_regex(g):
    g = g.strip().lstrip("./")
    if g.endswith("/"):
        g += "**"
    i, rx = 0, ""
    while i < len(g):
        if g.startswith("**/", i):
            rx += "(?:.*/)?"; i += 3
        elif g.startswith("**", i):
            rx += ".*"; i += 2
        elif g[i] == "*":
            rx += "[^/]*"; i += 1
        elif g[i] == "?":
            rx += "[^/]"; i += 1
        else:
            rx += re.escape(g[i]); i += 1
    return re.compile("^" + rx + "$")


def scope_findings(changes, globs):
    """Changed files outside the declared globs. Empty globs = no check (returns [])."""
    if not globs:
        return []
    rxs = [glob_to_regex(g) for g in globs]
    return [(p, kind) for p, kind in changes if not any(rx.match(p) for rx in rxs)]


# ---------- verify ----------

def precheck_verify(cmd, workdir, env):
    """Run the verify command once before any worker. ok=False only if the command itself is not runnable;
    a red but valid result (the change is still missing) is ok=True."""
    try:
        p = subprocess.run(cmd, shell=True, cwd=workdir, env=env, capture_output=True, text=True, timeout=300)
        out, err, rc = p.stdout, p.stderr, p.returncode
    except subprocess.TimeoutExpired:
        return True, "", f"$ {cmd}\n(timeout after 300s, command runs)"
    log = f"$ {cmd}\n{out}{err}(exit {rc})"
    if rc == 127:
        return False, "exit code 127: command not found", log
    if rc == 126:
        return False, "exit code 126: command not executable", log
    if rc != 0:
        text = f"{out}\n{err}"
        if VERIFY_UNUSABLE.search(text) or (rc == 2 and VERIFY_USAGE_EXIT2.search(text)):
            return False, f"exit code {rc} with an error from the command itself (syntax/usage error or no tests)", log
    return True, "", log


def verify_environment(cfg):
    """Host environment without secrets, plus [env]."""
    env = {k: v for k, v in os.environ.items() if k not in secret_names(cfg)}
    env.update(extra_env(cfg))
    return env


# ---------- one attempt ----------

def run_attempt(role, cfg, body, meta, workdir, fallback=None, skip_rel=()):
    r = cfg["roles"][role]
    d = cfg["defaults"]
    if fallback:
        provider, model = split_model(fallback)
        provider = provider or "claude"
    else:
        provider, model = provider_of(cfg, role), model_of(cfg, role)
    readonly = bool(r.get("readonly"))
    c = cfg["claude"]
    allowed = list(READONLY_TOOLS) if readonly else list(c.get("allowed_tools", READONLY_TOOLS))
    disallowed = list(dict.fromkeys(list(c.get("disallowed_tools", [])) + MANDATORY_DISALLOWED))
    preamble = READONLY_PREAMBLE if readonly else PREAMBLE
    secrets = secret_values(cfg)

    # Clean environment: own temp HOME, PATH and proxy vars only; no host token.
    state = tempfile.mkdtemp(prefix="delegate-")
    env = {k: os.environ[k] for k in PASS_ENV if k in os.environ}
    inherit = d.get("claude_login") == "inherit" and provider == "claude"
    if inherit:  # weaker isolation, opt-in: reuse the host login (subscription sessions)
        env = dict(os.environ)
    else:
        env.update({"HOME": state, "CLAUDE_CONFIG_DIR": state})
        trust_workspace(state, workdir)
    if provider == "ollama":
        env.update({
            "ANTHROPIC_BASE_URL": d["base_url"], "ANTHROPIC_AUTH_TOKEN": os.environ.get(d.get("api_key_env", ""), ""),
            "ANTHROPIC_MODEL": model, "ANTHROPIC_SMALL_FAST_MODEL": model,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": model, "ANTHROPIC_DEFAULT_SONNET_MODEL": model,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": model,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "CLAUDE_CODE_MAX_RETRIES": "2",
        })
    elif not inherit:  # only the variable(s) named in the config reach a Claude worker
        env.update({k: os.environ[k] for k in claude_auth_names(cfg) if k in os.environ})
    v_env = verify_env(meta.get("verify", ""))
    env.update(extra_env(cfg))
    env.update(v_env)
    if not readonly:
        names = sorted(set(v_env) | set(extra_env(cfg)))
        if names:
            preamble = preamble.replace("=== TASK ===", ENV_HINT.format(names=", ".join(names)) + "=== TASK ===")
    servers, mcp_tools, hint = build_mcp(cfg, readonly)
    mcp = []
    if servers:
        allowed += mcp_tools
        preamble = preamble.replace("=== TASK ===", hint + "=== TASK ===") if hint else preamble
        mcp = ["--mcp-config", json.dumps({"mcpServers": servers})]
        for nm, m in cfg["mcp"].items():  # extra key vars for server config expansion
            k = m.get("api_key_env")
            if k and k in os.environ and nm in servers:
                env[k] = os.environ[k]
    cmd = ["claude", "-p", preamble + body, "--model", model, "--output-format", "json",
           "--permission-mode", c.get("permission_mode", "acceptEdits"), *mcp,
           "--allowedTools", *allowed, "--disallowedTools", *disallowed]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=workdir, env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL,
                           timeout=d["timeout_seconds"])
        out, err, rc = p.stdout, clean_stderr(p.stderr), p.returncode
    except subprocess.TimeoutExpired:
        out, err, rc = "", f"timeout after {d['timeout_seconds']}s", 124
    finally:
        shutil.rmtree(state, ignore_errors=True)
    result, is_error, denials = out, rc != 0, []
    try:
        j = json.loads(out)
        result, is_error = j.get("result", ""), bool(j.get("is_error")) or rc != 0
        denials = [f"{x.get('tool_name', '?')}: {(x.get('tool_input') or {}).get('command') or json.dumps(x.get('tool_input'))}"
                   for x in j.get("permission_denials") or [] if isinstance(x, dict)]
    except (json.JSONDecodeError, TypeError):
        pass
    infra = provider == "ollama" and is_error and (rc == 124 or bool(INFRA_ERROR.search(f"{result}\n{err}")))
    ok, verify_log, cause = not is_error, "", ""
    if rc == 124:
        cause = f"timeout after {d['timeout_seconds']}s"
    elif infra:
        cause = "provider API unusable (auth/limit/server/network), see stderr"
    elif is_error:
        cause = f"worker instance reported an error (rc={rc}), see answer and stderr"
    if ok and meta.get("verify"):
        v = subprocess.run(meta["verify"], shell=True, cwd=workdir, env=verify_environment(cfg) | v_env,
                           capture_output=True, text=True)
        verify_log = f"$ {meta['verify']}\n{v.stdout}{v.stderr}(exit {v.returncode})"
        ok = v.returncode == 0
        if not ok:
            cause = f"verify red (exit {v.returncode}), worker instance itself without error"
    m = lambda s: mask_secrets(s, secrets)
    return {"role": role, "model": f"{provider}/{model}", "ok": ok, "rc": rc, "infra": infra, "cause": cause,
            "denials": [m(x)[:300] for x in denials], "fallback": bool(fallback), "seconds": round(time.time() - t0),
            "result": m(result).strip(), "stderr": m(err).strip()[-1500:], "verify": m(verify_log).strip()}


# ---------- main ----------

def resolve(cfg, role, no_escalate):
    chain = [role] + ([] if no_escalate else cfg["escalation"].get(role, []))
    return chain


def describe(cfg, chain):
    lines = []
    for r in chain:
        fb = fallback_of(cfg, r)
        lines.append(f"  {r}: provider={provider_of(cfg, r)} model={model_of(cfg, r)}"
                     f"{' readonly' if cfg['roles'][r].get('readonly') else ''}"
                     f"{' fallback=' + fb if fb else ''}")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("task_file")
    ap.add_argument("--role", help="start role (required here or as `role:` in the task front matter)")
    ap.add_argument("--config", help="config file (default: config.toml next to this script)")
    ap.add_argument("--workdir", default=".")
    ap.add_argument("--out", help="result file (default: <task>.result.md; full report: <task>.report.md)")
    ap.add_argument("--no-escalate", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="validate config and task, print the resolved plan, start nothing")
    a = ap.parse_args(argv)

    config_path = Path(a.config) if a.config else HERE / "config.toml"
    cfg = load_config(config_path)
    task_path = Path(a.task_file)
    if not task_path.is_file():
        die(f"task file not found: {task_path}", 2)
    meta, body = parse_task(task_path.read_text())
    role = a.role or meta.get("role")
    if not role:
        die("no role: pass --role or set `role:` in the task front matter (a task without a role is rejected)", 2)
    if role not in cfg["roles"]:
        die(f"role '{role}' not in {config_path.name} (available: {', '.join(cfg['roles'])})", 2)
    if not is_worker(cfg, role):
        die(f"role '{role}' has who=\"{cfg['roles'][role]['who']}\": the session does it itself. Pick a role the wrapper runs", 2)
    errs = validate_config(cfg, config_path.name)
    if errs:
        die("invalid config:\n  - " + "\n  - ".join(errs), 2)
    chain = resolve(cfg, role, a.no_escalate)
    globs = meta.get("files") or []

    print(f"config: {config_path.name}")
    print(f"role: {role}")
    print(f"provider: {provider_of(cfg, role)}")
    print(f"model: {model_of(cfg, role)}")
    print("plan: " + " -> ".join(chain) + " -> session")
    if a.dry_run:
        for l in describe(cfg, chain):
            print(l)
        print(f"verify: {meta.get('verify') or '-'}")
        print(f"scope: {', '.join(globs) if globs else '- (no scope check)'}")
        key = cfg["defaults"].get("api_key_env", "")
        if any(provider_of(cfg, r) == "ollama" for r in chain):
            print(f"api key {key}: {'set' if os.environ.get(key) else 'missing'}")
        print("dry run: nothing started")
        return 0

    workdir = str(Path(a.workdir).resolve())
    if meta.get("verify"):
        ok, reason, log = precheck_verify(meta["verify"], workdir, verify_environment(cfg))
        if not ok:
            print(f"ERROR: verify command not runnable: {reason}\n  command: {meta['verify']}\n  output end:\n{log[-800:]}\n"
                  "  No worker started. Fix the verify command in the task file.", file=sys.stderr)
            return 4
        print("pre-check: verify command is runnable.")
    if not shutil.which("claude"):
        die("`claude` CLI not in PATH. Install it or add it to PATH.", 3)
    d = cfg["defaults"]
    ollama_down = False
    if any(provider_of(cfg, r) == "ollama" for r in chain) and not os.environ.get(d.get("api_key_env", ""), ""):
        if all(fallback_of(cfg, r) for r in chain if provider_of(cfg, r) == "ollama"):
            print(f"WARNING: {d.get('api_key_env')} is not set -> fallback models are used.", file=sys.stderr)
            ollama_down = True
        else:
            die(f"{d.get('api_key_env')} is not set and a role has no fallback. Set the variable or add a fallback_model.", 3)
    if (any(provider_of(cfg, r) == "claude" for r in chain) and d.get("claude_login") != "inherit"
            and not any(os.environ.get(n) for n in claude_auth_names(cfg))):
        print(f"WARNING: none of {', '.join(claude_auth_names(cfg))} is set; Claude workers run with a clean HOME and may "
              "fail to authenticate (set one, or set [defaults] claude_login = \"inherit\").", file=sys.stderr)

    out = Path(a.out) if a.out else task_path.with_suffix(".result.md")
    report = out.with_name(re.sub(r"\.result$", "", out.stem) + ".report.md")
    skip_rel = []
    for p in (task_path, out, report, HERE / "tasks"):
        try:
            rel = Path(p).resolve().relative_to(workdir).as_posix()
            skip_rel.append(rel + "/" if Path(p).is_dir() else rel)
        except ValueError:
            pass
    before = snapshot(workdir, skip_rel)

    attempts, prev, failed_models = [], "", set()

    def attempt(r, body_r, fallback=None):
        print(f"-> attempt with {r}{f' ({fallback})' if fallback else ''} ...", flush=True)
        res = run_attempt(r, cfg, body_r, meta, workdir, fallback)
        attempts.append(res)
        print(f"   {'OK' if res['ok'] else 'FAILED'} ({res['seconds']}s, rc={res['rc']})"
              + (f" - cause: {res['cause']}" if not res["ok"] and res["cause"] else ""))
        if not res["ok"]:
            failed_models.add(res["model"])
        return res

    for r in chain:
        body_r = body if not prev else (body + "\n\n=== NOTE ===\nAn earlier attempt failed. Check the current repo state "
                                        "and finish the task. Last message of the earlier attempt:\n" + prev)
        fb = fallback_of(cfg, r)
        if fb and ollama_down:
            if fb in failed_models:
                print(f"-> {r}: fallback {fb} already failed, skipped.")
                continue
            res = attempt(r, body_r, fb)
        else:
            res = attempt(r, body_r)
            if not res["ok"] and res["infra"] and fb:
                ollama_down = True
                print(f"   provider API unusable -> fallback {fb}", flush=True)
                res = attempt(r, body_r, fb)
        if res["ok"]:
            break
        prev = (res["verify"] or res["result"] or res["stderr"])[-1500:]

    ok = bool(attempts) and attempts[-1]["ok"]
    changes = diff_snapshots(before, snapshot(workdir, skip_rel))
    readonly_run = bool(cfg["roles"][role].get("readonly"))
    findings = []
    if readonly_run and changes:
        findings += [f"readonly role '{role}' changed files: {p} ({k})" for p, k in changes]
    else:
        findings += [f"changed outside scope: {p} ({k})" for p, k in scope_findings(changes, globs)]

    lines = [f"# Result: {task_path.name}", "", f"Status: **{'DONE' if ok else 'FAILED - the session takes over'}**", ""]
    if findings:
        lines += ["## Findings", ""] + [f"- {f}" for f in findings] + [""]
    if globs:
        lines += [f"Scope: {', '.join(globs)}", ""]
    for i, x in enumerate(attempts, 1):
        tag = ", fallback after provider outage" if x["fallback"] else ""
        short = x["result"] if len(x["result"]) <= 1500 else x["result"][:1500] + f"\n... (full report: {report.name})"
        lines += [f"## Attempt {i}: {x['role']} ({x['model']}{tag}) - {'ok' if x['ok'] else 'failed'}, {x['seconds']}s", "",
                  *([f"Cause: {x['cause']}", ""] if x["cause"] and not x["ok"] else []),
                  "Answer:", "", short or "(empty)", ""]
        if x["denials"]:
            lines += ["Denied tool calls (permission check):", ""] + [f"- `{q}`" for q in x["denials"]] + [""]
        if x["verify"]:
            lines += ["Acceptance check (verify):", "", "```", x["verify"], "```", ""]
        if x["stderr"] and not x["ok"]:
            lines += ["stderr (end):", "", "```", x["stderr"], "```", ""]
    out.write_text("\n".join(lines))
    rep = [f"# Full worker report: {task_path.name}", ""]
    for i, x in enumerate(attempts, 1):
        rep += [f"## Attempt {i}: {x['role']} ({x['model']})", "", x["result"] or "(empty)", ""]
    report.write_text("\n".join(rep))
    print(f"result: {out}\nreport: {report}")
    for f in findings:
        print(f"FINDING: {f}", file=sys.stderr)
    if not ok:
        print("All steps failed -> the session takes over the task.", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

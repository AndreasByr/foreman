#!/usr/bin/env python3
"""Run one task file with a worker model (a second, isolated `claude -p` instance).

Usage:  run_task.py <task.md> [--role ROLE] [--config FILE] [--workdir DIR] [--out FILE]
                    [--no-escalate] [--dry-run]

The role is required: `--role` or `role:` in the task front matter. A task without a role is rejected.
Front matter (all keys optional except role):
    role: execution_simple
    verify: <command>        # mechanical acceptance, exit 0 = done
    files: [src/**, tests/**]   # scope: changed files outside these globs are reported as findings

A role may set `timeout` (seconds); `[defaults] timeout_seconds` is the default.

Exit codes: 0 done, 1 all steps failed (the session takes over), 2 call/config error,
            3 prerequisite missing (claude CLI, API key without fallback),
            4 the verify command itself is not runnable (no worker started).

Limits: optional [limits] / [limits.<provider>] settings cap calls per run and per minute/hour (shared ledger file),
pause and retry on 429-style failures, and lock a provider for the rest of the run after 3 failures in a row.
Reaching max_calls_per_run stops the whole run with exit code 1.
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
VALID_PROVIDERS = ("claude", "ollama", "gateway")
DEFAULT_MAX_CALLS = 12
LIMIT_KEYS = {"requests_per_minute": int, "requests_per_hour": int, "pause_seconds": float, "max_pause_seconds": float}
LOCK_AFTER_FAILURES = 3
# Providers that talk to an Anthropic-compatible endpoint with their own key (settings: [defaults] for ollama, [gateway]).
ENDPOINT_PROVIDERS = ("ollama", "gateway")
DEFAULT_CLAUDE_AUTH_ENV = ["CLAUDE_CODE_OAUTH_TOKEN"]  # subscription token (`claude setup-token`); never an API key
GATEWAY_URL_ENV = "FOREMAN_GATEWAY_URL"  # gateway base URL when [gateway] / [defaults] set none
GATEWAY_KEY_ENV = "FOREMAN_GATEWAY_KEY"  # gateway key variable when no api_key_env is configured
# A Claude worker that cannot log in. In a Claude Code cloud session the login belongs to the session; a worker with a
# clean HOME and no token gets "Not logged in". Then every further Claude attempt fails the same way (exit 5).
CLAUDE_LOGIN_ERROR = re.compile(r"not logged in|please run /login|authentication error|invalid (?:x-)?api[ _-]?key|"
                                r"oauth token (?:has )?expired|credit balance is too low", re.I)
# Keys that never reach a Claude worker, even with the inherited login.
NEVER_TO_CLAUDE_WORKER = re.compile(r"^(?:ANTHROPIC_API_KEY|OLLAMA_API_KEY|FOREMAN_GATEWAY_\w+|LLM_GATEWAY_\w+|ITSAPLAN_\w+|LINEAR_\w+|"
                                    r"GITHUB_TOKEN|GH_TOKEN|DISCORD_\w*TOKEN\w*|\w*_FIRE_TOKEN)$")

# Provider outage patterns (auth, limit, server, network); only checked when an ollama or gateway instance failed.
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
Do not write under .claude/ (skills, hooks and settings belong to the session).
Do not read key files (.env*, *.pem, id_*, credentials*); you may only check their existence and permissions.
Model IDs are written only in tools/delegate/config.toml; never add or change model IDs elsewhere.

=== TASK ===
"""
READONLY_PREAMBLE = """You are a research agent. The working directory is the repo. You may only read and search;
never change or create files. Answer the question below with concrete findings:
file paths with line numbers (`path:line`), a short reason, no guesses without evidence.
End with two clearly separated parts: "Established" and "Unclear / not found".
Do not write under .claude/ (skills, hooks and settings belong to the session).
Do not read key files (.env*, *.pem, id_*, credentials*); you may only check their existence and permissions.
Model IDs are written only in tools/delegate/config.toml; never add or change model IDs elsewhere.

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
    cfg.setdefault("gateway", {})
    cfg.setdefault("limits", {})
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


def endpoint_cfg(cfg, provider):
    """Settings of an endpoint provider: [defaults] for ollama, [gateway] for gateway (falls back to [defaults])."""
    d = cfg["defaults"]
    if provider == "gateway":
        g = cfg.get("gateway", {})
        return {"base_url": g.get("base_url") or d.get("gateway_base_url")
                or os.environ.get(g.get("base_url_env") or GATEWAY_URL_ENV) or "",
                "api_key_env": g.get("api_key_env") or d.get("gateway_api_key_env") or GATEWAY_KEY_ENV,
                "fallback_model": g.get("fallback_model", "")}
    return {"base_url": d.get("base_url", ""), "api_key_env": d.get("api_key_env", ""),
            "fallback_model": d.get("fallback_model", "")}


def fallback_of(cfg, role):
    """Fallback model of an ollama or gateway role (role setting, then provider settings) or None."""
    p = provider_of(cfg, role)
    if p not in ENDPOINT_PROVIDERS:
        return None
    return cfg["roles"][role].get("fallback_model") or endpoint_cfg(cfg, p)["fallback_model"] or None


def is_positive_number(v):
    """True for a positive int or float (bool excluded)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0


def validate_config(cfg, name="config"):
    """Return a list of problems; empty means valid."""
    errs = []
    d = cfg["defaults"]
    consent = cfg.get("gateway", {}).get("chatgpt_via_gateway")
    if consent is not None and consent != "accepted-risk":
        errs.append(f'[gateway] chatgpt_via_gateway must be "accepted-risk" (or unset), got {consent!r}')

    def check_chatgpt(where, m):
        if isinstance(m, str) and re.search(r"(?:^|/)chatgpt/", m) and consent != "accepted-risk":
            errs.append(f'{where} uses a chatgpt/ model ({m}); this needs the human\'s informed consent: '
                        'set [gateway] chatgpt_via_gateway = "accepted-risk" (see README.md)')

    def check_fallback_claude(where, m):
        if isinstance(m, str) and m and "/" in m and m.split("/", 1)[0] not in ("claude", "chatgpt"):
            errs.append(f"{where} fallback_model must be a Claude model (claude/<id>), got {m!r}")

    for k in ("defaults", "gateway"):
        check_chatgpt(f"[{k}] fallback_model", cfg.get(k, {}).get("fallback_model", ""))
        check_fallback_claude(f"[{k}]", cfg.get(k, {}).get("fallback_model", ""))
    for k in ("timeout_seconds",):
        if k not in d:
            errs.append(f"[defaults] {k} missing")
    if "timeout_seconds" in d and not is_positive_number(d["timeout_seconds"]):
        errs.append(f"[defaults] timeout_seconds must be a positive number, got {d['timeout_seconds']!r}")
    if not cfg["roles"]:
        errs.append("no [roles.*] defined")
    if d.get("claude_login", "inherit") not in ("inherit", "isolated"):
        errs.append('[defaults] claude_login must be "inherit" or "isolated"')
    if "ANTHROPIC_API_KEY" in d.get("claude_auth_env", []):
        errs.append("[defaults] claude_auth_env must not contain ANTHROPIC_API_KEY (subscription only, no API billing)")
    for role, r in cfg["roles"].items():
        who = r.get("who")
        if who not in VALID_WHO:
            errs.append(f"roles.{role}.who must be one of {VALID_WHO}")
            continue
        if who == "session":
            continue
        if "timeout" in r and not is_positive_number(r["timeout"]):
            errs.append(f"roles.{role}.timeout must be a positive number, got {r['timeout']!r}")
        m = r.get("model", "")
        if not m:
            errs.append(f"roles.{role}.model missing")
            continue
        check_chatgpt(f"roles.{role}.model", m)
        check_chatgpt(f"roles.{role}.fallback_model", r.get("fallback_model", ""))
        check_fallback_claude(f"roles.{role}", r.get("fallback_model", ""))
        if re.search(r"<[^>]*>", m):
            errs.append(f"roles.{role}.model is still a placeholder ({m}); fill in the exact model ID")
        p = provider_of(cfg, role)
        if p not in VALID_PROVIDERS:
            errs.append(f"roles.{role}: provider must be one of {VALID_PROVIDERS}, got '{p}'")
        elif p in ENDPOINT_PROVIDERS and not endpoint_cfg(cfg, p)["base_url"]:
            where = "[gateway] base_url" if p == "gateway" else "[defaults] base_url"
            errs.append(f"roles.{role} uses {p} but {where} is missing")
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
    errs += validate_limits(cfg.get("limits", {}))
    return errs


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_limits(lim):
    if not isinstance(lim, dict):
        return ["[limits] must be a table"]
    errs = []
    for k, v in lim.items():
        if isinstance(v, dict):
            if k not in VALID_PROVIDERS:
                errs.append(f"[limits.{k}]: unknown provider (one of {VALID_PROVIDERS})")
                continue
            for kk, vv in v.items():
                if kk not in LIMIT_KEYS:
                    errs.append(f"[limits.{k}] unknown key '{kk}' (allowed: {', '.join(LIMIT_KEYS)})")
                elif not _is_num(vv) or vv <= 0 or (LIMIT_KEYS[kk] is int and not isinstance(vv, int)):
                    errs.append(f"[limits.{k}] {kk} must be a positive {'integer' if LIMIT_KEYS[kk] is int else 'number'}")
            if all(_is_num(v.get(x)) for x in ("pause_seconds", "max_pause_seconds")) and v["pause_seconds"] > v["max_pause_seconds"]:
                errs.append(f"[limits.{k}] pause_seconds must not be larger than max_pause_seconds")
        elif k == "max_calls_per_run":
            if not _is_num(v) or not isinstance(v, int) or v <= 0:
                errs.append("[limits] max_calls_per_run must be a positive integer")
        elif k == "ledger_file":
            if not isinstance(v, str) or not v:
                errs.append("[limits] ledger_file must be a non-empty string")
        else:
            errs.append(f"[limits] unknown key '{k}' (allowed: max_calls_per_run, ledger_file, provider tables)")
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
    names = {cfg["defaults"].get("api_key_env", ""), endpoint_cfg(cfg, "gateway")["api_key_env"]} | set(claude_auth_names(cfg))
    names.add(cfg.get("gateway", {}).get("base_url_env", ""))  # an address variable with a custom name stays out of workers too
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


# ---------- limits ----------

class CallLimitReached(Exception):
    pass


class RunLimits:
    """Call cap per run, per-provider request windows (ledger shared between runs) and in-memory provider locks."""

    def __init__(self, cfg, ledger_path, now=time.time, sleep=time.sleep):
        lim = cfg.get("limits", {})
        self.lim = lim if isinstance(lim, dict) else {}
        self.max_calls = self.lim.get("max_calls_per_run", DEFAULT_MAX_CALLS)
        self.path, self.now, self.sleep = Path(ledger_path), now, sleep
        self.calls, self.locks, self.pauses = 0, {}, []
        self.fails, self.warned = {}, False
        self.ledger = self._load()

    def _prov(self, provider):
        t = self.lim.get(provider)
        return t if isinstance(t, dict) else {}

    def _prune(self, ledger):
        cutoff = self.now() - 3600
        out = {}
        for prov, stamps in ledger.items():
            kept = [t for t in stamps if _is_num(t) and t >= cutoff] if isinstance(stamps, list) else []
            if kept:
                out[prov] = kept
        return out

    def _load(self):
        try:
            data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            return {}
        return self._prune(data) if isinstance(data, dict) else {}

    def _save(self):
        tmp = self.path.with_name(self.path.name + ".tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(self.ledger))
            os.replace(tmp, self.path)
        except OSError as e:
            if not self.warned:
                self.warned = True
                print(f"WARNING: cannot write limits ledger {self.path}: {e}", file=sys.stderr)

    def note_call(self, provider):
        if self.calls >= self.max_calls:
            raise CallLimitReached(f"call limit reached ({self.calls} calls)")
        self.calls += 1
        self.ledger = self._prune(self.ledger)
        self.ledger.setdefault(provider, []).append(self.now())
        self._save()

    def is_locked(self, provider):
        return provider in self.locks

    def lock(self, provider, reason):
        if provider not in self.locks:
            self.locks[provider] = reason
            print(f"LOCK: {provider}: {reason}", flush=True)

    def wait_for_slot(self, provider):
        """Sleep until the provider's minute/hour window has room. False = locked (wait would exceed max pause)."""
        if self.is_locked(provider):
            return False
        p = self._prov(provider)
        max_pause = float(p.get("max_pause_seconds", 60))
        now, wait = self.now(), 0.0
        for key, window, label in (("requests_per_minute", 60, "per-minute"), ("requests_per_hour", 3600, "per-hour")):
            limit = p.get(key)
            if not limit:
                continue
            recent = sorted(t for t in self.ledger.get(provider, []) if t > now - window)
            w = recent[len(recent) - limit] + window - now if len(recent) >= limit else 0.0
            if w > max_pause:
                self.lock(provider, f"{label} limit of {limit} requests reached "
                                    f"(next free slot in {w:.0f}s, max pause {max_pause:g}s)")
                return False
            wait = max(wait, w)
        if wait > 0:
            self.pauses.append((provider, wait))
            self.sleep(wait)
        return True

    def failure(self, provider, cause):
        """Count a provider failure. Returns the pause before a retry, or None when the provider is now locked."""
        n = self.fails[provider] = self.fails.get(provider, 0) + 1
        if n >= LOCK_AFTER_FAILURES:
            self.lock(provider, f"{n} failures in a row, last cause: {cause}")
            return None
        p = self._prov(provider)
        pause = min(float(p.get("pause_seconds", 5)) * 2 ** (n - 1), float(p.get("max_pause_seconds", 60)))
        self.pauses.append((provider, pause))
        return pause

    def drop_last_pause(self):
        """Forget the last recorded pause (it was not slept)."""
        if self.pauses:
            self.pauses.pop()

    def success(self, provider):
        self.fails[provider] = 0


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
    inherit = d.get("claude_login", "inherit") == "inherit" and provider == "claude"
    if inherit:  # default: reuse the session's login (subscription); strip keys that do not belong to a worker
        env = {k: v for k, v in os.environ.items() if not NEVER_TO_CLAUDE_WORKER.match(k) and k not in secret_names(cfg)}
    else:
        env.update({"HOME": state, "CLAUDE_CONFIG_DIR": state})
        trust_workspace(state, workdir)
    if provider in ENDPOINT_PROVIDERS:
        ep = endpoint_cfg(cfg, provider)
        env.update({
            "ANTHROPIC_BASE_URL": ep["base_url"], "ANTHROPIC_AUTH_TOKEN": os.environ.get(ep["api_key_env"], ""),
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
                           timeout=r.get("timeout", d["timeout_seconds"]))
        out, err, rc = p.stdout, clean_stderr(p.stderr), p.returncode
    except subprocess.TimeoutExpired:
        out, err, rc = "", f"timeout after {r.get('timeout', d['timeout_seconds']):g}s", 124
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
    infra = provider in ENDPOINT_PROVIDERS and is_error and (rc == 124 or bool(INFRA_ERROR.search(f"{result}\n{err}")))
    login = provider == "claude" and is_error and bool(CLAUDE_LOGIN_ERROR.search(f"{result}\n{err}"))
    ok, verify_log, cause = not is_error, "", ""
    if login:
        cause = "Claude worker not logged in (no session login and no CLAUDE_CODE_OAUTH_TOKEN), see stderr"
    elif rc == 124:
        cause = f"timeout after {r.get('timeout', d['timeout_seconds']):g}s"
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
    return {"role": role, "model": f"{provider}/{model}", "ok": ok, "rc": rc, "infra": infra, "login": login, "cause": cause,
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
        for prov in ENDPOINT_PROVIDERS:
            if any(provider_of(cfg, r) == prov for r in chain):
                key = endpoint_cfg(cfg, prov)["api_key_env"]
                print(f"api key {key} ({prov}): {'set' if os.environ.get(key) else 'missing'}")
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
    ledger = Path(cfg["limits"].get("ledger_file") or "tasks/.limits.json")
    limits = RunLimits(cfg, config_path.resolve().parent / ledger)  # absolute ledger_file wins in the join
    down = set()  # endpoint providers that are unusable in this run
    for prov in ENDPOINT_PROVIDERS:
        roles = [r for r in chain if provider_of(cfg, r) == prov]
        key = endpoint_cfg(cfg, prov)["api_key_env"]
        if roles and not os.environ.get(key, ""):
            if all(fallback_of(cfg, r) for r in roles):
                print(f"WARNING: {key} is not set -> fallback models are used.", file=sys.stderr)
                down.add(prov)
                limits.lock(prov, f"{key} not set")
            else:
                die(f"{key} is not set and a role has no fallback. Set the variable or add a fallback_model.", 3)
    if (any(provider_of(cfg, r) == "claude" for r in chain) and d.get("claude_login", "inherit") != "inherit"
            and not any(os.environ.get(n) for n in claude_auth_names(cfg))):
        print(f"WARNING: none of {', '.join(claude_auth_names(cfg))} is set; Claude workers run with a clean HOME and may "
              "fail to authenticate (set one, or set [defaults] claude_login = \"inherit\").", file=sys.stderr)

    out = Path(a.out) if a.out else task_path.with_suffix(".result.md")
    report = out.with_name(re.sub(r"\.result$", "", out.stem) + ".report.md")
    skip_rel = []
    for p in (task_path, out, report, HERE / "tasks", limits.path, limits.path.with_name(limits.path.name + ".tmp")):
        try:
            rel = Path(p).resolve().relative_to(workdir).as_posix()
            skip_rel.append(rel + "/" if Path(p).is_dir() else rel)
        except ValueError:
            pass
    before = snapshot(workdir, skip_rel)

    attempts, prev, failed_models = [], "", set()

    def attempt(r, body_r, fallback=None):
        print(f"-> attempt with {r}{f' ({fallback})' if fallback else ''} ...", flush=True)
        called = (split_model(fallback)[0] or "claude") if fallback else provider_of(cfg, r)
        limits.note_call(called)  # may raise CallLimitReached
        res = run_attempt(r, cfg, body_r, meta, workdir, fallback)
        attempts.append(res)
        print(f"   {'OK' if res['ok'] else 'FAILED'} ({res['seconds']}s, rc={res['rc']})"
              + (f" - cause: {res['cause']}" if not res["ok"] and res["cause"] else ""))
        if not res["ok"]:
            failed_models.add(res["model"])
        return res

    def claude_attempt(r, body_r, fallback=None, more=False):
        """One Claude attempt under the limits; None = skipped because Claude is locked."""
        if limits.is_locked("claude") or not limits.wait_for_slot("claude"):
            print(f"-> {r}: Claude is locked for this run ({limits.locks['claude']}), skipped.")
            return None
        res = attempt(r, body_r, fallback)
        if res["ok"]:
            limits.success("claude")
        elif not res["login"] and not res["verify"] and INFRA_ERROR.search(f"{res['result']}\n{res['stderr']}"):
            pause = limits.failure("claude", res["cause"])
            if pause is not None:
                if more:
                    print(f"   claude unusable, next attempt in {pause:g}s", flush=True)
                    limits.sleep(pause)
                    failed_models.discard(res["model"])  # paused to retry: a later fallback may use it again
                else:
                    limits.drop_last_pause()
        elif not res["login"]:
            limits.success("claude")  # the provider answered (e.g. verify red)
        return res

    call_limit = None
    claude_login_failed = False
    try:
        for idx, r in enumerate(chain):
            prov = provider_of(cfg, r)
            more = any(provider_of(cfg, x) == "claude" or fallback_of(cfg, x) for x in chain[idx + 1:])
            if claude_login_failed and prov == "claude":
                print(f"-> {r}: Claude workers cannot log in, skipped.")
                continue
            body_r = body if not prev else (body + "\n\n=== NOTE ===\nAn earlier attempt failed. Check the current repo state "
                                            "and finish the task. Last message of the earlier attempt:\n" + prev)
            res, need_fallback = None, False
            if prov == "claude":
                res = claude_attempt(r, body_r, more=more)
                if res is None:
                    continue
            else:
                need_fallback = True
                if prov not in down and not limits.is_locked(prov):
                    while limits.wait_for_slot(prov):
                        res = attempt(r, body_r)
                        if res["ok"]:
                            limits.success(prov)
                            need_fallback = False
                            break
                        if not res["infra"]:  # e.g. verify red: not the provider's fault, no retry
                            limits.success(prov)
                            need_fallback = False
                            break
                        if res["rc"] == 124:  # timeout: no retry, go to the fallback
                            limits.lock(prov, f"{res['cause']}; not retried, fallback instead")
                            break
                        pause = limits.failure(prov, res["cause"])
                        if pause is None:
                            break
                        print(f"   {prov} unusable, retry in {pause:g}s", flush=True)
                        limits.sleep(pause)
            if need_fallback:
                fb = fallback_of(cfg, r)
                if not fb:
                    print(f"-> {r}: {prov} is {'down' if prov in down else 'locked'} and has no fallback model, skipped.")
                elif fb in failed_models or claude_login_failed:
                    print(f"-> {r}: fallback {fb} {'cannot log in' if claude_login_failed else 'already failed'}, skipped.")
                else:
                    print(f"   provider {prov} unusable -> fallback {fb}", flush=True)
                    res = claude_attempt(r, body_r, fb, more=more) or res
            if res is None:
                continue
            if res.get("login"):
                claude_login_failed = True
            if res["ok"]:
                break
            prev = (res["verify"] or res["result"] or res["stderr"])[-1500:]
    except CallLimitReached:
        call_limit = f"call limit reached ({limits.calls} calls)"

    ok = bool(attempts) and attempts[-1]["ok"] and not call_limit
    changes = diff_snapshots(before, snapshot(workdir, skip_rel))
    readonly_run = bool(cfg["roles"][role].get("readonly"))
    findings = []
    if readonly_run and changes:
        findings += [f"readonly role '{role}' changed files: {p} ({k})" for p, k in changes]
    else:
        findings += [f"changed outside scope: {p} ({k})" for p, k in scope_findings(changes, globs)]

    status = "DONE" if ok else (f"FAILED - {call_limit}" if call_limit else "FAILED - the session takes over")
    lines = [f"# Result: {task_path.name}", "", f"Status: **{status}**", ""]
    if findings:
        lines += ["## Findings", ""] + [f"- {f}" for f in findings] + [""]
    limit_lines = ["## Limits and locks", "", f"Calls: {limits.calls} of {limits.max_calls}",
                   *[f"- {pv}: locked for this run: {why}" for pv, why in limits.locks.items()],
                   *[f"- {pv}: paused {sec:g}s before retry" for pv, sec in limits.pauses], ""]
    lines += limit_lines
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
    rep = [f"# Full worker report: {task_path.name}", ""] + limit_lines
    for i, x in enumerate(attempts, 1):
        rep += [f"## Attempt {i}: {x['role']} ({x['model']})", "", x["result"] or "(empty)", ""]
    report.write_text("\n".join(rep))
    print(f"result: {out}\nreport: {report}")
    for f in findings:
        print(f"FINDING: {f}", file=sys.stderr)
    if call_limit:
        print(f"ERROR: {call_limit}; no more attempts (max_calls_per_run={limits.max_calls}).", file=sys.stderr)
        return 1
    if not ok and claude_login_failed:
        print("Claude workers are not logged in -> hand this task file to a subagent of the session "
              "(model per role), see foreman-delegation, exit code 5.", file=sys.stderr)
        return 5
    if not ok:
        print("All steps failed -> the session takes over the task.", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

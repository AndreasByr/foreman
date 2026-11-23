#!/usr/bin/env python3
"""Plain tests, no pytest: python3 test_run_task.py"""
import importlib.util, os, subprocess, sys, tempfile, time, traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("run_task", HERE / "run_task.py")
rt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rt)

CONFIG = """
[defaults]
timeout_seconds = 60
base_url = "https://ollama.example"
api_key_env = "TEST_OLLAMA_KEY"
fallback_model = "claude/small-x"
[roles.execution_simple]
who = "worker"
provider = "ollama"
model = "ollama/cheap-y"
[roles.execution]
who = "worker"
model = "claude/mid-z"
[roles.research]
who = "worker"
model = "claude/small-x"
readonly = true
[roles.discuss]
who = "session"
model = "session"
[escalation]
execution_simple = ["execution"]
[claude]
allowed_tools = ["Read"]
"""


def _base_env():
    """Outer environment without the gateway variables, so tests do not depend on the outer shell."""
    env = dict(os.environ)
    for k in ("ANTHROPIC_BASE_URL", "FOREMAN_GATEWAY_URL"):
        env.pop(k, None)
    return env


def run(args, tmp):
    return subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True, cwd=tmp,
                          env=_base_env())


def setup(tmp, task):
    (tmp / "config.toml").write_text(CONFIG)
    (tmp / "t.md").write_text(task)
    return ["t.md", "--config", "config.toml"]


def test_missing_role():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = run(setup(t, "do something\n"), t)
        assert p.returncode == 2, p
        assert "no role" in p.stderr


def test_unknown_role():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = run(setup(t, "---\nrole: nope\n---\nx\n"), t)
        assert p.returncode == 2 and "not in" in p.stderr, p
        p = run(setup(t, "---\nrole: discuss\n---\nx\n"), t)
        assert p.returncode == 2 and "session" in p.stderr, p


def test_dry_run():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        args = setup(t, "---\nrole: execution_simple\nverify: true\nfiles: [src/**, a.txt]\n---\nx\n")
        p = run([*args, "--dry-run"], t)
        assert p.returncode == 0, p
        assert "role: execution_simple" in p.stdout
        assert "provider: ollama" in p.stdout and "model: cheap-y" in p.stdout
        assert "plan: execution_simple -> execution -> session" in p.stdout
        assert "fallback=claude/small-x" in p.stdout and "scope: src/**, a.txt" in p.stdout
        p = run([*args, "--role", "research", "--dry-run"], t)
        assert "provider: claude" in p.stdout and "model: small-x" in p.stdout and "readonly" in p.stdout
        # placeholder models are rejected
        (t / "config.toml").write_text(CONFIG.replace("mid-z", "<mid-model-id>"))
        p = run([*args, "--dry-run"], t)
        assert p.returncode == 2 and "placeholder" in p.stderr, p
        # the shipped config must be valid TOML and be rejected only for placeholders
        p = run([*args, "--config", str(HERE / "config.toml"), "--dry-run"], t)
        assert p.returncode == 2 and "placeholder" in p.stderr, p


GATEWAY_CONFIG = """
[defaults]
timeout_seconds = 60
[gateway]
base_url = "https://gw.example"
api_key_env = "TEST_GATEWAY_KEY"
fallback_model = "claude/small-x"
[roles.execution_simple]
who = "worker"
provider = "gateway"
model = "gateway/task-simple"
[roles.execution]
who = "worker"
model = "claude/mid-z"
[escalation]
execution_simple = ["execution"]
"""


def test_gateway_provider():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / "config.toml").write_text(GATEWAY_CONFIG)
        (t / "t.md").write_text("---\nrole: execution_simple\n---\nx\n")
        p = run(["t.md", "--config", "config.toml", "--dry-run"], t)
        assert p.returncode == 0, p
        assert "provider: gateway" in p.stdout and "model: task-simple" in p.stdout, p.stdout
        assert "fallback=claude/small-x" in p.stdout and "api key TEST_GATEWAY_KEY (gateway): missing" in p.stdout, p.stdout
        # missing base_url is a config error
        (t / "config.toml").write_text(GATEWAY_CONFIG.replace('base_url = "https://gw.example"\n', ""))
        p = run(["t.md", "--config", "config.toml", "--dry-run"], t)
        assert p.returncode == 2 and "[gateway] base_url is missing" in p.stderr, p
    cfg = rt.tomllib.loads(GATEWAY_CONFIG)
    cfg.setdefault("env", {}); cfg.setdefault("mcp", {}); cfg.setdefault("claude", {})
    assert rt.fallback_of(cfg, "execution_simple") == "claude/small-x"
    assert rt.fallback_of(cfg, "execution") is None
    os.environ["TEST_GATEWAY_KEY"] = "gw-virtual-key-1234567890"
    assert "gw-virtual-key-1234567890" in rt.secret_values(cfg)
    del os.environ["TEST_GATEWAY_KEY"]


def test_masking():
    s = "key=abc123SECRETxyz and again abc123SECRETxyz; Authorization: Bearer tok_ABCDEFGH12345678 sk-abcdefghijklmnop1234"
    out = rt.mask_secrets(s, ["abc123SECRETxyz"])
    assert "abc123SECRETxyz" not in out and "ABCDEFGH12345678" not in out and "sk-abcdefghijklmnop1234" not in out, out
    assert rt.mask_secrets("plain text", ["zzz"]) == "plain text"
    assert rt.mask_secrets("", ["x"]) == ""


def test_scope_check():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        for f in ("src/a.js", "src/sub/b.js", "docs/c.md", "keep.txt", "gone.txt"):
            (t / f).parent.mkdir(parents=True, exist_ok=True)
            (t / f).write_text("v1")
        before = rt.snapshot(t)
        (t / "src/a.js").write_text("v2")          # modified, in scope
        (t / "docs/c.md").write_text("v2")         # modified, out of scope
        (t / "new.txt").write_text("n")            # added, out of scope
        (t / "src/sub/new.js").write_text("n")     # added, in scope (**)
        (t / "gone.txt").unlink()                  # deleted, out of scope
        (t / "keep.txt").write_text("v1")          # rewritten with same content: not a change
        changes = rt.diff_snapshots(before, rt.snapshot(t))
        assert dict(changes) == {"src/a.js": "modified", "docs/c.md": "modified", "new.txt": "added",
                                 "src/sub/new.js": "added", "gone.txt": "deleted"}, changes
        out = rt.scope_findings(changes, ["src/**"])
        assert dict(out) == {"docs/c.md": "modified", "new.txt": "added", "gone.txt": "deleted"}, out
        assert rt.scope_findings(changes, []) == []
        assert rt.scope_findings([("docs/x.md", "added")], ["docs/"]) == []
        meta, _ = rt.parse_task("---\nrole: r\nfiles:\n  - src/**\n  - 'a b.txt'\n---\nbody")
        assert meta["files"] == ["src/**", "a b.txt"], meta


def _fake_claude(tmp, script):
    b = tmp / "bin"; b.mkdir(exist_ok=True)
    f = b / "claude"; f.write_text("#!/bin/sh\n" + script); f.chmod(0o755)
    env = _base_env()
    env["PATH"] = f"{b}:{env['PATH']}"
    return env


def test_claude_worker_not_logged_in_exit_5():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        args = setup(t, "---\nrole: execution\n---\nx\n")
        env = _fake_claude(t, 'echo "count" >> "$(dirname "$0")/calls"; echo "Not logged in · Please run /login" >&2; exit 1\n')
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 5, (p.returncode, p.stdout, p.stderr)
        assert "subagent" in p.stderr, p.stderr
        assert (t / "bin" / "calls").read_text().count("count") == 1, "no second Claude attempt after a login failure"
        assert "not logged in" in (t / "t.result.md").read_text().lower()


def test_claude_worker_inherits_login_without_foreign_keys():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        args = setup(t, "---\nrole: research\n---\nx\n")
        env = _fake_claude(t, 'env > "$(dirname "$0")/env.txt"; echo \'{"result":"ok","is_error":false}\'\n')
        env.update({"HOME": "/home/session-user", "ANTHROPIC_API_KEY": "sk-should-not-pass-1234567890",
                    "TEST_OLLAMA_KEY": "ollama-should-not-pass", "ITSAPLAN_API_KEY": "tracker-should-not-pass",
                    "CLAUDE_SESSION_MARKER": "keep-me"})
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0, (p.stdout, p.stderr)
        seen = (t / "bin" / "env.txt").read_text()
        assert "HOME=/home/session-user" in seen and "CLAUDE_SESSION_MARKER=keep-me" in seen, "session login must be inherited"
        for bad in ("sk-should-not-pass", "ollama-should-not-pass", "tracker-should-not-pass"):
            assert bad not in seen, bad


def test_gateway_names_not_in_claude_worker_env():
    markers = {"FOREMAN_GATEWAY_KEY": "fgw-marker-key-111", "FOREMAN_GATEWAY_URL": "https://fgw-marker.example",
               "LLM_GATEWAY_KEY": "llm-marker-key-222", "LLM_GATEWAY_URL": "https://llm-marker.example"}
    for login in (None, "isolated"):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            cfg = CONFIG if login is None else CONFIG.replace("timeout_seconds = 60\n",
                                                              f'timeout_seconds = 60\nclaude_login = "{login}"\n', 1)
            (t / "config.toml").write_text(cfg)
            (t / "t.md").write_text("---\nrole: research\n---\nx\n")
            args = ["t.md", "--config", "config.toml"]
            env = _fake_claude(t, 'env > "$(dirname "$0")/env.txt"; echo \'{"result":"ok","is_error":false}\'\n')
            env.update(markers)
            env["CLAUDE_SESSION_MARKER"] = "keep-me"
            p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True, cwd=t, env=env)
            assert p.returncode == 0, (login, p.stdout, p.stderr)
            seen = (t / "bin" / "env.txt").read_text()
            if login is None:  # inherited login: unrelated variables pass through; "isolated" uses an allow-list
                assert "CLAUDE_SESSION_MARKER=keep-me" in seen, (login, "unrelated variable must still pass")
            for name, value in markers.items():
                assert value not in seen, (login, name)


def test_gateway_base_url_from_env():
    cfg_no_url = GATEWAY_CONFIG.replace('base_url = "https://gw.example"\n', "")
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / "t.md").write_text("---\nrole: execution_simple\n---\nx\n")
        dry = ["t.md", "--config", "config.toml", "--dry-run"]
        (t / "config.toml").write_text(cfg_no_url)
        # (a) variable supplies the gateway URL
        env = {**_base_env(), "FOREMAN_GATEWAY_URL": "https://gw.example"}
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0 and "provider: gateway" in p.stdout, p
        # (b) no variable, no base_url: config error
        env = _base_env()
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 2 and "[gateway] base_url" in p.stderr, p
        # config base_url wins over the variable
        (t / "config.toml").write_text(GATEWAY_CONFIG.replace("https://gw.example", "https://from-config.example"))
        env = {**_base_env(), "FOREMAN_GATEWAY_URL": "https://from-env.example"}
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0, p


def test_gateway_base_url_env_name():
    """[gateway] base_url_env names the variable that holds the URL (instead of FOREMAN_GATEWAY_URL)."""
    cfg = rt.tomllib.loads(GATEWAY_CONFIG.replace('base_url = "https://gw.example"\n', 'base_url_env = "MY_GW_URL"\n'))
    old = {k: os.environ.get(k) for k in ("MY_GW_URL", "FOREMAN_GATEWAY_URL")}
    try:
        os.environ["MY_GW_URL"] = "https://named.example"
        os.environ["FOREMAN_GATEWAY_URL"] = "https://default.example"
        assert rt.endpoint_cfg(cfg, "gateway")["base_url"] == "https://named.example"
        del os.environ["MY_GW_URL"]
        assert rt.endpoint_cfg(cfg, "gateway")["base_url"] == ""
    finally:
        for k, v in old.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)


def test_gateway_key_default_name():
    cfg = rt.tomllib.loads(GATEWAY_CONFIG.replace('api_key_env = "TEST_GATEWAY_KEY"\n', ""))
    assert rt.endpoint_cfg(cfg, "gateway")["api_key_env"] == "FOREMAN_GATEWAY_KEY"


def test_config_rejects_api_key_and_bad_login_mode():
    cfg = rt.tomllib.loads(CONFIG)
    cfg.setdefault("env", {}); cfg.setdefault("mcp", {}); cfg.setdefault("claude", {})
    cfg["defaults"]["claude_auth_env"] = ["ANTHROPIC_API_KEY"]
    cfg["defaults"]["claude_login"] = "sometimes"
    errs = " ".join(rt.validate_config(cfg))
    assert "ANTHROPIC_API_KEY" in errs and "claude_login" in errs, errs


# ---------------------------------------------------------------- limits

def _limits_cfg(limits_toml="", base=CONFIG):
    cfg = rt.tomllib.loads(base + "\n" + limits_toml)
    cfg.setdefault("env", {}); cfg.setdefault("mcp", {}); cfg.setdefault("claude", {})
    return cfg


class _Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def _limits_obj(limits_toml, ledger, clock):
    return rt.RunLimits(_limits_cfg(limits_toml), Path(ledger), now=clock.now, sleep=clock.sleep)


def _limits_errs(limits_toml):
    return rt.validate_config(_limits_cfg(limits_toml))


def test_limits_config_validation():
    assert _limits_errs("") == [], _limits_errs("")
    ok = ("[limits]\nmax_calls_per_run = 5\nledger_file = \"x/.limits.json\"\n[limits.gateway]\nrequests_per_minute = 20\n"
          "requests_per_hour = 300\npause_seconds = 5\nmax_pause_seconds = 60\n")
    assert _limits_errs(ok) == [], _limits_errs(ok)
    bad = {
        "non-table limits": None,
        "unknown provider": "[limits]\n[limits.foo]\nrequests_per_minute = 1\n",
        "unknown key": "[limits]\nmax_calls = 3\n",
        "unknown provider key": "[limits.gateway]\nrequests_per_day = 3\n",
        "string value": "[limits.gateway]\nrequests_per_minute = \"20\"\n",
        "bool value": "[limits]\nmax_calls_per_run = true\n",
        "zero": "[limits]\nmax_calls_per_run = 0\n",
        "negative": "[limits.gateway]\nrequests_per_hour = -3\n",
        "zero pause": "[limits.gateway]\npause_seconds = 0\n",
        "pause > max": "[limits.gateway]\npause_seconds = 10\nmax_pause_seconds = 5\n",
    }
    for label, toml in bad.items():
        if toml is None:
            cfg = _limits_cfg(); cfg["limits"] = 5
            errs = rt.validate_config(cfg)
        else:
            errs = _limits_errs(toml)
        assert errs and "limits" in " ".join(errs), (label, errs)


def test_limits_pause_grows_and_is_capped():
    with tempfile.TemporaryDirectory() as t:
        c = _Clock()
        lim = _limits_obj("[limits.gateway]\npause_seconds = 2\nmax_pause_seconds = 5\n", Path(t) / "l.json", c)
        got = [lim.failure("gateway", "429"), lim.failure("gateway", "429"), lim.failure("gateway", "429")]
        assert got == [2.0, 4.0, None], got
        assert lim.pauses == [("gateway", 2.0), ("gateway", 4.0)], lim.pauses
        assert c.slept == [], "failure() must not sleep itself"
        c = _Clock()
        lim = _limits_obj("[limits.gateway]\npause_seconds = 3\nmax_pause_seconds = 5\n", Path(t) / "l2.json", c)
        got = [lim.failure("gateway", "x"), lim.failure("gateway", "x"), lim.failure("gateway", "x")]
        assert got == [3.0, 5.0, None], got
        assert [s for _, s in lim.pauses] == [3.0, 5.0], lim.pauses


def test_limits_lock_after_three_and_success_resets():
    with tempfile.TemporaryDirectory() as t:
        ledger = Path(t) / "l.json"
        lim = _limits_obj("", ledger, _Clock())
        lim.failure("gateway", "a"); lim.failure("gateway", "b")
        lim.success("gateway")
        lim.failure("gateway", "c"); lim.failure("gateway", "d")
        assert not lim.is_locked("gateway") and not lim.locks, lim.locks
        assert lim.failure("gateway", "boom-cause") is None
        assert lim.is_locked("gateway") and list(lim.locks) == ["gateway"], lim.locks
        reason = lim.locks["gateway"]
        assert "3 failures in a row" in reason and "boom-cause" in reason, reason
        assert not lim.is_locked("ollama")
        assert lim.failure("ollama", "x") is not None and not lim.is_locked("ollama")
        assert not ledger.exists() or "boom-cause" not in ledger.read_text(), "locks never live in the ledger"


def test_limits_minute_window():
    import json
    with tempfile.TemporaryDirectory() as t:
        ledger = Path(t) / "l.json"
        c = _Clock()
        ledger.write_text(json.dumps({"gateway": [c.t - 10, c.t - 10], "ollama": [c.t - 1] * 5}))
        lim = _limits_obj("[limits.gateway]\nrequests_per_minute = 2\nmax_pause_seconds = 60\n"
                          "[limits.ollama]\nrequests_per_minute = 100\n", ledger, c)
        assert lim.wait_for_slot("gateway") is True
        assert len(c.slept) == 1 and 49 <= c.slept[0] <= 51, c.slept
        assert lim.pauses and lim.pauses[0][0] == "gateway", lim.pauses
        assert lim.wait_for_slot("ollama") is True, "a provider's ledger must not count against another"
        c = _Clock()
        ledger.write_text(json.dumps({"gateway": [c.t - 10, c.t - 10]}))
        lim = _limits_obj("[limits.gateway]\nrequests_per_minute = 2\nmax_pause_seconds = 5\n", ledger, c)
        assert lim.wait_for_slot("gateway") is False
        assert c.slept == [] and lim.is_locked("gateway")
        assert "per-minute limit" in lim.locks["gateway"], lim.locks
        assert lim.wait_for_slot("gateway") is False and c.slept == [], "locked provider: no sleep"


def test_limits_hour_window():
    import json
    with tempfile.TemporaryDirectory() as t:
        ledger = Path(t) / "l.json"
        c = _Clock()
        ledger.write_text(json.dumps({"gateway": [c.t - 1800] * 3}))
        lim = _limits_obj("[limits.gateway]\nrequests_per_hour = 3\nmax_pause_seconds = 60\n", ledger, c)
        assert lim.wait_for_slot("gateway") is False
        assert c.slept == [] and "per-hour limit" in lim.locks["gateway"], (c.slept, lim.locks)
        # calls older than an hour are ignored
        ledger.write_text(json.dumps({"gateway": [c.t - 4000, c.t - 3700, c.t - 3601]}))
        lim = _limits_obj("[limits.gateway]\nrequests_per_hour = 3\n", ledger, c)
        assert lim.wait_for_slot("gateway") is True and not lim.locks and c.slept == []
        lim.note_call("gateway")
        data = json.loads(ledger.read_text())
        assert data["gateway"] == [c.t], data


def test_limits_call_cap():
    import json
    with tempfile.TemporaryDirectory() as t:
        ledger = Path(t) / "l.json"
        c = _Clock()
        lim = _limits_obj("[limits]\nmax_calls_per_run = 2\n", ledger, c)
        lim.note_call("claude"); c.t += 1
        lim.note_call("claude"); c.t += 1
        assert lim.calls == 2
        try:
            lim.note_call("claude")
        except rt.CallLimitReached:
            pass
        else:
            raise AssertionError("third call must raise CallLimitReached")
        stamps = json.loads(ledger.read_text())["claude"]
        assert stamps == [1_000_000.0, 1_000_001.0], stamps


def _gw_script(claude_fails=False):
    claude_path = ('echo x >> "$d/claude_calls"; echo "boom: plain error" >&2; exit 1\n' if claude_fails else
                   'echo x >> "$d/claude_calls"; echo \'{"result":"ok","is_error":false}\'\n')
    return ('d="$(dirname "$0")"\n'
            'if [ -n "$ANTHROPIC_BASE_URL" ]; then echo x >> "$d/gw_calls"; echo "429 Too Many Requests" >&2; exit 1; fi\n'
            + claude_path)


def _lines(path):
    return len(path.read_text().splitlines()) if path.exists() else 0


def _gw_run(t, cfg_text, script, task="---\nrole: execution_simple\n---\nx\n", extra=None):
    (t / "config.toml").write_text(cfg_text)
    (t / "t.md").write_text(task)
    env = _fake_claude(t, script)
    env.pop("ANTHROPIC_BASE_URL", None)  # the wrapper sets it for gateway attempts only
    env["TEST_GATEWAY_KEY"] = "gw-virtual-key-1234567890"
    return subprocess.run([sys.executable, str(HERE / "run_task.py"), "t.md", "--config", "config.toml", *(extra or [])],
                          capture_output=True, text=True, cwd=t, env=env)


def _gw_limits(t, extra=""):
    return (f'\n[limits]\nledger_file = "{t}/ledger.json"\n{extra}'
            '[limits.gateway]\npause_seconds = 0.01\nmax_pause_seconds = 0.05\n')


def test_limits_gateway_429_retries_then_fallback():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = _gw_run(t, GATEWAY_CONFIG + _gw_limits(t), _gw_script())
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert _lines(t / "bin" / "gw_calls") == 3, _lines(t / "bin" / "gw_calls")
        assert _lines(t / "bin" / "claude_calls") == 1
        res = (t / "t.result.md").read_text()
        assert "## Limits and locks" in res, res
        assert any("gateway: locked for this run" in l and "3 failures in a row" in l for l in res.splitlines()), res


def test_limits_lock_skips_gateway_for_later_roles():
    cfg = GATEWAY_CONFIG.replace('[roles.execution]\nwho = "worker"\nmodel = "claude/mid-z"\n',
                                 '[roles.execution]\nwho = "worker"\nprovider = "gateway"\nmodel = "gateway/task-normal"\n')
    assert "task-normal" in cfg
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = _gw_run(t, cfg + _gw_limits(t), _gw_script(claude_fails=True))
        assert _lines(t / "bin" / "gw_calls") == 3, (_lines(t / "bin" / "gw_calls"), p.stdout, p.stderr)
        assert _lines(t / "bin" / "claude_calls") >= 1, (p.stdout, p.stderr)
        assert "already failed, skipped" in p.stdout + p.stderr, (p.stdout, p.stderr)


def test_limits_no_fallback_skips_to_next_role():
    cfg = GATEWAY_CONFIG.replace('fallback_model = "claude/small-x"\n', "")
    assert "fallback_model" not in cfg
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = _gw_run(t, cfg + _gw_limits(t), _gw_script())
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert _lines(t / "bin" / "gw_calls") == 3
        assert _lines(t / "bin" / "claude_calls") == 1
        assert "## Limits and locks" in (t / "t.result.md").read_text()


def test_limits_call_cap_stops_run_with_report():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        p = _gw_run(t, GATEWAY_CONFIG + _gw_limits(t, "max_calls_per_run = 2\n"), _gw_script())
        assert p.returncode == 1, (p.returncode, p.stdout, p.stderr)
        total = _lines(t / "bin" / "gw_calls") + _lines(t / "bin" / "claude_calls")
        assert total == 2, total
        assert "call limit reached" in (t / "t.result.md").read_text()
        assert "call limit reached" in p.stderr, p.stderr


def test_limits_lock_is_per_run():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = GATEWAY_CONFIG + _gw_limits(t)
        for _ in range(2):
            for f in ("gw_calls", "claude_calls"):
                (t / "bin" / f).unlink(missing_ok=True)
            p = _gw_run(t, cfg, _gw_script())
            assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
            assert _lines(t / "bin" / "gw_calls") == 3, "every run starts with an unlocked provider"
            assert _lines(t / "bin" / "claude_calls") == 1


def test_limits_ledger_across_runs_minute_limit():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = CONFIG + f'\n[limits]\nledger_file = "{t}/ledger.json"\n[limits.claude]\nrequests_per_minute = 1\nmax_pause_seconds = 1\n'
        script = 'echo x >> "$(dirname "$0")/calls"; echo \'{"result":"ok","is_error":false}\'\n'
        task = "---\nrole: research\n---\nx\n"
        p = _gw_run(t, cfg, script, task=task)
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert _lines(t / "bin" / "calls") == 1
        p = _gw_run(t, cfg, script, task=task)
        assert p.returncode == 1, (p.returncode, p.stdout, p.stderr)
        assert _lines(t / "bin" / "calls") == 1, "second run must not call claude"
        assert "per-minute limit" in (t / "t.result.md").read_text()


def test_limits_ledger_not_a_scope_finding():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        script = 'echo \'{"result":"ok","is_error":false}\'\n'
        p = _gw_run(t, CONFIG, script, task="---\nrole: research\n---\nx\n", extra=["--workdir", str(t)])
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert (t / "tasks" / ".limits.json").exists(), "default ledger lives next to the config file"
        assert "## Findings" not in (t / "t.result.md").read_text()


# ---------------------------------------------------------------- timeout

def _timeout_cfg(role_value=None, defaults_value=None):
    cfg = rt.tomllib.loads(CONFIG)
    for k in ("env", "mcp", "claude", "gateway", "limits"):
        cfg.setdefault(k, {})
    if role_value is not None:
        cfg["roles"]["research"]["timeout"] = role_value
    if defaults_value is not None:
        cfg["defaults"]["timeout_seconds"] = defaults_value
    return cfg


def _timeout_run(t, cfg_text, script, extra=()):
    (t / "config.toml").write_text(cfg_text)
    (t / "t.md").write_text("---\nrole: research\n---\nx\n")
    env = _fake_claude(t, script)
    env.pop("ANTHROPIC_BASE_URL", None)  # cloud sessions set it; the wrapper must not depend on it
    return subprocess.run([sys.executable, str(HERE / "run_task.py"), "t.md", "--config", "config.toml", *extra],
                          capture_output=True, text=True, cwd=t, env=env)


def test_timeout_config_validation():
    def timeout_errs(cfg):
        return [e for e in rt.validate_config(cfg) if "timeout" in e]
    for bad in (0, -3, "10", True):
        errs = timeout_errs(_timeout_cfg(role_value=bad))
        assert errs, ("role timeout must be rejected", bad)
    for bad in (0, -1, "10", True):
        errs = timeout_errs(_timeout_cfg(defaults_value=bad))
        assert errs, ("[defaults] timeout_seconds must be rejected", bad)
    for good in (5, 0.5):
        assert timeout_errs(_timeout_cfg(role_value=good)) == [], ("role timeout valid", good)
        assert timeout_errs(_timeout_cfg(defaults_value=good)) == [], ("defaults timeout valid", good)


def test_timeout_cli_rejects_zero():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = CONFIG.replace("readonly = true\n", "readonly = true\ntimeout = 0\n", 1)
        p = _timeout_run(t, cfg, "exit 0\n", extra=["--dry-run"])
        assert p.returncode == 2, (p.returncode, p.stdout, p.stderr)
        assert "timeout" in p.stderr, p.stderr


def test_timeout_role_value_aborts_attempt():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = CONFIG.replace("readonly = true\n", "readonly = true\ntimeout = 1\n", 1)
        t0 = time.monotonic()
        p = _timeout_run(t, cfg, "sleep 5\n")
        elapsed = time.monotonic() - t0
        assert elapsed < 4, (elapsed, p.stdout, p.stderr)
        assert p.returncode == 1, (p.returncode, p.stdout, p.stderr)
        assert "timeout after 1s" in (t / "t.result.md").read_text()


def test_timeout_global_default_applies():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = CONFIG.replace("timeout_seconds = 60\n", "timeout_seconds = 1\n", 1)
        t0 = time.monotonic()
        p = _timeout_run(t, cfg, "sleep 5\n")
        elapsed = time.monotonic() - t0
        assert elapsed < 4, (elapsed, p.stdout, p.stderr)
        assert p.returncode == 1, (p.returncode, p.stdout, p.stderr)
        assert "timeout after 1s" in (t / "t.result.md").read_text()


def test_timeout_role_overrides_global():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = CONFIG.replace("timeout_seconds = 60\n", "timeout_seconds = 1\n", 1)
        cfg = cfg.replace("readonly = true\n", "readonly = true\ntimeout = 30\n", 1)
        script = "sleep 2\necho '{\"result\":\"ok\",\"is_error\":false}'\n"
        p = _timeout_run(t, cfg, script)
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert "timeout after" not in (t / "t.result.md").read_text()


def test_chatgpt_target_needs_consent():
    def chatgpt_errs(cfg):
        return [e for e in rt.validate_config(cfg) if "chatgpt" in e]

    def consent_error(errs):
        return any("chatgpt" in e and "accepted-risk" in e for e in errs)

    def cfg_with(role_model=None, fallback=None, consent=None):
        cfg = rt.tomllib.loads(GATEWAY_CONFIG)
        for k in ("env", "mcp", "claude", "limits"):
            cfg.setdefault(k, {})
        if role_model is not None:
            cfg["roles"]["execution"]["model"] = role_model
        if fallback is not None:
            cfg["gateway"]["fallback_model"] = fallback
        if consent is not None:
            cfg["gateway"]["chatgpt_via_gateway"] = consent
        return cfg

    assert consent_error(rt.validate_config(cfg_with(role_model="chatgpt/codex-x"))), "role model chatgpt/ needs consent"
    assert consent_error(rt.validate_config(cfg_with(fallback="chatgpt/codex-x"))), "fallback_model chatgpt/ needs consent"
    assert chatgpt_errs(cfg_with(role_model="chatgpt/codex-x", consent="accepted-risk")) == [], "accepted-risk allows chatgpt/"
    assert chatgpt_errs(cfg_with(fallback="chatgpt/codex-x", consent="accepted-risk")) == [], "accepted-risk allows fallback"
    assert consent_error(rt.validate_config(cfg_with(role_model="chatgpt/codex-x", consent="yes"))), "only accepted-risk is valid"

    shipped = rt.tomllib.loads((HERE / "config.toml").read_text())
    for name, role in shipped.get("roles", {}).items():
        assert "chatgpt/" not in str(role.get("model", "")), (name, role)
        assert "chatgpt/" not in str(role.get("fallback_model", "")), (name, role)
    for table in ("defaults", "gateway"):
        assert "chatgpt/" not in str(shipped.get(table, {}).get("fallback_model", "")), table


# ---------------------------------------------------------------- review rework

def _claude_only_cfg(t, limits_extra="pause_seconds = 0.2\nmax_pause_seconds = 1\n"):
    return ('[defaults]\ntimeout_seconds = 60\n'
            '[roles.execution_simple]\nwho = "worker"\nmodel = "claude/small-x"\n'
            '[roles.execution]\nwho = "worker"\nmodel = "claude/mid-z"\n'
            '[roles.completion]\nwho = "worker"\nmodel = "claude/small-x"\n'
            '[escalation]\nexecution_simple = ["execution", "completion"]\n'
            f'[limits]\nledger_file = "{t}/ledger.json"\n[limits.claude]\n{limits_extra}')


def test_limits_claude_failure_sleeps_and_locks():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        script = 'echo x >> "$(dirname "$0")/calls"; echo "429 Too Many Requests" >&2; exit 1\n'
        t0 = time.monotonic()
        p = _gw_run(t, _claude_only_cfg(t), script)
        elapsed = time.monotonic() - t0
        assert _lines(t / "bin" / "calls") == 3, (_lines(t / "bin" / "calls"), p.stdout, p.stderr)
        assert elapsed >= 0.5, elapsed
        assert p.returncode == 1, (p.returncode, p.stdout, p.stderr)
        lines = (t / "t.result.md").read_text().splitlines()
        assert any(l.startswith("- claude: locked for this run") for l in lines), lines
        assert "- claude: paused 0.2s before retry" in lines, lines
        assert "- claude: paused 0.4s before retry" in lines, lines
        paused = [l for l in lines if "paused" in l]
        assert len(paused) == 2, paused


def test_limits_gateway_pauses_really_slept_and_in_both_reports():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = (GATEWAY_CONFIG + f'\n[limits]\nledger_file = "{t}/ledger.json"\n'
               '[limits.gateway]\npause_seconds = 0.2\nmax_pause_seconds = 1\n')
        t0 = time.monotonic()
        p = _gw_run(t, cfg, _gw_script())
        elapsed = time.monotonic() - t0
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert elapsed >= 0.5, elapsed
        for name in ("t.result.md", "t.report.md"):
            text = (t / name).read_text()
            for needle in ("- gateway: locked for this run", "paused 0.2s before retry", "paused 0.4s before retry"):
                assert needle in text, (name, needle, text)


def test_limits_gateway_timeout_goes_straight_to_fallback():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = GATEWAY_CONFIG.replace('model = "gateway/task-simple"\n', 'model = "gateway/task-simple"\ntimeout = 1\n', 1)
        assert "timeout = 1" in cfg
        cfg += _gw_limits(t)
        script = ('d="$(dirname "$0")"\n'
                  'if [ -n "$ANTHROPIC_BASE_URL" ]; then echo x >> "$d/gw_calls"; sleep 5; exit 0; fi\n'
                  'echo x >> "$d/claude_calls"; echo \'{"result":"ok","is_error":false}\'\n')
        t0 = time.monotonic()
        p = _gw_run(t, cfg, script)
        elapsed = time.monotonic() - t0
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert _lines(t / "bin" / "gw_calls") == 1, (_lines(t / "bin" / "gw_calls"), p.stdout, p.stderr)
        assert _lines(t / "bin" / "claude_calls") == 1, (_lines(t / "bin" / "claude_calls"), p.stdout, p.stderr)
        assert elapsed < 4, elapsed


def test_limits_counter_resets_after_reached_provider():
    cfg = GATEWAY_CONFIG.replace('[roles.execution]\nwho = "worker"\nmodel = "claude/mid-z"\n',
                                 '[roles.execution]\nwho = "worker"\nprovider = "gateway"\nmodel = "gateway/task-normal"\n')
    assert "task-normal" in cfg
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        script = ('d="$(dirname "$0")"\n'
                  'if [ -n "$ANTHROPIC_BASE_URL" ]; then\n'
                  '  echo x >> "$d/gw_calls"; n=$(wc -l < "$d/gw_calls")\n'
                  '  if [ "$n" -eq 2 ]; then echo \'{"result":"ok","is_error":false}\'; exit 0; fi\n'
                  '  echo "429 Too Many Requests" >&2; exit 1\n'
                  'fi\n'
                  'echo x >> "$d/claude_calls"; echo \'{"result":"ok","is_error":false}\'\n')
        p = _gw_run(t, cfg + _gw_limits(t), script, task="---\nrole: execution_simple\nverify: false\n---\nx\n")
        assert _lines(t / "bin" / "gw_calls") == 5, (_lines(t / "bin" / "gw_calls"), p.returncode, p.stdout, p.stderr)


def test_config_fallback_must_be_claude():
    def fb_errs(cfg):
        return [e for e in rt.validate_config(cfg) if "fallback" in e]

    def cfg_with(gw=None, df=None):
        cfg = rt.tomllib.loads(GATEWAY_CONFIG)
        for k in ("env", "mcp", "claude", "limits"):
            cfg.setdefault(k, {})
        if gw is not None:
            cfg["gateway"]["fallback_model"] = gw
        if df is not None:
            cfg["defaults"]["fallback_model"] = df
        return cfg

    assert fb_errs(cfg_with(gw="gateway/task-simple")), "gateway fallback must be a Claude model"
    assert fb_errs(cfg_with(df="ollama/x")), "defaults fallback must be a Claude model"
    for good in ("claude/small-x", "small-x"):
        assert fb_errs(cfg_with(gw=good)) == [], good
        assert fb_errs(cfg_with(df=good)) == [], good


def test_chatgpt_consent_covers_prefixed_and_all_fallbacks():
    def chatgpt_errs(cfg):
        return [e for e in rt.validate_config(cfg) if "chatgpt" in e]

    def variants(consent):
        out = {}
        for model in ("gateway/chatgpt/x", "ollama/chatgpt/x"):
            cfg = rt.tomllib.loads(GATEWAY_CONFIG)
            cfg["roles"]["execution"]["model"] = model
            out["role model " + model] = cfg
        cfg = rt.tomllib.loads(GATEWAY_CONFIG)
        cfg["roles"]["execution_simple"]["fallback_model"] = "chatgpt/x"
        out["role fallback_model"] = cfg
        cfg = rt.tomllib.loads(GATEWAY_CONFIG)
        cfg["defaults"]["fallback_model"] = "chatgpt/x"
        out["defaults fallback_model"] = cfg
        cfg = rt.tomllib.loads(GATEWAY_CONFIG)
        cfg["gateway"]["fallback_model"] = "chatgpt/x"
        out["gateway fallback_model"] = cfg
        for cfg in out.values():
            for k in ("env", "mcp", "claude", "limits"):
                cfg.setdefault(k, {})
            if consent:
                cfg["gateway"]["chatgpt_via_gateway"] = consent
        return out

    for label, cfg in variants(None).items():
        errs = chatgpt_errs(cfg)
        assert any("accepted-risk" in e for e in errs), (label, errs)
    for label, cfg in variants("accepted-risk").items():
        assert chatgpt_errs(cfg) == [], (label, chatgpt_errs(cfg))


def test_gateway_key_under_custom_name_not_in_claude_env():
    cfg = GATEWAY_CONFIG.replace("TEST_GATEWAY_KEY", "MY_CUSTOM_GW_KEY")
    cfg += '[roles.research]\nwho = "worker"\nmodel = "claude/small-x"\nreadonly = true\n'
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / "config.toml").write_text(cfg)
        (t / "t.md").write_text("---\nrole: research\n---\nx\n")
        env = _fake_claude(t, 'env > "$(dirname "$0")/env.txt"; echo \'{"result":"ok","is_error":false}\'\n')
        env["MY_CUSTOM_GW_KEY"] = "custom-marker-123"
        env["CLAUDE_SESSION_MARKER"] = "keep-me"
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), "t.md", "--config", "config.toml"],
                           capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        seen = (t / "bin" / "env.txt").read_text()
        assert "custom-marker-123" not in seen, "gateway key leaked into the Claude worker env"
        assert "CLAUDE_SESSION_MARKER=keep-me" in seen, seen


def test_limits_missing_key_lock_in_both_reports():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / "config.toml").write_text(GATEWAY_CONFIG + f'\n[limits]\nledger_file = "{t}/ledger.json"\n')
        (t / "t.md").write_text("---\nrole: execution_simple\n---\nx\n")
        env = _fake_claude(t, _gw_script())
        env.pop("TEST_GATEWAY_KEY", None)
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), "t.md", "--config", "config.toml"],
                           capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        for name in ("t.result.md", "t.report.md"):
            text = (t / name).read_text()
            assert "- gateway: locked for this run: TEST_GATEWAY_KEY not set" in text, (name, text)


# ---------------------------------------------------------------- review rework, round 2

def test_limits_gateway_timeout_locks_provider_for_chain_and_reports_no_pause():
    cfg = GATEWAY_CONFIG.replace('[roles.execution]\nwho = "worker"\nmodel = "claude/mid-z"\n',
                                 '[roles.execution]\nwho = "worker"\nprovider = "gateway"\nmodel = "gateway/task-normal"\n')
    cfg = cfg.replace('model = "gateway/task-simple"\n', 'model = "gateway/task-simple"\ntimeout = 1\n', 1)
    cfg = cfg.replace('model = "gateway/task-normal"\n', 'model = "gateway/task-normal"\ntimeout = 1\n', 1)
    assert cfg.count("timeout = 1") == 2 and "task-normal" in cfg
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        script = ('d="$(dirname "$0")"\n'
                  'if [ -n "$ANTHROPIC_BASE_URL" ]; then echo x >> "$d/gw_calls"; sleep 5; exit 0; fi\n'
                  'echo x >> "$d/claude_calls"; echo "boom: plain error" >&2; exit 1\n')
        t0 = time.monotonic()
        p = _gw_run(t, cfg + _gw_limits(t), script)
        elapsed = time.monotonic() - t0
        assert elapsed < 10, elapsed
        assert _lines(t / "bin" / "gw_calls") == 1, (_lines(t / "bin" / "gw_calls"), p.stdout, p.stderr)
        res = (t / "t.result.md").read_text()
        assert any(l.startswith("- gateway: locked for this run") and "timeout" in l for l in res.splitlines()), res
        for name in ("t.result.md", "t.report.md"):
            text = (t / name).read_text()
            assert not any("gateway: paused" in l for l in text.splitlines()), (name, text)


def test_limits_claude_pause_kept_when_later_role_has_a_fallback():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        cfg = ('[defaults]\ntimeout_seconds = 60\n'
               '[gateway]\nbase_url = "https://gw.example"\napi_key_env = "TEST_GATEWAY_KEY"\n'
               'fallback_model = "claude/small-x"\n'
               '[roles.execution_simple]\nwho = "worker"\nmodel = "claude/small-x"\n'
               '[roles.execution]\nwho = "worker"\nprovider = "gateway"\nmodel = "gateway/task-normal"\n'
               '[escalation]\nexecution_simple = ["execution"]\n'
               f'[limits]\nledger_file = "{t}/ledger.json"\n'
               '[limits.claude]\npause_seconds = 0.2\nmax_pause_seconds = 1\n'
               '[limits.gateway]\npause_seconds = 0.01\nmax_pause_seconds = 0.05\n')
        script = ('d="$(dirname "$0")"\n'
                  'if [ -n "$ANTHROPIC_BASE_URL" ]; then echo x >> "$d/gw_calls"; echo "429 Too Many Requests" >&2; exit 1; fi\n'
                  'echo x >> "$d/claude_calls"; n=$(wc -l < "$d/claude_calls")\n'
                  'if [ "$n" -eq 1 ]; then echo "429 Too Many Requests" >&2; exit 1; fi\n'
                  'echo \'{"result":"ok","is_error":false}\'\n')
        t0 = time.monotonic()
        p = _gw_run(t, cfg, script)
        elapsed = time.monotonic() - t0
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        assert elapsed >= 0.2, elapsed
        res = (t / "t.result.md").read_text()
        assert any("claude: paused 0.2s before retry" in l for l in res.splitlines()), res


def test_worker_preamble_carries_the_three_rules():
    for name, text in (("PREAMBLE", rt.PREAMBLE), ("READONLY_PREAMBLE", rt.READONLY_PREAMBLE)):
        for needle in (".claude/", "key files", "existence and permissions", "config.toml", "model IDs"):
            assert needle in text, (name, needle)


def test_worker_prompt_reaches_the_worker_with_the_rules():
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        args = setup(t, "---\nrole: execution\n---\nx\n")
        env = _fake_claude(t, 'printf \'%s\' "$2" > "$(dirname "$0")/prompt.txt"; echo \'{"result":"ok","is_error":false}\'\n')
        for role in ("execution", "research"):
            (t / "t.md").write_text(f"---\nrole: {role}\n---\nx\n")
            p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True,
                               cwd=t, env=env)
            assert p.returncode == 0, (role, p.returncode, p.stdout, p.stderr)
            sent = (t / "bin" / "prompt.txt").read_text()
            for needle in ("existence and permissions", ".claude/"):
                assert needle in sent, (role, needle, sent)


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except Exception:
                failed += 1
                print(f"FAIL {name}")
                traceback.print_exc()
    sys.exit(1 if failed else 0)

#!/usr/bin/env python3
"""Plain tests, no pytest: python3 test_run_task.py"""
import importlib.util, os, subprocess, sys, tempfile, traceback
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


def run(args, tmp):
    return subprocess.run([sys.executable, str(HERE / "run_task.py"), *args], capture_output=True, text=True, cwd=tmp)


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
    return {**os.environ, "PATH": f"{b}:{os.environ['PATH']}"}


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
        env = {**os.environ, "FOREMAN_GATEWAY_URL": "https://gw.example"}
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0 and "provider: gateway" in p.stdout, p
        # (b) no variable, no base_url: config error
        env = {k: v for k, v in os.environ.items() if k != "FOREMAN_GATEWAY_URL"}
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 2 and "[gateway] base_url" in p.stderr, p
        # config base_url wins over the variable
        (t / "config.toml").write_text(GATEWAY_CONFIG.replace("https://gw.example", "https://from-config.example"))
        env = {**os.environ, "FOREMAN_GATEWAY_URL": "https://from-env.example"}
        p = subprocess.run([sys.executable, str(HERE / "run_task.py"), *dry], capture_output=True, text=True, cwd=t, env=env)
        assert p.returncode == 0, p


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

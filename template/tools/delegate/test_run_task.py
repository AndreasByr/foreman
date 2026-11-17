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

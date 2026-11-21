#!/usr/bin/env python3
"""Tests the workspace.json format (version 1) through scripts/check-workspace.py.

Covers the shipped example, valid fixtures (minimal, all enums "unbekannt"),
and rejected fixtures (schema, secret rule, unreadable input). Python stdlib
only. Prints "workspace test: ok (N cases)" on success; otherwise one
"FAIL: <case>" line per failed case and exit 1.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKER = ROOT / "scripts" / "check-workspace.py"
EXAMPLE = ROOT / "docs" / "workspace.example.json"

PROBLEM_PREFIX = "workspace: "

failures = []
cases = 0


def check(name, ok, detail=""):
    global cases
    cases += 1
    if not ok:
        suffix = f" ({detail})" if detail else ""
        failures.append(f"FAIL: {name}{suffix}")


def dig(data, *keys):
    """Return data[k1][k2]... or None when any step is missing or not a dict."""
    current = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def run_checker(path):
    proc = subprocess.run(
        [sys.executable, str(CHECKER), str(path)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return proc.returncode, proc.stdout + proc.stderr


def problem_lines(output):
    return [line for line in output.splitlines() if line.startswith(PROBLEM_PREFIX)]


def write_text(directory, counter, content):
    path = Path(directory) / f"case-{counter}.json"
    path.write_text(content, encoding="utf-8")
    return path


def expect_valid(name, directory, counter, content):
    path = write_text(directory, counter, content)
    code, output = run_checker(path)
    check(name, code == 0, f"exit {code}: {output.strip()[:300]}")


def expect_invalid(name, directory, counter, content):
    path = write_text(directory, counter, content)
    code, output = run_checker(path)
    check(
        name,
        code == 1 and len(problem_lines(output)) > 0,
        f"exit {code}, problem lines {len(problem_lines(output))}: {output.strip()[:300]}",
    )


def base_workspace():
    return {
        "schema": 1,
        "machines": [
            {
                "name": "srv1",
                "role": "server",
                "services": ["docker"],
                "domain": "yes",
                "https": "yes",
            }
        ],
        "ai": {
            "claude": {"plan": "max", "routinesApiTrigger": "no"},
            "ollamaCloud": {"plan": "free"},
            "chatgpt": {"plan": "none"},
            "other": ["Mistral"],
        },
        "notification": ["mail"],
        "tracker": {"type": "itsaplan", "url": "https://tracker.example.com"},
        "gateway": {
            "running": "yes",
            "url": "https://gateway.example.com",
            "keyEnv": "LITELLM_KEY",
        },
    }


def minimal_workspace():
    return {
        "schema": 1,
        "machines": [],
        "ai": {
            "claude": {"plan": "none"},
            "ollamaCloud": {"plan": "none"},
            "chatgpt": {"plan": "none"},
        },
        "notification": [],
        "tracker": {"type": "none"},
        "gateway": {"running": "no"},
    }


def all_unbekannt_workspace():
    return {
        "schema": 1,
        "machines": [
            {
                "name": "box-1",
                "role": "unbekannt",
                "services": ["unbekannt"],
                "domain": "unbekannt",
                "https": "unbekannt",
            }
        ],
        "ai": {
            "claude": {"plan": "unbekannt", "routinesApiTrigger": "unbekannt"},
            "ollamaCloud": {"plan": "unbekannt"},
            "chatgpt": {"plan": "unbekannt"},
        },
        "notification": ["unbekannt"],
        "tracker": {"type": "unbekannt"},
        "gateway": {"running": "unbekannt"},
        "chatgptViaGateway": "unbekannt",
        "agent": "unbekannt",
        "github": "unbekannt",
    }


def check_example():
    # Case 1: the shipped example validates and carries the required content.
    expect_example_valid()
    try:
        data = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        check("example is readable JSON", False, str(exc))
        return
    machines = dig(data, "machines")
    check(
        "example has at least two machines",
        isinstance(machines, list) and len(machines) >= 2,
        f"machines={machines!r}"[:200],
    )
    check(
        "example gateway is running with a url",
        dig(data, "gateway", "running") == "yes" and bool(dig(data, "gateway", "url")),
    )
    check(
        "example has a chatgpt plan",
        isinstance(dig(data, "ai", "chatgpt", "plan"), str),
    )
    check(
        "example has a claude plan",
        isinstance(dig(data, "ai", "claude", "plan"), str),
    )
    check(
        "example tracker is itsaplan with a url",
        dig(data, "tracker", "type") == "itsaplan" and bool(dig(data, "tracker", "url")),
    )


def expect_example_valid():
    if not CHECKER.exists():
        check("check-workspace.py exists", False, f"missing {CHECKER.relative_to(ROOT)}")
    if not EXAMPLE.exists():
        check("example workspace.json exists", False, f"missing {EXAMPLE.relative_to(ROOT)}")
        return
    code, output = run_checker(EXAMPLE)
    check("example workspace.json is valid", code == 0, f"exit {code}: {output.strip()[:300]}")


def check_valid_fixtures(tmp, counter):
    # Case 2: minimal file and a file with every enum set to "unbekannt".
    expect_valid("minimal workspace is valid", tmp, next(counter), json.dumps(minimal_workspace()))
    expect_valid(
        "every enum set to unbekannt is valid",
        tmp,
        next(counter),
        json.dumps(all_unbekannt_workspace()),
    )
    expect_valid("base fixture is valid", tmp, next(counter), json.dumps(base_workspace()))


def check_rejected(tmp, counter):
    # Case 3: each mutation of the base fixture must be rejected.
    def mutated(name, mutate):
        data = base_workspace()
        mutate(data)
        expect_invalid(name, tmp, next(counter), json.dumps(data))

    def drop_gateway(data):
        del data["gateway"]

    def add_top_extra(data):
        data["extra"] = 1

    def add_machine_extra(data):
        data["machines"][0]["ip"] = "10.0.0.5"

    def bad_role(data):
        data["machines"][0]["role"] = "desktop"

    def upper_name(data):
        data["machines"][0]["name"] = "Srv1"

    def userinfo_url(data):
        data["tracker"]["url"] = "https://user:pw@host.example.com"

    def query_url(data):
        data["tracker"]["url"] = "https://host.example.com/path?x=1"

    def key_in_key_env(data):
        data["gateway"]["keyEnv"] = "sk-abcdefghijklmnop"

    def key_in_other(data):
        data["ai"]["other"] = ["sk-" + "ant-abcdefghijklmnop12345"]

    def base64_in_other(data):
        data["ai"]["other"] = ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn"]

    def bearer_in_other(data):
        data["ai"]["other"] = ["Bearer abc"]

    mutated("missing required top-level key is rejected", drop_gateway)
    mutated("unknown top-level field is rejected", add_top_extra)
    mutated("unknown field inside a machine is rejected", add_machine_extra)
    mutated("wrong enum value is rejected", bad_role)
    mutated("uppercase machine name is rejected", upper_name)
    mutated("tracker url with userinfo is rejected", userinfo_url)
    mutated("tracker url with query string is rejected", query_url)
    mutated("key-like keyEnv value is rejected", key_in_key_env)
    mutated("sk- key in ai.other is rejected", key_in_other)
    mutated("40 char base64-like string in ai.other is rejected", base64_in_other)
    mutated("Bearer token in ai.other is rejected", bearer_in_other)

    expect_invalid("file that is not JSON is rejected", tmp, next(counter), "{not json")

    missing = Path(tmp) / "does-not-exist.json"
    code, output = run_checker(missing)
    check(
        "file that does not exist is rejected",
        code == 1 and len(problem_lines(output)) > 0,
        f"exit {code}: {output.strip()[:300]}",
    )


def main():
    check_example()
    with tempfile.TemporaryDirectory(prefix="test-workspace-") as tmp:
        counter = iter(range(1, 10_000))
        check_valid_fixtures(tmp, counter)
        check_rejected(tmp, counter)

    if failures:
        for line in failures:
            print(line)
        return 1
    print(f"workspace test: ok ({cases} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

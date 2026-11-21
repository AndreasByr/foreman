#!/usr/bin/env python3
"""Tests the workspace.json format (version 1) through scripts/check-workspace.py.

Covers the shipped example, valid fixtures (minimal, all enums "unbekannt",
gateway url rules: plain http only for localhost and 127.0.0.1), and rejected
fixtures (schema, secret rule, unreadable input). Python stdlib
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
                "purposes": ["unbekannt"],
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
    by_name = {m.get("name"): m for m in machines if isinstance(m, dict)} if isinstance(machines, list) else {}
    check(
        "example: myweby carries purposes dispatcher-host, app-hosting, tracker-host, gateway-host",
        sorted(dig(by_name, "myweby", "purposes") or []) == sorted(
            ["dispatcher-host", "app-hosting", "tracker-host", "gateway-host"]
        ),
    )
    check(
        "example: alice carries purpose local-runs",
        dig(by_name, "alice", "purposes") == ["local-runs"],
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

    with_purposes = base_workspace()
    with_purposes["machines"][0]["purposes"] = ["dispatcher-host", "app-hosting"]
    expect_valid("machine with purposes is valid", tmp, next(counter), json.dumps(with_purposes))

    gateway_v1 = base_workspace()
    gateway_v1["gateway"]["url"] = "https://gw.example.com/v1"
    expect_valid("gateway url with a /v1 path is valid", tmp, next(counter), json.dumps(gateway_v1))

    # Plain http is allowed for localhost and 127.0.0.1 only; other hosts need https.
    for url in ["http://127.0.0.1:4000", "http://localhost:4000", "https://gateway.example.com"]:
        local_gateway = base_workspace()
        local_gateway["gateway"]["url"] = url
        expect_valid(f"gateway url {url} is valid", tmp, next(counter), json.dumps(local_gateway))

    http_tracker = base_workspace()
    http_tracker["tracker"]["url"] = "http://tracker.example.com"
    expect_valid("tracker url with http is valid", tmp, next(counter), json.dumps(http_tracker))


def check_time_zone(tmp, counter):
    # Optional top-level timeZone (IANA name string).
    try:
        example = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        example = {}
    check(
        "example carries timeZone Europe/Berlin",
        dig(example, "timeZone") == "Europe/Berlin",
        f"timeZone={dig(example, 'timeZone')!r}",
    )

    without = base_workspace()
    check("fixture without timeZone has no timeZone key", "timeZone" not in without)
    expect_valid("workspace without timeZone is valid", tmp, next(counter), json.dumps(without))

    with_zone = base_workspace()
    with_zone["timeZone"] = "Europe/Berlin"
    expect_valid("workspace with timeZone Europe/Berlin is valid", tmp, next(counter), json.dumps(with_zone))

    for value in ["Mars/Base", "", 5, "Europe/Berlin; rm"]:
        data = base_workspace()
        data["timeZone"] = value
        path = write_text(tmp, next(counter), json.dumps(data))
        code, output = run_checker(path)
        problems = problem_lines(output)
        check(
            f"timeZone {value!r} is rejected and the message names timeZone",
            code == 1 and any("timeZone" in line for line in problems),
            f"exit {code}, problems: {' | '.join(problems)[:300]}",
        )


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

    def bad_purpose(data):
        data["machines"][0]["purposes"] = ["boss"]

    def plain_http_single_label_gateway(data):
        data["gateway"]["url"] = "http://alice:4000"

    def plain_http_public_gateway(data):
        data["gateway"]["url"] = "http://gateway.example.com"

    def key_like_env_name(data):
        # 40 uppercase letters pass the keyEnv pattern; only the secret rule rejects them.
        data["gateway"]["keyEnv"] = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN"

    def rejected_with_secret(name, mutate, secret):
        data = base_workspace()
        mutate(data)
        path = write_text(tmp, next(counter), json.dumps(data))
        code, output = run_checker(path)
        check(
            name,
            code == 1 and len(problem_lines(output)) > 0,
            f"exit {code}, problem lines {len(problem_lines(output))}",
        )
        # The problem text must never echo the secret; no output is printed here on purpose.
        check(f"{name}: problem text omits the secret part", secret not in output)

    gateway_hex = ("0123456789abcdef" * 3)[:40]

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
    mutated("purpose outside the enum is rejected", bad_purpose)
    mutated("gateway url http with a single-label host is rejected", plain_http_single_label_gateway)
    mutated("gateway url http with a dotted public host is rejected", plain_http_public_gateway)
    key_env_data = base_workspace()
    key_like_env_name(key_env_data)
    key_env_path = write_text(tmp, next(counter), json.dumps(key_env_data))
    key_env_code, key_env_output = run_checker(key_env_path)
    key_env_problems = problem_lines(key_env_output)
    check(
        "40 uppercase letters as keyEnv are rejected by the secret rule (problem says secret or key-like)",
        key_env_code == 1
        and any("secret" in line.lower() or "key-like" in line.lower() for line in key_env_problems),
        f"exit {key_env_code}, problems: {' | '.join(key_env_problems)[:300]}",
    )

    rejected_with_secret(
        "Slack webhook url in tracker.url is rejected",
        lambda data: data["tracker"].__setitem__("url", "https://hooks.slack.com/services/T0/B0/abcdef"),
        "T0/B0/abcdef",
    )
    rejected_with_secret(
        "Discord webhook url in gateway.url is rejected",
        lambda data: data["gateway"].__setitem__("url", "https://discord.com/api/webhooks/123/abcdef"),
        "123/abcdef",
    )
    rejected_with_secret(
        "40 hex characters in a gateway.url path are rejected",
        lambda data: data["gateway"].__setitem__("url", "https://gw.example.com/" + gateway_hex),
        gateway_hex,
    )

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
        check_time_zone(tmp, counter)

    if failures:
        for line in failures:
            print(line)
        return 1
    print(f"workspace test: ok ({cases} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

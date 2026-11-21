#!/usr/bin/env python3
"""Tests scripts/setup-summary.py: the summary of the human's answers before any recommendation.

Covers the shipped example, "I don't know" answers (unbekannt and the Gaps line),
everything unbekannt, empty answers, absent optional fields, invalid files
(schema and key-like values), and --write with and without --confirmed.
Python stdlib only. Prints "summary test: ok (N cases)" on success; otherwise one
"FAIL: <case>" line per failed case and exit 1.
"""
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUMMARY = ROOT / "scripts" / "setup-summary.py"
EXAMPLE = ROOT / "docs" / "workspace.example.json"

HEADER = "Summary of your answers (nothing is guessed):"
LAST_LINE = "Is this correct? Nothing is recommended before you confirm."
PROBLEM_PREFIX = "workspace: "
RECOMMEND_WORDS = ("recommend", "suggest", "should")

# Built at runtime so this file holds no key-like literal.
KEY_LIKE = "sk" + "-" + "abcdefgh" + "0123456789"

failures = []
cases = 0


def check(name, ok, detail=""):
    global cases
    cases += 1
    if not ok:
        suffix = f" ({detail})" if detail else ""
        failures.append(f"FAIL: {name}{suffix}")


def run(args):
    proc = subprocess.run(
        [sys.executable, str(SUMMARY), *args],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return proc.returncode, proc.stdout, proc.stderr


def load_example():
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def write_json(directory, name, data):
    path = Path(directory) / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def summarize(directory, name, data):
    path = write_json(directory, name, data)
    return run([str(path)])


def lines_of(text):
    return text.splitlines()


def has_line(text, line):
    return line in lines_of(text)


def gaps_line(text):
    for line in lines_of(text):
        if line.startswith("Gaps (unbekannt): "):
            return line
    return None


def check_example(tmp):
    code, out, err = run([str(EXAMPLE)])
    lines = lines_of(out)
    check("example: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "example: first line is the summary header",
        bool(lines) and lines[0] == HEADER,
        f"first line: {lines[0] if lines else '(none)'}",
    )
    for expected in [
        "- myweby (server): docker, coolify, itsaplan, litellm, dispatcher; domain: yes; HTTPS: yes",
        "- alice (home-server): docker; domain: no; HTTPS: no",
        "- Claude: max; routines with API trigger: yes",
        "- Ollama Cloud: pro",
        "- ChatGPT: plus",
        "Notification: discord-webhook",
        "Tracker: itsaplan (https://itsaplan.example.com)",
        "Gateway: running, https://gateway.example.com",
        "ChatGPT via gateway: accepted-risk",
        "Gaps (unbekannt): none",
    ]:
        check(f"example: prints '{expected}'", has_line(out, expected))
    check("example: no Other line when ai.other is absent", not any(l.startswith("- Other:") or l.startswith("Other:") for l in lines))
    check("example: last line is the confirmation question", bool(lines) and lines[-1] == LAST_LINE)
    body = lines[:-1]
    for word in RECOMMEND_WORDS:
        check(
            f"example: no '{word}' before the last line",
            not any(word in line.lower() for line in body),
        )
    check("example: no agent field in output", "agent" not in out.lower())
    check("example: no github field in output", "github" not in out.lower())
    check("example: no sk- value in output", "sk-" not in out)
    check("example: no Bearer value in output", "Bearer" not in out)


def check_unknown_answers(tmp):
    data = load_example()
    data["machines"][1]["https"] = "unbekannt"
    data["ai"]["claude"]["routinesApiTrigger"] = "unbekannt"
    data["gateway"]["running"] = "unbekannt"
    code, out, err = summarize(tmp, "unknown.json", data)
    check("unknown answers: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "unknown answers: machine https prints unbekannt",
        has_line(out, "- alice (home-server): docker; domain: no; HTTPS: unbekannt"),
    )
    check(
        "unknown answers: routines prints unbekannt",
        has_line(out, "- Claude: max; routines with API trigger: unbekannt"),
    )
    check("unknown answers: gateway prints unbekannt", has_line(out, "Gateway: unbekannt"))
    check(
        "unknown answers: Gaps line lists the three paths in document order",
        gaps_line(out) == "Gaps (unbekannt): machines[1].https, ai.claude.routinesApiTrigger, gateway.running",
        f"got: {gaps_line(out)}",
    )
    check("unknown answers: last line is the confirmation question", lines_of(out)[-1:] == [LAST_LINE])


def check_all_unknown(tmp):
    data = {
        "schema": 1,
        "machines": [
            {
                "name": "box",
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
    }
    code, out, err = summarize(tmp, "all-unknown.json", data)
    check(
        "all unknown: no crash",
        code == 0 and "Traceback" not in out + err,
        f"exit {code}: {err.strip()[:300]}",
    )
    gaps = gaps_line(out) or ""
    for path in [
        "machines[0].role",
        "machines[0].services",
        "machines[0].domain",
        "machines[0].https",
        "ai.claude.plan",
        "ai.claude.routinesApiTrigger",
        "ai.ollamaCloud.plan",
        "ai.chatgpt.plan",
        "notification",
        "tracker.type",
        "gateway.running",
    ]:
        check(f"all unknown: Gaps line lists {path}", path in gaps, f"got: {gaps}")
    check(
        "all unknown: machine line prints unbekannt",
        has_line(out, "- box (unbekannt): unbekannt; domain: unbekannt; HTTPS: unbekannt"),
    )
    check("all unknown: Claude plan prints unbekannt", has_line(out, "- Claude: unbekannt; routines with API trigger: unbekannt"))
    check("all unknown: gateway prints unbekannt", has_line(out, "Gateway: unbekannt"))
    check("all unknown: no invented Docker", "Docker" not in out)
    check("all unknown: no invented GitHub", "GitHub" not in out)
    check("all unknown: no ChatGPT via gateway line when the field is absent", "ChatGPT via gateway" not in out)


def check_empty_answers(tmp):
    data = {
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
    code, out, err = summarize(tmp, "empty.json", data)
    check("empty answers: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    lines = lines_of(out)
    machines_at = lines.index("Machines:") if "Machines:" in lines else -1
    check(
        "empty answers: Machines section shows '- none'",
        machines_at >= 0 and machines_at + 1 < len(lines) and lines[machines_at + 1] == "- none",
    )
    check("empty answers: Notification is none", has_line(out, "Notification: none"))
    check("empty answers: Gateway is not running", has_line(out, "Gateway: not running"))
    check("empty answers: Tracker is none without a url", has_line(out, "Tracker: none"))
    check("empty answers: Claude plan none", has_line(out, "- Claude: none"))
    check("empty answers: Gaps line is none", gaps_line(out) == "Gaps (unbekannt): none", f"got: {gaps_line(out)}")


def check_absent_optional_fields(tmp):
    data = load_example()
    for key in ["agent", "github", "chatgptViaGateway"]:
        data.pop(key, None)
    del data["tracker"]["url"]
    del data["gateway"]["url"]
    del data["gateway"]["keyEnv"]
    del data["machines"][1]["domain"]
    del data["machines"][1]["https"]
    code, out, err = summarize(tmp, "absent.json", data)
    check("absent optional: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check("absent optional: machine line has no domain or HTTPS part", has_line(out, "- alice (home-server): docker"))
    check("absent optional: tracker line has no url part", has_line(out, "Tracker: itsaplan"))
    check("absent optional: gateway line has no url part", has_line(out, "Gateway: running"))
    check(
        "absent optional: no ChatGPT via gateway line",
        not any(line.startswith("ChatGPT via gateway") for line in lines_of(out)),
    )
    check("absent optional: no agent in output", "agent" not in out.lower())
    check("absent optional: no github in output", "github" not in out.lower())


def check_invalid(tmp):
    data = load_example()
    data["extra"] = 1
    code, out, err = summarize(tmp, "extra-field.json", data)
    combined = out + err
    check("invalid (extra field): exit 1", code == 1, f"exit {code}")
    check(
        "invalid (extra field): no Summary line",
        not any(line.startswith("Summary") for line in lines_of(out)),
    )
    check(
        "invalid (extra field): problem lines start with 'workspace: '",
        any(line.startswith(PROBLEM_PREFIX) for line in lines_of(combined)),
        f"output: {combined.strip()[:300]}",
    )

    data = load_example()
    data["ai"]["other"] = [KEY_LIKE]
    code, out, err = summarize(tmp, "key-like.json", data)
    combined = out + err
    check("invalid (key-like value in ai.other): exit 1", code == 1, f"exit {code}")
    check("invalid (key-like value in ai.other): value not printed", KEY_LIKE not in combined)
    check(
        "invalid (key-like value in ai.other): no Summary line",
        not any(line.startswith("Summary") for line in lines_of(out)),
    )


def check_write(tmp):
    source = write_json(tmp, "write-input.json", load_example())
    target = Path(tmp) / "write-out-unconfirmed.json"
    code, out, err = run([str(source), "--write", str(target)])
    check("write without --confirmed: exit 3", code == 3, f"exit {code}: {(out + err).strip()[:300]}")
    check(
        "write without --confirmed: prints 'not confirmed; nothing written'",
        "not confirmed; nothing written" in (out + err),
    )
    check("write without --confirmed: out file not created", not target.exists())

    target = Path(tmp) / "write-out-confirmed.json"
    code, out, err = run([str(source), "--write", str(target), "--confirmed"])
    check("write with --confirmed: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check("write with --confirmed: prints 'workspace.json written'", "workspace.json written" in out)
    written = None
    if target.exists():
        written = json.loads(target.read_text(encoding="utf-8"))
    check("write with --confirmed: file equals the input", written == load_example(), "json differs")

    bad = load_example()
    bad["extra"] = 1
    bad_source = write_json(tmp, "write-invalid.json", bad)
    target = Path(tmp) / "write-out-invalid.json"
    code, out, err = run([str(bad_source), "--write", str(target), "--confirmed"])
    check("write of invalid input with --confirmed: exit 1", code == 1, f"exit {code}")
    check("write of invalid input with --confirmed: out file not created", not target.exists())


def main():
    with tempfile.TemporaryDirectory(prefix="test-setup-summary-") as tmp:
        check_example(tmp)
        check_unknown_answers(tmp)
        check_all_unknown(tmp)
        check_empty_answers(tmp)
        check_absent_optional_fields(tmp)
        check_invalid(tmp)
        check_write(tmp)

    if failures:
        for line in failures:
            print(line)
        return 1
    print(f"summary test: ok ({cases} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

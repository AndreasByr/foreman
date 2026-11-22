#!/usr/bin/env python3
"""Tests scripts/setup-summary.py: the summary of the human's answers before any recommendation.

Covers the shipped example, "I don't know" answers (unbekannt and the Gaps line),
everything unbekannt, empty answers, absent optional fields, invalid files
(schema and key-like values), --write with and without --confirmed, the gateway
key variable line and its gap, the ChatGPT consent gap by plan, machines without
purposes, and the tracker url rule by tracker type.
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
SKILL = ROOT / "plugins" / "foreman" / "skills" / "foreman-setup" / "SKILL.md"

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


def without_gaps(text):
    """The summary without its Gaps line, so gap paths are not read as facts."""
    return "\n".join(line for line in lines_of(text) if not line.startswith("Gaps (unbekannt): "))


def follows(lines, first, second):
    return first in lines and second in lines and lines.index(second) == lines.index(first) + 1


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
        "- host-1 (server; purposes: dispatcher-host, app-hosting, tracker-host, gateway-host): docker, coolify, itsaplan, litellm, dispatcher; domain: yes; HTTPS: yes",
        "- host-2 (home-server; purposes: local-runs): docker; domain: no; HTTPS: no",
        "- Claude: max; routines with API trigger: yes",
        "- Ollama Cloud: pro",
        "- ChatGPT: plus",
        "Notification: discord-webhook",
        "Tracker: itsaplan (https://itsaplan.example.com)",
        "Gateway: running, https://gateway.example.com",
        "Gateway key variable: FOREMAN_GATEWAY_KEY",
        "ChatGPT via gateway: accepted-risk",
        "Agent: claude-code",
        "GitHub: yes",
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
    check(
        "example: GitHub line directly follows the Agent line",
        follows(lines, "Agent: claude-code", "GitHub: yes"),
    )
    check(
        "example: Gateway key variable line directly follows the Gateway line",
        follows(lines, "Gateway: running, https://gateway.example.com", "Gateway key variable: FOREMAN_GATEWAY_KEY"),
    )
    check(
        "example: Agent line directly follows the ChatGPT via gateway line",
        follows(lines, "ChatGPT via gateway: accepted-risk", "Agent: claude-code"),
    )
    check("example: no sk- value in output", "sk-" not in out.lower())
    check("example: no Bearer value in output", "bearer" not in out.lower())


def check_unknown_answers(tmp):
    data = load_example()
    data["machines"][1]["https"] = "unbekannt"
    data["ai"]["claude"]["routinesApiTrigger"] = "unbekannt"
    data["gateway"]["running"] = "unbekannt"
    code, out, err = summarize(tmp, "unknown.json", data)
    check("unknown answers: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "unknown answers: machine https prints unbekannt",
        has_line(out, "- host-2 (home-server; purposes: local-runs): docker; domain: no; HTTPS: unbekannt"),
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
    check("all unknown: no invented Docker", "docker" not in without_gaps(out).lower())
    check("all unknown: no invented GitHub", "github" not in without_gaps(out).lower())
    check("all unknown: no ChatGPT via gateway line when the field is absent", "ChatGPT via gateway" not in out)


def check_unanswered_gaps(tmp):
    data = load_example()
    del data["ai"]["claude"]["routinesApiTrigger"]
    del data["machines"][1]["https"]
    code, out, err = summarize(tmp, "unanswered.json", data)
    check("unanswered: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "unanswered: Gaps line lists the two unanswered fields in document order",
        gaps_line(out)
        == "Gaps (unbekannt): machines[1].https (not answered), ai.claude.routinesApiTrigger (not answered)",
        f"got: {gaps_line(out)}",
    )


def check_skill_layout():
    try:
        text = SKILL.read_text(encoding="utf-8")
    except OSError as exc:
        check("SKILL.md is readable", False, str(exc.strerror))
        return
    start = text.find("### 2b.")
    end = text.find("### 3.", start + 1) if start >= 0 else -1
    if start < 0 or end < 0:
        check("SKILL.md has step 2b before step 3", False, "heading ### 2b. or ### 3. missing")
        return
    layout_lines = [line for line in text[start:end].splitlines() if "layout" in line.lower()]
    check("SKILL.md step 2b names the summary layout", bool(layout_lines))
    for line in layout_lines:
        check(
            "SKILL.md step 2b: layout line names setup-summary.py",
            "setup-summary.py" in line,
            line.strip()[:120],
        )


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
    check(
        "empty answers: Gaps line lists the unanswered routines flag, agent and github",
        gaps_line(out)
        == "Gaps (unbekannt): ai.claude.routinesApiTrigger (not answered), agent (not answered), github (not answered)",
        f"got: {gaps_line(out)}",
    )


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
    check(
        "absent optional: machine line has no domain or HTTPS part",
        has_line(out, "- host-2 (home-server; purposes: local-runs): docker"),
    )
    check("absent optional: tracker line has no url part", has_line(out, "Tracker: itsaplan"))
    check("absent optional: gateway line has no url part", has_line(out, "Gateway: running"))
    check(
        "absent optional: no Gateway key variable line when keyEnv is absent",
        not any(line.startswith("Gateway key variable") for line in lines_of(out)),
    )
    check(
        "absent optional: no ChatGPT via gateway line",
        not any(line.startswith("ChatGPT via gateway") for line in lines_of(out)),
    )
    check(
        "absent optional: no Agent line when agent is absent",
        not any(line.lower().startswith("agent:") for line in lines_of(out)),
    )
    check(
        "absent optional: no GitHub line when github is absent",
        not any(line.lower().startswith("github:") for line in lines_of(out)),
    )
    gaps = gaps_line(out) or ""
    for path in [
        "agent (not answered)",
        "github (not answered)",
        "machines[1].domain (not answered)",
        "machines[1].https (not answered)",
        "tracker.url (not answered)",
        "gateway.url (not answered)",
        "chatgptViaGateway (not answered)",
        "gateway.keyEnv (not answered)",
    ]:
        check(f"absent optional: Gaps line lists {path}", path in gaps, f"got: {gaps}")


def check_chatgpt_consent_gap(tmp):
    for plan in ["plus", "pro", "team", "enterprise"]:
        data = load_example()
        data["ai"]["chatgpt"]["plan"] = plan
        del data["chatgptViaGateway"]
        code, out, err = summarize(tmp, f"chatgpt-{plan}-unanswered.json", data)
        check(f"chatgpt plan {plan} without chatgptViaGateway: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
        check(
            f"chatgpt plan {plan} without chatgptViaGateway: Gaps line lists chatgptViaGateway (not answered)",
            "chatgptViaGateway (not answered)" in (gaps_line(out) or ""),
            f"got: {gaps_line(out)}",
        )

    data = load_example()
    data["ai"]["chatgpt"]["plan"] = "none"
    del data["chatgptViaGateway"]
    code, out, err = summarize(tmp, "chatgpt-none-unanswered.json", data)
    check("chatgpt plan none without chatgptViaGateway: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "chatgpt plan none without chatgptViaGateway: no chatgptViaGateway gap",
        "chatgptViaGateway" not in (gaps_line(out) or ""),
        f"got: {gaps_line(out)}",
    )


def check_gateway_key_variable(tmp):
    data = load_example()
    del data["gateway"]["keyEnv"]
    code, out, err = summarize(tmp, "keyenv-absent.json", data)
    check("gateway running without keyEnv: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "gateway running without keyEnv: Gaps line is exactly the keyEnv gap",
        gaps_line(out) == "Gaps (unbekannt): gateway.keyEnv (not answered)",
        f"got: {gaps_line(out)}",
    )
    check(
        "gateway running without keyEnv: no Gateway key variable line",
        not any(line.startswith("Gateway key variable") for line in lines_of(out)),
    )

    data = load_example()
    data["gateway"] = {"running": "no"}
    code, out, err = summarize(tmp, "gateway-not-running.json", data)
    check("gateway not running without keyEnv: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "gateway not running without keyEnv: no keyEnv gap",
        gaps_line(out) == "Gaps (unbekannt): none",
        f"got: {gaps_line(out)}",
    )


def check_tracker_url_rule(tmp):
    data = load_example()
    data["tracker"] = {"type": "linear"}
    code, out, err = summarize(tmp, "linear-no-url.json", data)
    check("linear without url: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check("linear without url: Tracker line is 'Tracker: linear'", has_line(out, "Tracker: linear"))
    check(
        "linear without url: no gap for tracker.url",
        "tracker.url" not in (gaps_line(out) or ""),
        f"got: {gaps_line(out)}",
    )

    data = load_example()
    data["tracker"] = {"type": "itsaplan"}
    code, out, err = summarize(tmp, "itsaplan-no-url.json", data)
    check("itsaplan without url: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "itsaplan without url: gaps tracker.url (not answered)",
        "tracker.url (not answered)" in (gaps_line(out) or ""),
        f"got: {gaps_line(out)}",
    )


def check_missing_purposes(tmp):
    data = load_example()
    del data["machines"][1]["purposes"]
    del data["machines"][1]["domain"]
    del data["machines"][1]["https"]
    code, out, err = summarize(tmp, "purposes-absent.json", data)
    check("machine without purposes: exit 0", code == 0, f"exit {code}: {err.strip()[:300]}")
    check(
        "machine without purposes: Gaps line lists purposes before domain and https",
        gaps_line(out)
        == "Gaps (unbekannt): machines[1].purposes (not answered), machines[1].domain (not answered), machines[1].https (not answered)",
        f"got: {gaps_line(out)}",
    )


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
    check("invalid (key-like value in ai.other): value not printed", KEY_LIKE.lower() not in combined.lower())
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
        check_unanswered_gaps(tmp)
        check_chatgpt_consent_gap(tmp)
        check_gateway_key_variable(tmp)
        check_tracker_url_rule(tmp)
        check_missing_purposes(tmp)
        check_invalid(tmp)
        check_write(tmp)
    check_skill_layout()

    if failures:
        for line in failures:
            print(line)
        return 1
    print(f"summary test: ok ({cases} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

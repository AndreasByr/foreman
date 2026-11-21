#!/usr/bin/env python3
"""Summary of the setup answers for the human to confirm, and workspace.json after confirmation.

Usage:
  python3 scripts/setup-summary.py <answers.json>
  python3 scripts/setup-summary.py <answers.json> --write workspace.json --confirmed

Prints the summary. Every line comes from an answer; nothing is guessed, and "unbekannt"
stays "unbekannt". The answers file is checked first with scripts/check-workspace.py.
An invalid file prints the checker's lines and exits 1; no value from it is printed.
--write writes the file only together with --confirmed.
Exit codes: 0 ok, 1 invalid input, 2 usage, 3 --write without --confirmed.
Python stdlib only.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).resolve().parent / "check-workspace.py"
HEADER = "Summary of your answers (nothing is guessed):"
LAST_LINE = "Is this correct? Nothing is recommended before you confirm."
UNKNOWN = "unbekannt"


def run_checker(path):
    proc = subprocess.run(
        [sys.executable, str(CHECKER), path],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        for line in (proc.stdout + proc.stderr).splitlines():
            print(line)
        return False
    return True


def join_or_none(values):
    return ", ".join(values) if values else "none"


def machine_line(machine):
    parts = [join_or_none(machine["services"])]
    if "domain" in machine:
        parts.append(f"domain: {machine['domain']}")
    if "https" in machine:
        parts.append(f"HTTPS: {machine['https']}")
    role = machine["role"]
    if machine.get("purposes"):
        role += "; purposes: " + ", ".join(machine["purposes"])
    return f"- {machine['name']} ({role}): " + "; ".join(parts)


def add_gap(gaps, obj, field, path):
    """Gap for an unbekannt value or an unanswered (absent) optional field."""
    if field not in obj:
        gaps.append(f"{path} (not answered)")
    elif obj[field] == UNKNOWN:
        gaps.append(path)


def summarize(data):
    """Return the summary lines. Gaps are collected in document order."""
    gaps = []
    lines = [HEADER, "Machines:"]

    if not data["machines"]:
        lines.append("- none")
    for index, machine in enumerate(data["machines"]):
        lines.append(machine_line(machine))
        base = f"machines[{index}]"
        if machine["role"] == UNKNOWN:
            gaps.append(f"{base}.role")
        if UNKNOWN in machine["services"]:
            gaps.append(f"{base}.services")
        if UNKNOWN in machine.get("purposes", []):
            gaps.append(f"{base}.purposes")
        for field in ("domain", "https"):
            add_gap(gaps, machine, field, f"{base}.{field}")

    ai = data["ai"]
    claude = ai["claude"]
    lines.append("AI:")
    claude_line = f"- Claude: {claude['plan']}"
    if "routinesApiTrigger" in claude:
        claude_line += f"; routines with API trigger: {claude['routinesApiTrigger']}"
    lines.append(claude_line)
    if claude["plan"] == UNKNOWN:
        gaps.append("ai.claude.plan")
    add_gap(gaps, claude, "routinesApiTrigger", "ai.claude.routinesApiTrigger")

    lines.append(f"- Ollama Cloud: {ai['ollamaCloud']['plan']}")
    if ai["ollamaCloud"]["plan"] == UNKNOWN:
        gaps.append("ai.ollamaCloud.plan")

    lines.append(f"- ChatGPT: {ai['chatgpt']['plan']}")
    if ai["chatgpt"]["plan"] == UNKNOWN:
        gaps.append("ai.chatgpt.plan")

    if "other" in ai:
        lines.append(f"- Other: {join_or_none(ai['other'])}")

    notification = data["notification"]
    lines.append(f"Notification: {join_or_none(notification)}")
    if UNKNOWN in notification:
        gaps.append("notification")

    tracker = data["tracker"]
    tracker_line = f"Tracker: {tracker['type']}"
    if tracker["type"] != "none" and "url" in tracker:
        tracker_line += f" ({tracker['url']})"
    lines.append(tracker_line)
    if tracker["type"] == UNKNOWN:
        gaps.append("tracker.type")
    elif tracker["type"] != "none":
        add_gap(gaps, tracker, "url", "tracker.url")

    gateway = data["gateway"]
    if gateway["running"] == "yes":
        gateway_line = "Gateway: running" + (f", {gateway['url']}" if "url" in gateway else "")
    elif gateway["running"] == "no":
        gateway_line = "Gateway: not running"
    else:
        gateway_line = "Gateway: unbekannt"
        gaps.append("gateway.running")
    if gateway["running"] == "yes":
        add_gap(gaps, gateway, "url", "gateway.url")
    lines.append(gateway_line)

    if "chatgptViaGateway" in data:
        value = data["chatgptViaGateway"]
        lines.append(f"ChatGPT via gateway: {value}")
        if value == UNKNOWN:
            gaps.append("chatgptViaGateway")

    for field, label in (("agent", "Agent"), ("github", "GitHub")):
        if field in data:
            lines.append(f"{label}: {data[field]}")
        add_gap(gaps, data, field, field)

    lines.append("Gaps (unbekannt): " + (", ".join(gaps) if gaps else "none"))
    lines.append(LAST_LINE)
    return lines


def main(argv=None):
    parser = argparse.ArgumentParser(description="Summary of the setup answers, and workspace.json after confirmation.")
    parser.add_argument("answers", help="answers file in the workspace.json format")
    parser.add_argument("--write", metavar="FILE", help="write the answers to FILE (only with --confirmed)")
    parser.add_argument("--confirmed", action="store_true", help="the human confirmed the summary")
    args = parser.parse_args(argv)
    if args.confirmed and not args.write:
        parser.error("--confirmed needs --write")

    if not run_checker(args.answers):
        return 1
    data = json.loads(Path(args.answers).read_text(encoding="utf-8"))

    if args.write:
        if not args.confirmed:
            print("not confirmed; nothing written")
            return 3
        Path(args.write).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"workspace.json written to {args.write}")
        return 0

    print("\n".join(summarize(data)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

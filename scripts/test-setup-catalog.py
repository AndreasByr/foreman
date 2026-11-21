#!/usr/bin/env python3
"""Checks the foreman-setup question catalog, SKILL.md and the reference files.

Covers block C (C1..C9: ids, keywords, block words, multi-select), block A
(the "beginner answer" rule), the removed Result section, block D (no second
notification question), the SKILL.md order and wording (including the quick
prototype skip in steps 1 to 2b), the banned gateway phrases under references/,
the gateway risk notice and the flags in the profile reference, and the dry-run
line in gateway/README.md.

Python stdlib only. Exit 0 when every check passes; exit 1 and one
"FAIL:" line per problem otherwise.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUP_DIR = ROOT / "plugins" / "foreman" / "skills" / "foreman-setup"
CATALOG = SETUP_DIR / "references" / "question-catalog.md"
REFERENCES = SETUP_DIR / "references"
SKILL = SETUP_DIR / "SKILL.md"
PREREQUISITES = SETUP_DIR / "references" / "prerequisites.md"
PROFILES = SETUP_DIR / "references" / "profiles-and-modules.md"
GATEWAY_README = ROOT / "gateway" / "README.md"

IDS = [f"C{n}" for n in range(1, 10)]

# Keywords that each question text (C1..C9) must mention. Matched as whole
# words, case-insensitive; phrases with spaces or hyphens match as phrases.
KEYWORDS = {
    "C1": ["role", "name", "purpose", "another machine"],
    "C2": ["Docker", "Coolify", "itsaplan", "LiteLLM", "dispatcher"],
    "C3": ["HTTPS", "domain"],
    "C4": ["Ollama", "ChatGPT", "API trigger", "Max", "Pro", "Team", "API", "tier"],
    "C5": ["Discord", "Slack"],
    "C6": ["itsaplan", "Linear"],
    "C7": ["gateway", "URL", "variable", "FOREMAN_GATEWAY_KEY"],
    "C8": ["GitHub", "agent"],
    "C9": [
        "chatgptViaGateway",
        "accepted-risk",
        "declined",
        "terms of use",
        "Codex CLI",
        "ChatGPT plan",
    ],
}

# Words block C as a whole must contain.
BLOCK_WORDS = ["unbekannt", "none", "multi-select", "I don't know"]

# Questions whose own line must say multi-select.
MULTI_SELECT_IDS = ["C2", "C4", "C5"]

# Phrases no file under references/ may contain.
BANNED_IN_REFERENCES = ["LLM_GATEWAY", "documented, not required"]

# A question line starts with its bold id, optionally after a list marker.
ITEM_PREFIX = r"\s*(?:[-*]\s+|\d+\.\s+)?"


def read_text(path, failures):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        failures.append(f"cannot read {path.relative_to(ROOT)}: {exc.strerror}")
        return None


def section(text, letter):
    """Return the match for the '## <letter>. ...' section, or None."""
    return re.search(rf"^## {letter}\.[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)


def block_c(text):
    """Return the body of the '## C. ...' section, or None if absent."""
    match = section(text, "C")
    return match.group(1) if match else None


def question_line(block, qid):
    """Return the first line that starts with the question's bold id, or None."""
    start = re.compile(ITEM_PREFIX + rf"\*\*{qid}\.\*\*")
    for line in block.splitlines():
        if start.match(line):
            return line
    return None


def question_text(block, qid):
    """Return the question's first line plus continuation lines, or None."""
    start = re.compile(ITEM_PREFIX + rf"\*\*{qid}\.\*\*")
    stop = re.compile(ITEM_PREFIX + r"\*\*C\d+\.\*\*|#")
    lines = block.splitlines()
    for index, line in enumerate(lines):
        if not start.match(line):
            continue
        parts = [line]
        for following in lines[index + 1:]:
            if not following.strip() or stop.match(following):
                break
            parts.append(following)
        return " ".join(parts)
    return None


def has_word(text, word):
    return re.search(rf"\b{re.escape(word)}\b", text, re.I) is not None


def check_no_result_section(text, failures):
    if re.search(r"^## Result\b", text, re.M):
        failures.append("question-catalog.md: the '## Result' section must not exist")
    if "Recommendation:" in text:
        failures.append("question-catalog.md: the string 'Recommendation:' must not appear")


def check_beginner_answer(text, failures):
    match = section(text, "A")
    if match is None:
        failures.append("question-catalog.md: section '## A.' not found")
        return
    if "beginner answer" not in match.group(1):
        failures.append("question-catalog.md: block A lacks the string 'beginner answer'")
    outside = text[:match.start()] + text[match.end():]
    if "beginner answer" in outside:
        failures.append("question-catalog.md: 'beginner answer' appears outside block A")


def check_block_d(text, failures):
    match = section(text, "D")
    if match is None:
        failures.append("question-catalog.md: section '## D.' not found")
        return
    for line in match.group(1).splitlines():
        if re.search(r"notified", line, re.I):
            failures.append(
                "question-catalog.md: block D asks the notification channel again "
                "(a line matches 'notified'; it was already asked in C5)"
            )


def block_d_first_item(text):
    """Return the first list item of block D (marker, first line and continuation lines), or None."""
    match = section(text, "D")
    if match is None:
        return None
    item = re.compile(r"\s*(?:[-*]|\d+[.)])\s")
    parts = []
    for line in match.group(1).splitlines():
        if not parts:
            if item.match(line):
                parts.append(line)
        elif not line.strip() or item.match(line):
            break
        else:
            parts.append(line)
    return " ".join(parts) if parts else None


def check_time_zone_docs(text, failures):
    first = block_d_first_item(text)
    if first is None:
        failures.append("question-catalog.md: block D has no first item")
    else:
        lower = first.lower()
        for needle in ["workspace.json", "timezone", "per project"]:
            if needle not in lower:
                failures.append(f"question-catalog.md: block D item 1 does not mention '{needle}'")
    fmt = REFERENCES / "workspace-format.md"
    fmt_text = read_text(fmt, failures)
    if fmt_text is not None and "timeZone" not in fmt_text:
        failures.append("workspace-format.md: does not mention 'timeZone'")


def check_catalog(text, failures):
    check_time_zone_docs(text, failures)
    check_no_result_section(text, failures)
    check_beginner_answer(text, failures)
    check_block_d(text, failures)

    block = block_c(text)
    if block is None:
        failures.append("question-catalog.md: section '## C.' not found")
        return

    for qid in IDS:
        count = len(re.findall(rf"\*\*{qid}\.\*\*", block))
        if count != 1:
            failures.append(
                f"question-catalog.md: id '**{qid}.**' must appear once in block C, found {count}"
            )

    for qid, keywords in KEYWORDS.items():
        question = question_text(block, qid)
        if question is None:
            # Missing id is already reported above.
            continue
        for keyword in keywords:
            if not has_word(question, keyword):
                failures.append(
                    f"question-catalog.md: {qid} text lacks keyword '{keyword}'"
                )

    for qid in MULTI_SELECT_IDS:
        line = question_line(block, qid)
        if line is None:
            # Missing id is already reported above.
            continue
        if not has_word(line, "multi-select"):
            failures.append(
                f"question-catalog.md: {qid} question line lacks 'multi-select'"
            )

    for word in BLOCK_WORDS:
        if not has_word(block, word):
            failures.append(f"question-catalog.md: block C lacks the word '{word}'")

    if not re.search(r"never[^\n]{0,60}\bkey|\bkey[^\n]{0,60}never", block, re.I):
        failures.append(
            "question-catalog.md: block C must say that key values are never asked for"
        )


def check_skill_order(text, failures):
    early = text.find("### 2b.")
    gate = text.find("### 3.")
    if early < 0 or gate < 0 or early > gate:
        failures.append("SKILL.md: heading '### 2b.' must appear before '### 3.'")
    elif not re.search(r"confirm", text[early:gate], re.I):
        failures.append("SKILL.md: the text between '### 2b.' and '### 3.' must mention 'confirm'")

    consent = text.find("chatgptViaGateway")
    if gate < 0 or consent < 0 or consent > gate:
        failures.append(
            "SKILL.md: 'chatgptViaGateway' must appear before '### 3.' "
            "(consent is decided before the summary is confirmed)"
        )


def check_skill_description(text, failures):
    frontmatter = re.match(r"---\n(.*?)\n---\n", text, re.S)
    body = frontmatter.group(1) if frontmatter else ""
    description = re.search(r"^description:(.*?)(?=^\S|\Z)", body, re.M | re.S)
    value = description.group(1).lower() if description else ""
    if "first setup" not in value and "changed environment" not in value:
        failures.append(
            "SKILL.md: frontmatter description must contain 'first setup' or 'changed environment'"
        )


def check_skill_quick_skip(text, failures):
    """Block C is skipped only when the human itself asks for a quick prototype."""
    orient = text.find("### 1.")
    early = text.find("### 2b.")
    gate = text.find("### 3.")
    if orient < 0 or early < 0 or early <= orient:
        failures.append("SKILL.md: steps '### 1.' and '### 2b.' must exist in this order")
        return
    steps_1_2 = text[orient:early].lower()
    for phrase in ["quick prototype", "own statement"]:
        if phrase not in steps_1_2:
            failures.append(f"SKILL.md: steps 1 and 2 together lack the phrase '{phrase}'")

    if gate < 0 or gate <= early:
        failures.append("SKILL.md: heading '### 3.' must follow '### 2b.'")
        return
    section_2b = text[early:gate]
    if not re.search(r"\bQuick\b", section_2b):
        failures.append("SKILL.md: section '### 2b.' lacks the word 'Quick'")
    quick_lines = [
        line for line in section_2b.splitlines()
        if re.search(r"\bQuick\b", line)
        and "workspace.json" in line
        and re.search(r"\b(no|not|never)\b", line, re.I)
    ]
    if not quick_lines:
        failures.append(
            "SKILL.md: section '### 2b.' must say in a Quick line that no workspace.json is written"
        )


def check_skill(text, failures):
    if "unbekannt" not in text.lower():
        failures.append("SKILL.md: does not contain 'unbekannt'")
    check_skill_order(text, failures)
    check_skill_description(text, failures)
    check_skill_quick_skip(text, failures)


def check_prerequisites(failures):
    text = read_text(PREREQUISITES, failures)
    if text is None:
        return
    match = re.search(r"^## Gateway with a ChatGPT subscription.*?(?=^## |\Z)", text, re.M | re.S)
    if match is None:
        failures.append("prerequisites.md: section '## Gateway with a ChatGPT subscription' not found")
        return
    if not has_phrase(match.group(0), "terms of use"):
        failures.append("prerequisites.md: the gateway section lacks the risk notice 'terms of use'")


def has_phrase(text, phrase):
    return re.search(rf"\b{re.escape(phrase)}\b", text, re.I) is not None


def check_profiles_flags(failures):
    text = read_text(PROFILES, failures)
    if text is None:
        return
    for flag in ["--workspace", "--gateway-url", "--fallback-model", "--chatgpt-via-gateway"]:
        if flag not in text:
            failures.append(f"profiles-and-modules.md: does not mention the flag '{flag}'")


def check_gateway_readme(failures):
    text = read_text(GATEWAY_README, failures)
    if text is None:
        return
    for number, line in enumerate(text.splitlines(), start=1):
        # The dry run needs a task file; a line that ends right after the role is incomplete.
        if re.search(r"--dry-run --role execution_simple`?\.?\s*$", line):
            failures.append(
                f"gateway/README.md:{number}: the dry-run check names no task file "
                "after '--dry-run --role execution_simple'"
            )


def check_references(failures):
    if not REFERENCES.is_dir():
        failures.append(f"cannot read {REFERENCES.relative_to(ROOT)}: not a directory")
        return
    for path in sorted(REFERENCES.rglob("*")):
        if not path.is_file():
            continue
        text = read_text(path, failures)
        if text is None:
            continue
        for phrase in BANNED_IN_REFERENCES:
            if phrase in text:
                failures.append(f"{path.relative_to(ROOT)} contains '{phrase}'")


def main():
    failures = []
    catalog = read_text(CATALOG, failures)
    skill = read_text(SKILL, failures)
    if catalog is not None:
        check_catalog(catalog, failures)
    if skill is not None:
        check_skill(skill, failures)
    check_references(failures)
    check_prerequisites(failures)
    check_profiles_flags(failures)
    check_gateway_readme(failures)

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print(f"setup catalog test: ok ({', '.join(IDS)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

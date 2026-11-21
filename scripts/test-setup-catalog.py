#!/usr/bin/env python3
"""Checks the foreman-setup question catalog (block C) and SKILL.md.

Python stdlib only. Exit 0 when every check passes; exit 1 and one
"FAIL:" line per problem otherwise.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUP_DIR = ROOT / "plugins" / "foreman" / "skills" / "foreman-setup"
CATALOG = SETUP_DIR / "references" / "question-catalog.md"
SKILL = SETUP_DIR / "SKILL.md"

IDS = [f"C{n}" for n in range(1, 9)]

# Keywords that each question text (C1..C7) must mention. Matched as whole
# words, case-insensitive. C8 has no keyword rule.
KEYWORDS = {
    "C1": ["role"],
    "C2": ["Docker", "Coolify", "itsaplan", "LiteLLM", "dispatcher"],
    "C3": ["HTTPS"],
    "C4": ["Ollama", "ChatGPT", "API trigger", "Max"],
    "C5": ["Discord", "Slack"],
    "C6": ["itsaplan", "Linear"],
    "C7": ["gateway"],
}

# Words block C as a whole must contain.
BLOCK_WORDS = ["unbekannt", "none"]

# A question line starts with its bold id, optionally after a list marker.
ITEM_PREFIX = r"\s*(?:[-*]\s+|\d+\.\s+)?"


def read_text(path, failures):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        failures.append(f"cannot read {path.relative_to(ROOT)}: {exc.strerror}")
        return None


def block_c(text):
    """Return the body of the '## C. ...' section, or None if absent."""
    match = re.search(r"^## C\.[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1) if match else None


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


def check_catalog(text, failures):
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

    for word in BLOCK_WORDS:
        if not has_word(block, word):
            failures.append(f"question-catalog.md: block C lacks the word '{word}'")

    if not re.search(r"never[^\n]{0,60}\bkey|\bkey[^\n]{0,60}never", block, re.I):
        failures.append(
            "question-catalog.md: block C must say that key values are never asked for"
        )


def check_skill(text, failures):
    if "unbekannt" not in text.lower():
        failures.append("SKILL.md: does not contain 'unbekannt'")


def main():
    failures = []
    catalog = read_text(CATALOG, failures)
    skill = read_text(SKILL, failures)
    if catalog is not None:
        check_catalog(catalog, failures)
    if skill is not None:
        check_skill(skill, failures)

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print(f"setup catalog test: ok ({', '.join(IDS)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

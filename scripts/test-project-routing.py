#!/usr/bin/env python3
"""Checks how the foreman-project and foreman-setup skills split new projects from first setups.

Section 1 (detection, foreman-project body): the old "not installed in the
repo" rule is gone, workspace.json is checked, the one question "Is foreman
already set up?" is asked only when workspace.json is missing, a "yes" answer
starts no setup and a "no" answer hands over to foreman-setup.

Section 2 (routing, the two frontmatter descriptions): sample questions for a
new project and for a first setup must reach the right skill by trigger
keyword, and each description names the other skill as the one that takes over.

Python stdlib only. Exit 0 when every check passes; exit 1 and one
"FAIL:" line per problem otherwise.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "plugins" / "foreman" / "skills"
PROJECT = SKILLS / "foreman-project" / "SKILL.md"
SETUP = SKILLS / "foreman-setup" / "SKILL.md"

PROJECT_NAME = "foreman-project"
SETUP_NAME = "foreman-setup"

# Section 1: the old rule that must be gone.
OLD_RULE_PHRASES = ["not installed in the repo"]
OLD_RULE_PATTERN = re.compile(r"run\s+`?foreman-setup`?\s+first")

# Section 1: the one question, quoted exactly.
QUESTION = "Is foreman already set up?"
NEGATION = re.compile(r"\b(?:no|not|never|without)\b|n't", re.I)

# Section 2: sample questions and the skill each one must reach.
NEW_PROJECT = [
    "new project",
    "start a new project",
    "I have a new project idea",
    "set up a project in my existing foreman environment",
]
FIRST_SETUP = [
    "first setup of foreman",
    "install foreman for the first time",
    "my environment changed: new server",
    "I added a new machine",
]

# Section 2: trigger keywords per skill, matched case-insensitively as substrings.
TRIGGERS = {
    PROJECT_NAME: [
        "new project",
        "starts a project",
        "start a project",
        "project idea",
        "existing environment",
        "already set up",
    ],
    SETUP_NAME: [
        "first setup",
        "environment changed",
        "new machine",
        "new server",
        "never set up",
        "first time",
    ],
}

# "not for ..." runs up to the next ";" or "." and only points away; it is cut out.
NOT_FOR_PATTERN = re.compile(r"not for[^;.]*")
# Clauses (split on ";" and ".") containing one of these only point to the other skill and are dropped.
POINTER_PHRASES = ["use foreman-project", "use foreman-setup"]


def read_text(path, failures):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        failures.append(f"cannot read {path.relative_to(ROOT)}: {exc.strerror}")
        return None


def sentences(text):
    return [part for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse_description(frontmatter):
    """Return the description value from the front matter, quotes removed, or None."""
    match = re.search(
        r"^description:[ \t]*(.*)((?:\n[ \t]+\S.*)*)", frontmatter, re.M
    )
    if match is None:
        return None
    value = (match.group(1) + match.group(2).replace("\n", " ")).strip()
    value = unquote(value).strip()
    return value or None


def load_skill(path, name, failures):
    """Return (description, body) for a SKILL.md, or (None, None) after recording a failure."""
    text = read_text(path, failures)
    if text is None:
        return None, None
    front = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, re.S)
    if front is None:
        failures.append(f"{name}: SKILL.md has no front matter")
        return None, None
    description = parse_description(front.group(1))
    if description is None:
        failures.append(f"{name}: front matter has no description")
    return description, text[front.end():]


def check_detection(body, failures):
    lower = body.lower()
    for phrase in OLD_RULE_PHRASES:
        if phrase in lower:
            failures.append(f"{PROJECT_NAME}: body still contains the old rule '{phrase}'")
    if OLD_RULE_PATTERN.search(lower):
        failures.append(f"{PROJECT_NAME}: body still contains the old rule 'run foreman-setup first'")

    if "workspace.json" not in lower:
        failures.append(f"{PROJECT_NAME}: body does not mention 'workspace.json'")

    if QUESTION not in body:
        failures.append(f"{PROJECT_NAME}: body lacks the exact question '{QUESTION}'")
    if not re.search(r"(exactly|only) one question", lower):
        failures.append(
            f"{PROJECT_NAME}: body does not say the question is asked exactly once "
            "(no 'exactly one question' or 'only one question')"
        )
    body_sentences = [s.lower() for s in sentences(body)]
    if not any("workspace.json" in s and "missing" in s and re.search(r"\bonly\b", s)
               for s in body_sentences):
        failures.append(
            f"{PROJECT_NAME}: body does not say the question is asked only when workspace.json is missing"
        )

    yes_ok = any(
        re.search(r"\byes\b", s, re.I) and "foreman-setup" in s and NEGATION.search(s)
        for s in body_sentences
    )
    if not yes_ok:
        failures.append(
            f"{PROJECT_NAME}: body does not say in one sentence that on 'yes' no setup is started "
            "(needs 'yes', 'foreman-setup' and a negation)"
        )
    no_ok = any(
        re.search(r"\bno\b", s, re.I)
        and not re.search(r"\byes\b", s, re.I)
        and "foreman-setup" in s
        for s in body_sentences
    )
    if not no_ok:
        failures.append(f"{PROJECT_NAME}: body does not say that on 'no' it hands over to foreman-setup")


def clean_description(description):
    text = NOT_FOR_PATTERN.sub("", description.lower())
    clauses = re.split(r"[;.]", text)
    kept = [c for c in clauses if c.strip() and not any(p in c for p in POINTER_PHRASES)]
    return " ".join(kept)


def trigger_hits(skill, text_lower):
    return [keyword for keyword in TRIGGERS[skill] if keyword in text_lower]


def check_questions(label, questions, skill, other, cleaned, failures):
    skill_hits = trigger_hits(skill, cleaned[skill])
    other_hits = trigger_hits(other, cleaned[other])
    for question in questions:
        if not skill_hits:
            failures.append(
                f"routing: {label} question {question!r} is not routed to {skill}: "
                f"its cleaned description contains no trigger keyword"
            )
        shared = [keyword for keyword in other_hits if keyword in question.lower()]
        if shared:
            failures.append(
                f"routing: {label} question {question!r} also routes to {other} via "
                f"{', '.join(repr(k) for k in shared)}: the cleaned {other} description "
                "must not match a keyword that the question contains"
            )


def check_routing(descriptions, failures):
    cleaned = {name: clean_description(desc) for name, desc in descriptions.items()}
    check_questions("NEW_PROJECT", NEW_PROJECT, PROJECT_NAME, SETUP_NAME, cleaned, failures)
    check_questions("FIRST_SETUP", FIRST_SETUP, SETUP_NAME, PROJECT_NAME, cleaned, failures)


def check_cross_reference(descriptions, failures):
    setup = descriptions[SETUP_NAME].lower()
    project = descriptions[PROJECT_NAME].lower()
    if PROJECT_NAME not in setup:
        failures.append(f"{SETUP_NAME}: description does not say that {PROJECT_NAME} takes over")
    if SETUP_NAME not in project:
        failures.append(f"{PROJECT_NAME}: description does not say that {SETUP_NAME} takes over")


def main():
    failures = []
    descriptions = {}

    project_description, project_body = load_skill(PROJECT, PROJECT_NAME, failures)
    setup_description, _setup_body = load_skill(SETUP, SETUP_NAME, failures)
    if project_description is not None:
        descriptions[PROJECT_NAME] = project_description
    if setup_description is not None:
        descriptions[SETUP_NAME] = setup_description

    detection_failures = []
    if project_body is not None:
        check_detection(project_body, detection_failures)
    failures.extend(detection_failures)

    routing_failures = []
    if len(descriptions) == 2:
        check_routing(descriptions, routing_failures)
        check_cross_reference(descriptions, routing_failures)
    failures.extend(routing_failures)

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("ok: detection (workspace.json check, one question, yes/no handover)")
    print(f"ok: routing ({len(NEW_PROJECT)} new-project and {len(FIRST_SETUP)} first-setup questions)")
    print("ok: cross-reference (each description names the other skill)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Checks how the foreman-project and foreman-setup skills split new projects from first setups.

Section 1 (detection, foreman-project body): the old "not installed in the
repo" rule is gone, workspace.json is checked, the one question "Is foreman
already set up?" is asked only when workspace.json is missing, a "yes" answer
starts no setup and a "no" answer hands over to foreman-setup.

Section 2 (routing, the two frontmatter descriptions): sample questions for a
new project and for a first setup must reach the right skill by trigger
keyword, and each description names the other skill as the one that takes over.

Section 3 (project questions, references/project-questions.md): nine headed
questions P1 to P9 with their keywords, the Autopilot-only split, a suggestion
per question, the installer flags and .foreman.json keys they map to, no
machine, gateway, billing or infrastructure topics outside a "Do not ask"
list, and PROJECT SKILL.md says where the questions come from, that
workspace.json values are shown and not asked again, and that the Autopilot
questions are asked only for the Autopilot profile. A block runs from its
"### P<n>" heading to the next heading of any level, or to a "Do not ask" line.

Section 4 (summary and docs): PROJECT SKILL.md shows a summary of the answers
before the install command and asks the human to confirm, and says the install
command holds only values from answers or workspace.json. README.md,
docs/MODULES.md and docs/CONVENTIONS.md name the autopilot keys, and
profiles-and-modules.md names --tz and foreman-project.

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

# Section 3: the project questions file and the SKILL.md text that must point to it.
QUESTIONS = SKILLS / "foreman-project" / "references" / "project-questions.md"
QUESTIONS_REF = "references/project-questions.md"
QUESTIONS_LABEL = "project-questions"
QUESTION_KEYWORDS = {
    "P1": ["name", "slug"],
    "P2": ["Quick", "Repo", "Autopilot"],
    "P3": ["module"],
    "P4": ["cloud", "local"],
    "P5": ["staging"],
    "P6": ["time zone", "workspace.json"],
    "P7": ["batch hours", "3, 7, 11, 15, 19, 23"],
    "P8": ["wait", "4 hours"],
    "P9": ["mainAutoMerge", "Batch PR main"],
}
AUTOPILOT_ONLY_IDS = {"P6", "P7", "P8", "P9"}
AUTOPILOT_ONLY = "autopilot only"
QUESTION_FLAGS = ["--tz", "--batch-hours", "--wait-hours", "--main-auto-merge"]
QUESTION_KEYS = [
    "context.timeZone",
    "autopilot.batchHours",
    "autopilot.waitHours",
    "autopilot.mainAutoMerge",
]
# Topics that may appear only in the "Do not ask" list, never in a question P1 to P9.
FORBIDDEN_TOPICS = [
    "machine",
    "gateway",
    "subscription",
    "docker",
    "litellm",
    "dispatcher host",
    "notification",
    "tracker server",
]
DO_NOT_ASK = "do not ask"
DO_NOT_ASK_NAMES = ["machines", "gateway", "plans", "tracker server"]
NOT_ASKED = re.compile(r"\bnot (?:be )?ask")
HEADING_LINE = re.compile(r"^#{1,6}\s")
QUESTION_HEADING = re.compile(r"^###\s+(P\d+)\b")

# Section 4: summary step and documentation.
SUMMARY_WORDS = ["summary", "install command", "confirm"]
BEFORE_WORD = re.compile(r"\bbefore\b")
ONLY_VALUES = re.compile(r"\bonly values\b", re.I)
AUTOPILOT_KEYS = ["autopilot.waitHours", "autopilot.batchHours"]
MERGE_KEY = "mainAutoMerge"
README = ROOT / "README.md"
MODULES = ROOT / "docs" / "MODULES.md"
CONVENTIONS = ROOT / "docs" / "CONVENTIONS.md"
PROFILES = SKILLS / "foreman-setup" / "references" / "profiles-and-modules.md"
PROFILE_NEEDLES = ["--tz", PROJECT_NAME]

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


def is_block_end(line):
    """True for a heading line or a 'Do not ask' line, which both end a question block."""
    stripped = line.strip().lstrip("*#_ ").lower()
    return bool(HEADING_LINE.match(line)) or stripped.startswith(DO_NOT_ASK)


def question_blocks(text):
    """Map each P<n> id to its block: from its '### P<n>' line up to the next heading or 'Do not ask' line."""
    blocks = {}
    current = None
    for line in text.splitlines():
        if is_block_end(line):
            match = QUESTION_HEADING.match(line)
            current = match.group(1) if match else None
            if current is not None:
                blocks.setdefault(current, [])
        if current is not None:
            blocks[current].append(line)
    return {qid: "\n".join(lines) for qid, lines in blocks.items()}


def do_not_ask_text(text):
    """Return the 'Do not ask' line and the lines after it up to the next heading, or None."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if DO_NOT_ASK in line.lower():
            collected = [line]
            for later in lines[index + 1:]:
                if is_block_end(later):
                    break
                collected.append(later)
            return "\n".join(collected)
    return None


def check_questions_file(text, failures):
    blocks = question_blocks(text)
    for qid in QUESTION_KEYWORDS:
        if qid not in blocks:
            failures.append(f"questions: no heading '### {qid}' in {QUESTIONS_LABEL}")
            continue
        block = blocks[qid].lower()
        for keyword in QUESTION_KEYWORDS[qid]:
            if keyword.lower() not in block:
                failures.append(f"questions: {qid} lacks the keyword {keyword!r}")
        has_autopilot_only = AUTOPILOT_ONLY in block
        if qid in AUTOPILOT_ONLY_IDS and not has_autopilot_only:
            failures.append(f"questions: {qid} lacks 'Autopilot only'")
        if qid not in AUTOPILOT_ONLY_IDS and has_autopilot_only:
            failures.append(f"questions: {qid} must not contain 'Autopilot only'")
        if "suggestion" not in block:
            failures.append(f"questions: {qid} has no 'Suggestion' line")

    for flag in QUESTION_FLAGS:
        if flag not in text:
            failures.append(f"questions: the file does not mention the installer flag {flag}")
    for key in QUESTION_KEYS:
        if key not in text:
            failures.append(f"questions: the file does not mention the .foreman.json key {key}")

    questions_only = "\n".join(blocks.get(qid, "") for qid in QUESTION_KEYWORDS).lower()
    for topic in FORBIDDEN_TOPICS:
        if topic in questions_only:
            failures.append(f"questions: P1 to P9 mention the forbidden topic {topic!r}")

    not_ask = do_not_ask_text(text)
    if not_ask is None:
        failures.append("questions: no 'Do not ask' heading or line")
        return
    not_ask_lower = not_ask.lower()
    for name in DO_NOT_ASK_NAMES:
        if name not in not_ask_lower:
            failures.append(f"questions: the 'Do not ask' list does not name {name!r}")


def questions_section(body):
    """Return the first heading section whose heading mentions 'question', or None."""
    lines = body.splitlines()
    start = None
    level = None
    for index, line in enumerate(lines):
        match = re.match(r"(#{1,6})\s+(.*)", line)
        if start is None:
            if match and "project question" in match.group(2).lower():
                start = index
                level = len(match.group(1))
            continue
        if match and len(match.group(1)) <= level:
            return "\n".join(lines[start:index])
    return None if start is None else "\n".join(lines[start:])


def check_project_questions_section(body, failures):
    if QUESTIONS_REF not in body:
        failures.append(f"questions: {PROJECT_NAME} body does not mention '{QUESTIONS_REF}'")
    section = questions_section(body)
    if section is None:
        failures.append(f"questions: {PROJECT_NAME} has no section about project questions (no heading with 'question')")
        return
    section_sentences = [s.lower() for s in sentences(section)]
    if not any("project-questions.md" in s and re.search(r"\bfrom\b", s) for s in section_sentences):
        failures.append(f"questions: the project questions section does not say the questions come from {QUESTIONS_REF}")
    if not any("workspace.json" in s and "shown" in s and NOT_ASKED.search(s) for s in section_sentences):
        failures.append(
            "questions: the project questions section does not say that workspace.json values "
            "are taken over and shown, not asked again"
        )
    if not any("autopilot" in s and "profile" in s and re.search(r"\bonly\b", s) and re.search(r"\bask", s)
               for s in section_sentences):
        failures.append(
            "questions: the project questions section does not say that the Autopilot questions "
            "are asked only for profile Autopilot"
        )


def units(text):
    """Split into paragraphs and list items."""
    return [u for u in re.split(r"\n\s*\n|\n(?=\s*(?:[-*+]|\d+[.)])\s)", text) if u.strip()]


def check_summary_step(body, failures):
    for unit in units(body):
        lower = unit.lower()
        if all(word in lower for word in SUMMARY_WORDS) and BEFORE_WORD.search(lower):
            break
    else:
        failures.append(
            f"summary: no step (paragraph or list item) shows a summary before the install command "
            f"and asks the human to confirm (needs 'summary', 'before', 'install command', 'confirm')"
        )
    if not any("install command" in s.lower() and ONLY_VALUES.search(s) for s in sentences(body)):
        failures.append(
            f"summary: no sentence says the install command contains only values from answers or workspace.json"
        )


def check_docs(failures):
    for path, label, keys in [
        (README, "README.md", AUTOPILOT_KEYS + [MERGE_KEY]),
        (MODULES, "docs/MODULES.md", AUTOPILOT_KEYS + [MERGE_KEY]),
        (CONVENTIONS, "docs/CONVENTIONS.md", AUTOPILOT_KEYS),
    ]:
        text = read_text(path, failures)
        if text is None:
            continue
        for key in keys:
            if key not in text:
                failures.append(f"docs: {label} does not mention {key}")
    text = read_text(PROFILES, failures)
    if text is not None:
        for needle in PROFILE_NEEDLES:
            if needle not in text:
                failures.append(f"docs: profiles-and-modules.md does not mention {needle}")


def main():
    load_failures = []
    descriptions = {}

    project_description, project_body = load_skill(PROJECT, PROJECT_NAME, load_failures)
    setup_description, _setup_body = load_skill(SETUP, SETUP_NAME, load_failures)
    if project_description is not None:
        descriptions[PROJECT_NAME] = project_description
    if setup_description is not None:
        descriptions[SETUP_NAME] = setup_description

    detection_failures = []
    if project_body is not None:
        check_detection(project_body, detection_failures)

    routing_failures = []
    cross_failures = []
    if len(descriptions) == 2:
        check_routing(descriptions, routing_failures)
        check_cross_reference(descriptions, cross_failures)

    questions_failures = []
    questions_text = read_text(QUESTIONS, questions_failures)
    if questions_text is not None:
        check_questions_file(questions_text, questions_failures)
    if project_body is not None:
        check_project_questions_section(project_body, questions_failures)

    summary_failures = []
    if project_body is not None:
        check_summary_step(project_body, summary_failures)
    check_docs(summary_failures)

    failures = load_failures + detection_failures + routing_failures + cross_failures
    failures += questions_failures + summary_failures
    for failure in failures:
        print(f"FAIL: {failure}", file=sys.stderr)

    if project_body is not None and not detection_failures:
        print("ok: detection (workspace.json check, one question, yes/no handover)")
    if len(descriptions) == 2 and not routing_failures:
        print(f"ok: routing ({len(NEW_PROJECT)} new-project and {len(FIRST_SETUP)} first-setup questions)")
    if len(descriptions) == 2 and not cross_failures:
        print("ok: cross-reference (each description names the other skill)")
    if project_body is not None and not questions_failures:
        print(f"ok: project questions (P1 to P9, Autopilot split, flags, Do not ask list, {QUESTIONS_REF})")
    if project_body is not None and not summary_failures:
        print("ok: summary and docs (confirm step, install command, README, MODULES, CONVENTIONS, profiles)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

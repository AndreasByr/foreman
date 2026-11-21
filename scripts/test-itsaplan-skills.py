#!/usr/bin/env python3
"""Checks that foreman's skills and docs describe the itsaplan project template.

Section S2 (foreman-setup): SKILL.md points to references/itsaplan-template.md
and says "once per workspace", stays at most 10800 bytes. The reference exists,
names the two import tools, the template file and the template name "foreman",
says the step is skipped only for "quick prototype" or a tracker that is not
itsaplan, never inferred, never imports an existing template twice, reports a
missing tool or permission instead of guessing, never adds the bot account
itself, is in English, and names no export or create tools.

Section S3 (foreman-project and docs): the itsaplan bullet of step 6 mentions
create_project, templateId and template, no longer says "a project with the
status columns and labels", names the one manual step "add the bot account as
a member", and stays at most 10240 bytes. The itsaplan section of
tracker-and-dispatcher.md names the template file, the bot account as the one
manual step, and says the template does not change existing projects.
install.sh drops "create the columns and labels" and its itsaplan hint names
the template. docs/trackers.md, docs/MODULES.md and README.md name the
template file; docs/trackers.md also describes the check-config name check.
CHANGELOG.md mentions itsaplan and template near the top, and
scripts/test-all.sh runs this test.

A missing or unreadable file is a FAIL line, never a crash.
Python stdlib only. Exit 0 when every check passes; exit 1 and one
"FAIL:" line per problem otherwise.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "plugins" / "foreman" / "skills"

SETUP_SKILL = SKILLS / "foreman-setup" / "SKILL.md"
SETUP_SKILL_NAME = "foreman-setup/SKILL.md"
SETUP_MAX_BYTES = 10800
SETUP_REF_PATH = "references/itsaplan-template.md"
SETUP_ONCE = "once per workspace"

TEMPLATE_REF = SKILLS / "foreman-setup" / "references" / "itsaplan-template.md"
TEMPLATE_REF_NAME = "foreman-setup/references/itsaplan-template.md"
TEMPLATE_REQUIRED = [
    "list_project_templates",
    "import_project_template",
    "itsaplan-project-template.json",
    "quick prototype",
    "only",
    "tracker-itsaplan",
]
TEMPLATE_FORBIDDEN = ["export_project_template", "create_project_template"]
# German function words: the reference is written in English.
GERMAN_WORDS = re.compile(r"\b(?:und|der|die|das|nicht|wird|oder|ist)\b", re.I)

PROJECT_SKILL = SKILLS / "foreman-project" / "SKILL.md"
PROJECT_SKILL_NAME = "foreman-project/SKILL.md"
PROJECT_MAX_BYTES = 10240
ITSAPLAN_BULLET = re.compile(r"^ {3}- itsaplan:", re.M)
BULLET_REQUIRED = ["create_project", "templateId", "template", "add the bot account as a member"]
BULLET_OLD_TEXT = "a project with the status columns and labels"

TRACKER_DOC = SKILLS / "foreman-project" / "references" / "tracker-and-dispatcher.md"
TRACKER_DOC_NAME = "foreman-project/references/tracker-and-dispatcher.md"

INSTALL_SH = ROOT / "install.sh"
OLD_INSTALL_TEXT = "create the columns and labels"

TEMPLATE_FILE = "itsaplan-project-template"
TRACKERS_DOC = ROOT / "docs" / "trackers.md"
MODULES_DOC = ROOT / "docs" / "MODULES.md"
README = ROOT / "README.md"
CHANGELOG = ROOT / "CHANGELOG.md"
CHANGELOG_LINES = 60
TEST_ALL = ROOT / "scripts" / "test-all.sh"
TEST_ALL_LINE = "python3 scripts/test-itsaplan-skills.py"

# Headings: a section runs from its heading to the next heading of the same or a higher level.
HEADING = re.compile(r"^(#{1,6})\s+(.*)")


def read_text(path, failures):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        failures.append(f"cannot read {path.relative_to(ROOT)}: {exc.strerror}")
        return None


def file_size(path, failures):
    try:
        return path.stat().st_size
    except OSError as exc:
        failures.append(f"cannot stat {path.relative_to(ROOT)}: {exc.strerror}")
        return None


def sentences(text):
    """Split into sentences and lines, so a rule is matched within one statement."""
    return [part.lower() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def has_sentence(text, *needles):
    """True when one sentence contains every needle (case-insensitive)."""
    return any(all(n in s for n in needles) for s in sentences(text))


def heading_section(text, pattern):
    """Return the text of the first heading that matches pattern, up to the next heading of the same or a higher level."""
    lines = text.splitlines()
    start = None
    level = None
    for index, line in enumerate(lines):
        match = HEADING.match(line)
        if start is None:
            if match and re.search(pattern, match.group(2), re.I):
                start = index
                level = len(match.group(1))
            continue
        if match and len(match.group(1)) <= level:
            return "\n".join(lines[start:index])
    return None if start is None else "\n".join(lines[start:])


def check_setup_skill(failures):
    text = read_text(SETUP_SKILL, failures)
    size = file_size(SETUP_SKILL, failures)
    if text is not None:
        if SETUP_REF_PATH not in text:
            failures.append(f"{SETUP_SKILL_NAME}: does not mention '{SETUP_REF_PATH}'")
        if SETUP_ONCE not in text.lower():
            failures.append(f"{SETUP_SKILL_NAME}: does not say '{SETUP_ONCE}'")
    if size is not None and size > SETUP_MAX_BYTES:
        failures.append(f"{SETUP_SKILL_NAME}: {size} bytes, at most {SETUP_MAX_BYTES} allowed")


def check_template_ref(failures):
    text = read_text(TEMPLATE_REF, failures)
    if text is None:
        return
    lower = text.lower()
    for needle in TEMPLATE_REQUIRED:
        if needle.lower() not in lower:
            failures.append(f"{TEMPLATE_REF_NAME}: does not contain {needle!r}")
    if not any(
        re.search(r"\bforeman\b", line, re.I) and "name" in line.lower()
        for line in text.splitlines()
    ):
        failures.append(f"{TEMPLATE_REF_NAME}: does not name the template 'foreman'")
    for needle in TEMPLATE_FORBIDDEN:
        if needle in text:
            failures.append(f"{TEMPLATE_REF_NAME}: must not mention {needle!r}")

    if not has_sentence(text, "skip", "only", "quick prototype"):
        failures.append(
            f"{TEMPLATE_REF_NAME}: no sentence says the step is skipped only for 'quick prototype'"
        )
    if not has_sentence(text, "skip", "not itsaplan"):
        failures.append(
            f"{TEMPLATE_REF_NAME}: no sentence says the step is skipped when the tracker is not itsaplan"
        )
    if "never inferred" not in lower and "not inferred" not in lower:
        failures.append(f"{TEMPLATE_REF_NAME}: does not say the skip is 'never inferred' / 'not inferred'")

    if not has_sentence(text, "import", "twice", "never"):
        failures.append(
            f"{TEMPLATE_REF_NAME}: no sentence says an existing template is never imported twice"
        )
    if not any(
        ("missing" in s or "permission" in s) and "report" in s and "guess" in s
        for s in sentences(text)
    ):
        failures.append(
            f"{TEMPLATE_REF_NAME}: no line says a missing tool or permission is reported instead of guessed"
        )
    if not has_sentence(text, "bot account", "never", "agent"):
        failures.append(f"{TEMPLATE_REF_NAME}: no sentence says the agent never adds the bot account")

    german = GERMAN_WORDS.search(text)
    if german:
        failures.append(
            f"{TEMPLATE_REF_NAME}: text must be English, found German word {german.group(0)!r}"
        )


def check_project_skill(failures):
    text = read_text(PROJECT_SKILL, failures)
    size = file_size(PROJECT_SKILL, failures)
    if size is not None and size > PROJECT_MAX_BYTES:
        failures.append(f"{PROJECT_SKILL_NAME}: {size} bytes, at most {PROJECT_MAX_BYTES} allowed")
    if text is None:
        return
    anchor = re.search(r"tracker project", text, re.I)
    if anchor is None:
        failures.append(f"{PROJECT_SKILL_NAME}: no 'Tracker project' step")
        return
    # The itsaplan bullet is the first '   - itsaplan:' line after the 'Tracker project' step.
    bullet_match = ITSAPLAN_BULLET.search(text, anchor.end())
    if bullet_match is None:
        failures.append(f"{PROJECT_SKILL_NAME}: no '   - itsaplan:' bullet under 'Tracker project'")
        return
    bullet = text[bullet_match.start():].splitlines()[0]
    lower = bullet.lower()
    for needle in BULLET_REQUIRED:
        if needle.lower() not in lower:
            failures.append(f"{PROJECT_SKILL_NAME}: itsaplan bullet does not mention {needle!r}")
    if BULLET_OLD_TEXT in lower:
        failures.append(f"{PROJECT_SKILL_NAME}: itsaplan bullet still says '{BULLET_OLD_TEXT}'")


def check_tracker_doc(failures):
    text = read_text(TRACKER_DOC, failures)
    if text is None:
        return
    section = heading_section(text, r"itsaplan")
    if section is None:
        failures.append(f"{TRACKER_DOC_NAME}: no itsaplan section (no heading with 'itsaplan')")
        return
    if TEMPLATE_FILE + ".json" not in section:
        failures.append(f"{TRACKER_DOC_NAME}: itsaplan section does not mention itsaplan-project-template.json")
    if "bot account" not in section.lower():
        failures.append(f"{TRACKER_DOC_NAME}: itsaplan section does not name the bot account")
    if not has_sentence(section, "template", "already exist", "not"):
        failures.append(
            f"{TRACKER_DOC_NAME}: itsaplan section does not say the template does not change existing projects"
        )


def check_install(failures):
    text = read_text(INSTALL_SH, failures)
    if text is None:
        return
    if OLD_INSTALL_TEXT in text:
        failures.append(f"install.sh still contains {OLD_INSTALL_TEXT!r}")
    if not any("itsaplan" in line and "template" in line for line in text.splitlines()):
        failures.append("install.sh: no itsaplan hint line mentions 'template'")


def check_docs(failures):
    for path in [TRACKERS_DOC, MODULES_DOC, README]:
        text = read_text(path, failures)
        if text is not None and TEMPLATE_FILE not in text:
            failures.append(f"{path.relative_to(ROOT)} does not mention {TEMPLATE_FILE}")

    text = read_text(TRACKERS_DOC, failures)
    if text is not None:
        if "check-config" not in text:
            failures.append("docs/trackers.md does not mention check-config")
        if not has_sentence(text, "english name", "check"):
            failures.append(
                "docs/trackers.md: no sentence says the check reports names that are not the English names"
            )


def check_changelog(failures):
    text = read_text(CHANGELOG, failures)
    if text is None:
        return
    head = "\n".join(text.splitlines()[:CHANGELOG_LINES]).lower()
    for word in ["itsaplan", "template"]:
        if word not in head:
            failures.append(f"CHANGELOG.md: no '{word}' within the first {CHANGELOG_LINES} lines")


def check_test_all(failures):
    text = read_text(TEST_ALL, failures)
    if text is not None and TEST_ALL_LINE not in text.splitlines():
        failures.append(f"scripts/test-all.sh does not run '{TEST_ALL_LINE}'")


def main():
    setup_failures = []
    check_setup_skill(setup_failures)
    check_template_ref(setup_failures)

    project_failures = []
    check_project_skill(project_failures)
    check_tracker_doc(project_failures)
    check_install(project_failures)
    check_docs(project_failures)
    check_changelog(project_failures)
    check_test_all(project_failures)

    failures = setup_failures + project_failures
    for failure in failures:
        print(f"FAIL: {failure}", file=sys.stderr)

    if not setup_failures:
        print("ok: foreman-setup imports the itsaplan template once per workspace (reference, size, rules)")
    if not project_failures:
        print("ok: foreman-project, tracker doc, install.sh, docs, CHANGELOG and test-all describe the template")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

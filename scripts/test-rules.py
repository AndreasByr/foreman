#!/usr/bin/env python3
"""Lint: single-source rules, the Cause line, the board check copies and the rendered copies.
Run: python3 scripts/test-rules.py
"""
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REPO_SKILLS = os.path.join("template", ".claude", "skills")
CHAT_SKILLS = os.path.join("plugins", "foreman", "skills")
RENDERED_ROOT = os.path.join(".claude", "skills")
LEARNINGS = os.path.join("docs", "learnings.md")
LEARNINGS_SECTION = "## From foreman itself"

SETS = [("repo skills", REPO_SKILLS), ("chat skills", CHAT_SKILLS)]

MODEL_ID_DUPLICATE = re.compile(r"(?:exact|concrete|full)\s+(?:model\s+)?ids?\b|no\s+alias(?:es)?\b|alias(?:es)?\s+(?:that\s+)?change", re.IGNORECASE)
KEY_FILE_DUPLICATE = re.compile(r"key\s+files?|(?:never|not|no|don't)\s+(?:to\s+)?(?:read|open|cat)\w*\b[^.\n]*\.env|\.env\b[^.\n]*\b(?:never|must not)", re.IGNORECASE)
CLAUDE_DIR_ACTOR = re.compile(r"worker|subagent", re.IGNORECASE)
CLAUDE_DIR_ACTION = re.compile(r"writ|edit|modif|chang", re.IGNORECASE)


def model_id_duplicate(line):
    return MODEL_ID_DUPLICATE.search(line) is not None


def key_file_duplicate(line):
    return KEY_FILE_DUPLICATE.search(line) is not None


def claude_dir_duplicate(line):
    return (
        ".claude/" in line.lower()
        and CLAUDE_DIR_ACTOR.search(line) is not None
        and CLAUDE_DIR_ACTION.search(line) is not None
    )


# (rule name, label, words the labeled line must contain, test that flags an unlabeled duplicate line)
RULES = [
    ("Model ID rule", "**Model ID rule:**", ["exact", "task-*"], model_id_duplicate),
    ("Claude-dir rule", "**Claude-dir rule:**", [".claude/", "worker"], claude_dir_duplicate),
    ("Key-file rule", "**Key-file rule:**", ["existence", "permissions"], key_file_duplicate),
]

# (reason name in errors, word that must appear in a bullet of the learnings section)
LEARNINGS_REASONS = [
    ("model IDs", "model IDs"),
    (".claude/", ".claude/"),
    ("key files", "key files"),
]


def relpath(path, root):
    return os.path.relpath(path, root).replace(os.sep, "/")


def md_files(root, rel_dir):
    found = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(root, rel_dir)):
        dirnames.sort()
        for name in sorted(filenames):
            if name.endswith(".md"):
                found.append(os.path.join(dirpath, name))
    return found


def set_lines(root, rel_dir):
    out = []
    for path in md_files(root, rel_dir):
        with open(path, encoding="utf-8", newline="") as f:
            for number, line in enumerate(f.read().splitlines(), 1):
                out.append((relpath(path, root), number, line))
    return out


def check_set(root, set_name, rel_dir, errors):
    lines = set_lines(root, rel_dir)
    for rule_name, label, required, is_duplicate in RULES:
        labeled = [(f, n, t) for f, n, t in lines if label in t]
        if len(labeled) != 1:
            detail = ""
            if labeled:
                detail = ": " + ", ".join(f"{f}:{n}" for f, n, _ in labeled)
            errors.append(f"{rule_name}: {len(labeled)} occurrences in {set_name} (expected 1){detail}")
        for f, n, t in labeled:
            low = t.lower()
            missing = [w for w in required if w.lower() not in low]
            if missing:
                errors.append(
                    f"{rule_name}: labeled line {f}:{n} in {set_name} lacks {', '.join(repr(w) for w in missing)}"
                )
        for f, n, t in lines:
            if label in t:
                continue
            if is_duplicate(t):
                errors.append(f"duplicate statement of {rule_name} in {f}:{n}")


DELEGATION = "template/.claude/skills/foreman-delegation/SKILL.md"
MILESTONE = "template/.claude/skills/foreman-milestone/SKILL.md"

# (rule name, label or None, owner file or None, words the labeled line must contain, detector regex)
SINGLE_SOURCE = [
    ("Review gate", "**Review gate:**", DELEGATION, ["validation", "needs-input"],
     re.compile(r"at most (?:2|two)\b[^.\n]{0,20}rounds?", re.IGNORECASE)),
    ("Hand nothing on", "**Hand nothing on:**", DELEGATION, ["temporarily", "second account"],
     re.compile(r"temporarily", re.IGNORECASE)),
    ("Evidence rule", "**Evidence rule:**", DELEGATION, ["command", "exit code", "SHA"],
     re.compile(r"command,?\s+exit code,?\s+and\s+(?:commit\s+)?sha", re.IGNORECASE)),
    ("Board check", "**Board check:**", MILESTONE, ["design board", "needs-input"],
     re.compile(r"board missing for", re.IGNORECASE)),
    ("Version rule", None, None, [],
     re.compile(r"human sets the (?:version )?number|never decides a version", re.IGNORECASE)),
]

PRINCIPLES = os.path.join("docs", "PRINCIPLES.md")
PRINCIPLES_ROUNDS = re.compile(r"(?:three|3)\s+(?:rework\s+|review\s+)?rounds", re.IGNORECASE)

# Drift guard: intervention.md owns the Cause rule; milestone and fixpack keep the one-line mention.
# The M011 test only requires the word **Cause:** there; this guard keeps the line identical in the three files.
CAUSE_LINE = "**Cause:** <category> · <one sentence>"
CAUSE_FILES = [
    "template/.claude/skills/foreman-dispatch-run/references/intervention.md",
    "template/.claude/skills/foreman-milestone/SKILL.md",
    "template/.claude/skills/foreman-fixpack/SKILL.md",
]


def check_cause_line(root, errors):
    for rel in CAUSE_FILES:
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            errors.append(f"Cause line: {rel} is missing")
            continue
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
        if not any(CAUSE_LINE in line for line in text.splitlines()):
            errors.append(f'Cause line: {rel} lacks the line "{CAUSE_LINE}"')


# Board check copy: the rule is kept in two places on purpose (slice in foreman-milestone, point in
# foreman-fixpack, because a fix pack run does not load the milestone skill). Both lines carry both texts.
BOARD_MARK = "Board check"
BOARD_TEXTS = ["docs/design-reference/", "The Agent creates no boards"]
BOARD_FILES = [
    "template/.claude/skills/foreman-milestone/SKILL.md",
    "template/.claude/skills/foreman-fixpack/SKILL.md",
]


def check_board_copy(root, errors):
    for rel in BOARD_FILES:
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            errors.append(f"Board check: {rel} is missing")
            continue
        with open(path, encoding="utf-8", newline="") as f:
            lines = [line for line in f.read().splitlines() if BOARD_MARK in line]
        if not lines:
            errors.append(f"Board check: {rel} has no Board check line")
            continue
        if any(all(t in line for t in BOARD_TEXTS) for line in lines):
            continue
        for t in BOARD_TEXTS:
            if t not in lines[0]:
                errors.append(f"Board check: {rel} line lacks '{t}'")


def check_single_source(root, errors):
    lines = set_lines(root, REPO_SKILLS)
    for name, label, owner, required, detector in SINGLE_SOURCE:
        labeled = []
        if label is not None:
            labeled = [(f, n, t) for f, n, t in lines if label in t]
            if len(labeled) != 1:
                detail = ""
                if labeled:
                    detail = ": " + ", ".join(f"{f}:{n}" for f, n, _ in labeled)
                errors.append(f"{name}: {len(labeled)} occurrences in repo skills (expected 1){detail}")
            for f, n, t in labeled:
                if f != owner:
                    errors.append(f"{name}: labeled line must be in {owner}, found in {f}:{n}")
                low = t.lower()
                missing = [w for w in required if w.lower() not in low]
                if missing:
                    errors.append(f"{name}: labeled line {f}:{n} lacks {', '.join(repr(w) for w in missing)}")
        labeled_keys = {(f, n) for f, n, _ in labeled}
        for f, n, t in lines:
            if (f, n) in labeled_keys:
                continue
            if detector.search(t):
                errors.append(f"duplicate statement of {name} in {f}:{n}")


def check_principles(root, errors):
    path = os.path.join(root, PRINCIPLES)
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8", newline="") as f:
        for number, line in enumerate(f.read().splitlines(), 1):
            if PRINCIPLES_ROUNDS.search(line):
                errors.append(f"docs/PRINCIPLES.md:{number}: review rounds are two, as in foreman-delegation")


def check_rendered(root, errors):
    template_dir = os.path.join(root, REPO_SKILLS)
    rendered_dir = os.path.join(root, RENDERED_ROOT)
    for dirpath, dirnames, filenames in os.walk(rendered_dir):
        dirnames.sort()
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            template = os.path.join(template_dir, os.path.relpath(path, rendered_dir))
            if not os.path.isfile(template):
                continue
            with open(template, "rb") as f:
                expected = f.read().replace(b"{{PROJECT_NAME}}", b"foreman")
            with open(path, "rb") as f:
                actual = f.read()
            if actual != expected:
                errors.append(f"rendered copy differs from template: {relpath(path, root)}")


def check_learnings(root, errors):
    path = os.path.join(root, LEARNINGS)
    if not os.path.isfile(path):
        errors.append(f"{LEARNINGS}: file missing")
        return
    with open(path, encoding="utf-8", newline="") as f:
        lines = f.read().splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.strip() == LEARNINGS_SECTION:
            start = i
            break
    if start is None:
        errors.append(f"{LEARNINGS}: missing section '{LEARNINGS_SECTION}'")
        return
    body = []
    for line in lines[start + 1:]:
        if line.startswith("## "):
            break
        body.append(line)
    bullets = [b.strip().lower() for b in body if b.lstrip().startswith(("- ", "* ", "+ "))]
    for reason, word in LEARNINGS_REASONS:
        if not any(word.lower() in b for b in bullets):
            errors.append(f"{LEARNINGS}: section '{LEARNINGS_SECTION}' has no bullet about {reason}")


def check(root):
    errors = []
    for set_name, rel_dir in SETS:
        check_set(root, set_name, rel_dir, errors)
    check_single_source(root, errors)
    check_principles(root, errors)
    check_cause_line(root, errors)
    check_board_copy(root, errors)
    check_rendered(root, errors)
    check_learnings(root, errors)
    return errors


# ---- self-tests against synthetic repositories ----

RULE_LINES = (
    "# Demo skill\n"
    "\n"
    "- **Model ID rule:** pass the exact model ID to each task-* worker.\n"
    "- **Claude-dir rule:** workers never write into .claude/ itself.\n"
    "- **Key-file rule:** check the existence and permissions of key files first.\n"
)
TEMPLATE_TEXT = RULE_LINES + "\n# {{PROJECT_NAME}} demo\n"
RENDERED_TEXT = TEMPLATE_TEXT.replace("{{PROJECT_NAME}}", "foreman")
LEARNINGS_OK = (
    "# Learnings\n"
    "\n"
    "## From foreman itself\n"
    "\n"
    "- Pin the model IDs in config, not in prompts.\n"
    "- Keep .claude/ hooks out of worker reach.\n"
    "- Check key files before each run.\n"
    "\n"
    "## From the reference project\n"
    "\n"
    "- Unrelated.\n"
)


DELEGATION_TEXT = (
    "# Delegation\n"
    "\n"
    "- **Review gate:** at most 2 rework rounds, then the validation role decides or the task goes to needs-input.\n"
    "- **Hand nothing on:** a blocked step is only temporarily open; use a second account instead of passing it on.\n"
    "- **Evidence rule:** every claim names the command, exit code and commit SHA.\n"
    "\n"
    "# {{PROJECT_NAME}} delegation\n"
)
MILESTONE_TEXT = (
    "# Milestone\n"
    "\n"
    "- **Board check:** without an approved design board in docs/design-reference/ the slice goes to needs-input. The Agent creates no boards.\n"
    "- Every needs-input writes the **Cause:** <category> · <one sentence> line.\n"
    "\n"
    "# {{PROJECT_NAME}} milestone\n"
)
FIXPACK_TEXT = (
    "# Fix pack\n"
    "\n"
    "- Board check (planning): board file under docs/design-reference/ ... The Agent creates no boards.\n"
    "- Every needs-input writes the **Cause:** <category> · <one sentence> line.\n"
    "\n"
    "# {{PROJECT_NAME}} fix pack\n"
)
INTERVENTION_TEXT = "# Intervention\n\n- Every needs-input writes the **Cause:** <category> · <one sentence> line.\n"


def good_files():
    return {
        "template/.claude/skills/demo/SKILL.md": TEMPLATE_TEXT,
        "template/.claude/skills/foreman-delegation/SKILL.md": DELEGATION_TEXT,
        "template/.claude/skills/foreman-milestone/SKILL.md": MILESTONE_TEXT,
        "template/.claude/skills/foreman-fixpack/SKILL.md": FIXPACK_TEXT,
        "template/.claude/skills/foreman-dispatch-run/references/intervention.md": INTERVENTION_TEXT,
        "plugins/foreman/skills/demo/SKILL.md": RULE_LINES,
        ".claude/skills/foreman-fixpack/SKILL.md": FIXPACK_TEXT.replace("{{PROJECT_NAME}}", "foreman"),
        ".claude/skills/demo/SKILL.md": RENDERED_TEXT,
        ".claude/skills/foreman-delegation/SKILL.md": DELEGATION_TEXT.replace("{{PROJECT_NAME}}", "foreman"),
        ".claude/skills/foreman-milestone/SKILL.md": MILESTONE_TEXT.replace("{{PROJECT_NAME}}", "foreman"),
        "docs/learnings.md": LEARNINGS_OK,
    }


def write_tree(root, files):
    for rel, text in files.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)


def run_case(files, predicate):
    with tempfile.TemporaryDirectory() as root:
        write_tree(root, files)
        return predicate(check(root))


def case_correct():
    return run_case(good_files(), lambda errors: errors == [])


def case_chat_missing_rule():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES.replace(
        "- **Model ID rule:** pass the exact model ID to each task-* worker.\n", ""
    )
    return run_case(
        files,
        lambda errors: any("Model ID rule: 0 occurrences in chat skills (expected 1)" in e for e in errors),
    )


def case_repo_rule_twice():
    files = good_files()
    files["template/.claude/skills/demo/extra.md"] = (
        "- **Model ID rule:** again, the exact model ID for task-* workers.\n"
    )

    def predicate(errors):
        return any(
            e.startswith("Model ID rule: 2 occurrences in repo skills (expected 1)")
            and "template/.claude/skills/demo/SKILL.md" in e
            and "template/.claude/skills/demo/extra.md" in e
            for e in errors
        )

    return run_case(files, predicate)


def case_unlabeled_duplicate():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nAlways use the exact model ID for each task-* worker.\n"
    )
    return run_case(
        files,
        lambda errors: any(
            e.startswith("duplicate statement of Model ID rule in plugins/foreman/skills/demo/SKILL.md:")
            for e in errors
        ),
    )


def case_unlabeled_claude_dir_duplicate():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nWorkers must not write anything under .claude/ on their own.\n"
    )
    return run_case(
        files,
        lambda errors: any(
            e.startswith("duplicate statement of Claude-dir rule in plugins/foreman/skills/demo/SKILL.md:")
            for e in errors
        ),
    )


def case_rendered_differs():
    files = good_files()
    files[".claude/skills/demo/SKILL.md"] = RENDERED_TEXT.replace("demo", "stale demo")
    return run_case(
        files,
        lambda errors: any(
            "rendered copy differs from template" in e and ".claude/skills/demo/SKILL.md" in e for e in errors
        ),
    )


def case_learnings_without_section():
    files = good_files()
    files["docs/learnings.md"] = "# Learnings\n\n## Other\n\n- Something else.\n"
    return run_case(files, lambda errors: any("missing section" in e for e in errors))


def case_unlabeled_model_id_phrase():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nWrite exact IDs, no aliases.\n"
    )
    return run_case(
        files,
        lambda errors: any(
            e.startswith("duplicate statement of Model ID rule in plugins/foreman/skills/demo/SKILL.md:")
            for e in errors
        ),
    )


def case_unlabeled_key_file_phrase():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nNever read .env files in a worker session.\n"
    )
    return run_case(
        files,
        lambda errors: any(
            e.startswith("duplicate statement of Key-file rule in plugins/foreman/skills/demo/SKILL.md:")
            for e in errors
        ),
    )


def case_unlabeled_rephrased(text, rule_name):
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + ("\n" + text + "\n")
    return run_case(
        files,
        lambda errors: any(
            e.startswith(f"duplicate statement of {rule_name} in plugins/foreman/skills/demo/SKILL.md:")
            for e in errors
        ),
    )


def case_labeled_missing_required_word():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES.replace(
        "pass the exact model ID to each task-* worker.", "pass the model ID to each worker."
    )
    return run_case(
        files,
        lambda errors: any(
            e.startswith("Model ID rule: labeled line plugins/foreman/skills/demo/SKILL.md:")
            and "lacks 'exact', 'task-*'" in e
            for e in errors
        ),
    )


def case_clean_tree_passes():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nRun the test suite before every push.\nKeep the changelog short.\n"
    )
    return run_case(files, lambda errors: errors == [])


EXTRA = "template/.claude/skills/demo/extra.md"
DELEGATION_PATH = "template/.claude/skills/foreman-delegation/SKILL.md"
MILESTONE_PATH = "template/.claude/skills/foreman-milestone/SKILL.md"
FIXPACK_PATH = "template/.claude/skills/foreman-fixpack/SKILL.md"


def case_ss_expect(files, needle):
    return run_case(files, lambda errors: any(needle in e for e in errors))


def case_ss_second_labeled_line():
    files = good_files()
    files[EXTRA] = "- **Review gate:** at most 2 rounds, validation, needs-input.\n"
    return run_case(
        files,
        lambda errors: any(
            e.startswith("Review gate: 2 occurrences in repo skills (expected 1)") for e in errors
        ),
    )


def case_ss_wrong_file():
    files = good_files()
    files[DELEGATION_PATH] = DELEGATION_TEXT.replace("- **Evidence rule:**", "- Evidence rule:")
    files[EXTRA] = "- **Evidence rule:** command, exit code and commit SHA.\n"
    return case_ss_expect(files, f"Evidence rule: labeled line must be in {DELEGATION_PATH}, found in {EXTRA}:1")


def case_ss_missing_owner_line():
    files = good_files()
    files[MILESTONE_PATH] = "# Milestone\n"
    files[".claude/skills/foreman-milestone/SKILL.md"] = "# Milestone\n"
    return case_ss_expect(files, "Board check: 0 occurrences in repo skills (expected 1)")


def case_ss_unlabeled(text, name):
    files = good_files()
    files[EXTRA] = text + "\n"
    return case_ss_expect(files, f"duplicate statement of {name} in {EXTRA}:1")


def case_ss_pointer_ok():
    files = good_files()
    files[EXTRA] = "Review gate: see foreman-delegation.\nBoard check: see foreman-milestone.\n"
    return run_case(files, lambda errors: errors == [])


def case_principles(text, expect_error):
    files = good_files()
    files["docs/PRINCIPLES.md"] = text
    if expect_error:
        return case_ss_expect(files, "docs/PRINCIPLES.md:3: review rounds are two, as in foreman-delegation")
    return run_case(files, lambda errors: errors == [])


def cause_files(replace_in=None):
    """good_files (all three Cause-line files exist); replace_in names one file whose <category> becomes <kind>."""
    files = good_files()
    if replace_in is not None:
        text = files[replace_in].replace(CAUSE_LINE, CAUSE_LINE.replace("<category>", "<kind>"))
        files[replace_in] = text
        rendered = replace_in.replace("template/", "", 1)
        if rendered in files:
            files[rendered] = text.replace("{{PROJECT_NAME}}", "foreman")
    return files


def case_cause_file_missing():
    files = good_files()
    del files[CAUSE_FILES[0]]
    needle = f"Cause line: {CAUSE_FILES[0]} is missing"
    return run_case(files, lambda errors: any(needle in e for e in errors))


def case_board_ok():
    return run_case(good_files(), lambda errors: errors == [])


def case_board_fixpack_lacks_text():
    files = good_files()
    text = FIXPACK_TEXT.replace(" The Agent creates no boards.", "")
    files[FIXPACK_PATH] = text
    files[".claude/skills/foreman-fixpack/SKILL.md"] = text.replace("{{PROJECT_NAME}}", "foreman")
    needle = f"Board check: {FIXPACK_PATH} line lacks 'The Agent creates no boards'"
    return run_case(files, lambda errors: any(needle in e for e in errors))


def case_board_milestone_lacks_text():
    files = good_files()
    text = MILESTONE_TEXT.replace("in docs/design-reference/ ", "")
    files[MILESTONE_PATH] = text
    files[".claude/skills/foreman-milestone/SKILL.md"] = text.replace("{{PROJECT_NAME}}", "foreman")
    needle = f"Board check: {MILESTONE_PATH} line lacks 'docs/design-reference/'"
    return run_case(files, lambda errors: any(needle in e for e in errors))


def case_cause_ok():
    return run_case(cause_files(), lambda errors: errors == [])


def case_cause_drift():
    rel = CAUSE_FILES[2]
    needle = f'Cause line: {rel} lacks the line "{CAUSE_LINE}"'
    return run_case(cause_files(replace_in=rel), lambda errors: any(needle in e for e in errors))


SELFTESTS = [
    ("correct tree gives no errors", case_correct),
    ("Cause line in all three files passes", case_cause_ok),
    ("Cause line with <kind> in one file errors", case_cause_drift),
    ("missing Cause file errors", case_cause_file_missing),
    ("Board check copies in both files pass", case_board_ok),
    ("fixpack Board check line without 'The Agent creates no boards' errors", case_board_fixpack_lacks_text),
    ("milestone Board check line without 'docs/design-reference/' errors", case_board_milestone_lacks_text),
    ("PRINCIPLES.md with '3 rounds' errors", lambda: case_principles(
        "# Principles\n\nWe allow 3 rounds of review.\n", True)),
    ("PRINCIPLES.md with 'three review rounds' errors", lambda: case_principles(
        "# Principles\n\nWe allow three review rounds.\n", True)),
    ("second labeled line in another file errors", case_ss_second_labeled_line),
    ("labeled line in wrong file errors", case_ss_wrong_file),
    ("missing owner line errors", case_ss_missing_owner_line),
    ("unlabeled 'at most 2 rework rounds' errors", lambda: case_ss_unlabeled(
        "Use at most 2 rework rounds per task.", "Review gate")),
    ("unlabeled 'temporarily blocked' errors", lambda: case_ss_unlabeled(
        "A step that is temporarily blocked waits.", "Hand nothing on")),
    ("unlabeled evidence phrase errors", lambda: case_ss_unlabeled(
        "Every report names command, exit code and commit SHA.", "Evidence rule")),
    ("unlabeled 'Board missing for' errors", lambda: case_ss_unlabeled(
        "Board missing for <element> means stop.", "Board check")),
    ("'The human sets the number' in a repo skill errors", lambda: case_ss_unlabeled(
        "The human sets the number.", "Version rule")),
    ("pointer line does not error", case_ss_pointer_ok),
    ("PRINCIPLES.md with 'three rounds' errors", lambda: case_principles(
        "# Principles\n\nWe allow three rounds of review.\n", True)),
    ("PRINCIPLES.md with 'two rounds' passes", lambda: case_principles(
        "# Principles\n\nWe allow two rounds of review.\n", False)),
    ("chat set missing a rule errors", case_chat_missing_rule),
    ("rule twice in repo set errors and lists both files", case_repo_rule_twice),
    ("unlabeled duplicate statement errors", case_unlabeled_duplicate),
    ("unlabeled Claude-dir duplicate errors", case_unlabeled_claude_dir_duplicate),
    ("differing rendered copy errors", case_rendered_differs),
    ("learnings without section errors", case_learnings_without_section),
    ("unlabeled 'Write exact IDs, no aliases' errors", case_unlabeled_model_id_phrase),
    ("unlabeled 'never read .env files' errors", case_unlabeled_key_file_phrase),
    ("labeled line without required words errors", case_labeled_missing_required_word),
    ("unlabeled 'full model ID' errors", lambda: case_unlabeled_rephrased(
        "Use full model ID strings for each task-* worker.", "Model ID rule")),
    ("unlabeled 'concrete model IDs' errors", lambda: case_unlabeled_rephrased(
        "Write concrete model IDs into every task-* config.", "Model ID rule")),
    ("unlabeled 'no aliases' errors", lambda: case_unlabeled_rephrased(
        "No aliases in any task-* worker config.", "Model ID rule")),
    ("unlabeled 'alias that changes' errors", lambda: case_unlabeled_rephrased(
        "Never let an alias that changes silently pick the model.", "Model ID rule")),
    ("unlabeled 'key files' errors", lambda: case_unlabeled_rephrased(
        "Key files stay out of worker prompts.", "Key-file rule")),
    ("unlabeled 'do not open the .env' errors", lambda: case_unlabeled_rephrased(
        "Do not open the .env file in a worker session.", "Key-file rule")),
    ("unlabeled '.env must not reach' errors", lambda: case_unlabeled_rephrased(
        "The .env file must not reach any worker.", "Key-file rule")),
    ("unlabeled subagent edit of .claude/ errors", lambda: case_unlabeled_rephrased(
        "Subagents must not edit anything in .claude/ directly.", "Claude-dir rule")),
    ("unlabeled worker modify of .claude/ errors", lambda: case_unlabeled_rephrased(
        "Workers may not modify .claude/ settings.", "Claude-dir rule")),
    ("clean tree with unrelated lines still passes", case_clean_tree_passes),
]


def main():
    failed = False
    for name, case in SELFTESTS:
        try:
            ok = case()
        except Exception:
            ok = False
        if not ok:
            print(f"SELFTEST FAIL {name}")
            failed = True
    if failed:
        return 1
    if "--selftest-only" in sys.argv[1:]:
        print("selftests ok")
        return 0

    errors = check(ROOT)
    if errors:
        for error in errors:
            print(f"RULES LINT: {error}")
        return 1
    print("rules lint: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())

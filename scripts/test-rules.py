#!/usr/bin/env python3
"""Lint: three rules must each stand exactly once in the repo skills and once in the chat skills.
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

MODEL_ID_DUPLICATE = re.compile(r"exact\s+(?:model\s+)?ids?\b", re.IGNORECASE)
KEY_FILE_DUPLICATE = re.compile(r"key\s+files?|never\s+read\s+\S*\.env", re.IGNORECASE)


def model_id_duplicate(line):
    return MODEL_ID_DUPLICATE.search(line) is not None


def key_file_duplicate(line):
    return KEY_FILE_DUPLICATE.search(line) is not None


def claude_dir_duplicate(line):
    low = line.lower()
    return all(w in low for w in (".claude/", "worker", "writ"))


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


def good_files():
    return {
        "template/.claude/skills/demo/SKILL.md": TEMPLATE_TEXT,
        "plugins/foreman/skills/demo/SKILL.md": RULE_LINES,
        ".claude/skills/demo/SKILL.md": RENDERED_TEXT,
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


def case_clean_tree_passes():
    files = good_files()
    files["plugins/foreman/skills/demo/SKILL.md"] = RULE_LINES + (
        "\nRun the test suite before every push.\nKeep the changelog short.\n"
    )
    return run_case(files, lambda errors: errors == [])


SELFTESTS = [
    ("correct tree gives no errors", case_correct),
    ("chat set missing a rule errors", case_chat_missing_rule),
    ("rule twice in repo set errors and lists both files", case_repo_rule_twice),
    ("unlabeled duplicate statement errors", case_unlabeled_duplicate),
    ("unlabeled Claude-dir duplicate errors", case_unlabeled_claude_dir_duplicate),
    ("differing rendered copy errors", case_rendered_differs),
    ("learnings without section errors", case_learnings_without_section),
    ("unlabeled 'Write exact IDs, no aliases' errors", case_unlabeled_model_id_phrase),
    ("unlabeled 'never read .env files' errors", case_unlabeled_key_file_phrase),
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

    errors = check(ROOT)
    if errors:
        for error in errors:
            print(f"RULES LINT: {error}")
        return 1
    print("rules lint: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())

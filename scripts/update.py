#!/usr/bin/env python3
"""foreman update mode: python3 scripts/update.py <target> [--dry-run]

Normally called through `./install.sh <target> --update [--dry-run]`.
Plans everything first (all preconditions), writes afterwards. Python 3 standard library only.
"""
import json
import difflib
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(HERE, "template")
GATEWAY = os.path.join(HERE, "gateway")
GATEWAY_FILES = ("README.md", "litellm.config.example.yaml")

# Skip rules: these mirror skip_file() in install.sh. Keep both in sync.
AUTOPILOT_OFF = ("docs/routines/", "scripts/autopilot-check.", "scripts/test-autopilot-check.mjs",
                 "scripts/lib/autopilot-check.mjs", ".claude/skills/foreman-dispatch-run/")
PRETEST_OFF = (".claude/skills/foreman-pretest/", "scripts/pretest-run.mjs", "scripts/pretest-prepare.sh",
               "scripts/pretest/", "scripts/test-pretest.mjs", "scripts/lib/pretest-run.mjs", "docs/test-login.md")


def die(code, msg):
    sys.stderr.write("foreman update: %s\n" % msg)
    sys.exit(code)


def skip_file(rel, scope, modules, agent):
    if scope == "docs" and not rel.startswith("docs/"):
        return True
    if "autopilot" not in modules and rel.startswith(AUTOPILOT_OFF):
        return True
    if "pretest" not in modules and rel.startswith(PRETEST_OFF):
        return True
    if rel == "AGENTS.md" and agent == "claude-code":
        return True
    return False


def vtuple(s):
    m = re.match(r"\s*v?(\d+)\.(\d+)\.(\d+)", s)
    if not m:
        return None
    return tuple(int(p) for p in m.groups())


def contained(real_target, path):
    """True if the deepest existing part of path resolves inside real_target."""
    p = path
    while not os.path.lexists(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    real = os.path.realpath(p)
    return real == real_target or real.startswith(real_target + os.sep)


def read_bytes(path):
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError:
        return None


def write_atomic(path, data, mode):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".foreman-tmp-")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main(argv):
    target, dry = None, False
    for a in argv:
        if a == "--dry-run":
            dry = True
        elif a.startswith("-"):
            die(2, "unknown option: %s (only --dry-run is allowed with --update)" % a)
        elif target is None:
            target = a
        else:
            die(2, "more than one target given")
    if not target:
        die(2, "no target given")
    if not os.path.isdir(target):
        die(2, "target not found: %s" % target)
    target = os.path.abspath(target)
    real_target = os.path.realpath(target)

    # --- .foreman.json
    conf_path = os.path.join(target, ".foreman.json")
    if not contained(real_target, conf_path):
        die(2, ".foreman.json resolves outside the target")
    raw = read_bytes(conf_path)
    if raw is None:
        die(2, ".foreman.json not found in %s" % target)
    try:
        conf_text = raw.decode("utf-8")
        conf = json.loads(conf_text)
    except ValueError:
        die(2, ".foreman.json is not valid JSON")
    if not isinstance(conf, dict) or not isinstance(conf.get("foreman"), str) or not conf["foreman"]:
        die(2, ".foreman.json has no \"foreman\" version string")
    old = conf["foreman"]
    project = conf.get("project")
    if not isinstance(project, str) or not project:
        die(2, ".foreman.json has no \"project\"")
    name = conf.get("name") if isinstance(conf.get("name"), str) and conf.get("name") else project
    modules = conf.get("modules", [])
    if not isinstance(modules, list) or not all(isinstance(m, str) for m in modules):
        die(2, ".foreman.json: \"modules\" must be a list of strings")
    agent = conf.get("agent", "claude-code")
    if not isinstance(agent, str):
        die(2, ".foreman.json: \"agent\" must be a string")
    scope = conf.get("scope")
    if not isinstance(scope, str) or not scope:
        scope = "autopilot" if "autopilot" in modules else "repo"

    # --- versions
    vfile = read_bytes(os.path.join(HERE, "VERSION"))
    if vfile is None:
        die(2, "VERSION file of the foreman checkout not found")
    new = vfile.decode("utf-8", "replace").strip()
    vo, vn = vtuple(old), vtuple(new)
    if vo is None or vn is None:
        die(2, "cannot compare versions: %s -> %s" % (old, new))
    if vo > vn:
        die(2, "project version %s is newer than this foreman checkout (%s)" % (old, new))

    # --- session model
    model = "opus"
    settings_path = os.path.join(target, ".claude", "settings.json")
    if not contained(real_target, settings_path):
        die(2, ".claude/settings.json resolves outside the target")
    sraw = read_bytes(settings_path)
    if sraw is not None:
        try:
            m = json.loads(sraw.decode("utf-8")).get("model")
            if isinstance(m, str) and m:
                model = m
        except (ValueError, AttributeError):
            pass
    repl = (("{{PROJECT}}", project), ("{{PROJECT_NAME}}", name), ("{{SCOPE}}", scope),
            ("{{MODULES}}", ",".join(modules) or "none"), ("{{AGENT}}", agent), ("{{SESSION_MODEL}}", model))

    def render(data):
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            return data
        for k, v in repl:
            text = text.replace(k, v)
        return text.encode("utf-8")

    # --- classes
    try:
        with open(os.path.join(HERE, "update-classes.json"), encoding="utf-8") as fh:
            classes = json.load(fh)["classes"]
    except (OSError, ValueError, KeyError):
        die(2, "update-classes.json is missing or invalid")

    def class_of(rel):
        for cls, entries in classes.items():
            for e in entries:
                if rel == e or (e.endswith("/") and rel.startswith(e)):
                    return cls
        return None

    # --- sources: (rel, src path, force class)
    sources = []
    for root, dirs, files in os.walk(TEMPLATE):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        for f in files:
            if f.endswith(".pyc"):
                continue
            src = os.path.join(root, f)
            rel = os.path.relpath(src, TEMPLATE).replace(os.sep, "/")
            if skip_file(rel, scope, modules, agent):
                continue
            sources.append((rel, src, None))
    if "gateway" in modules:
        for g in GATEWAY_FILES:
            sources.append(("tools/gateway/" + g, os.path.join(GATEWAY, g), "foreman"))
    sources.sort(key=lambda s: s[0])

    # --- plan
    mixed_keep = []  # (rel, current bytes, template bytes)
    plan = []  # (action, rel, data, mode, note)
    counts = {"new": 0, "update": 0, "create": 0, "keep": 0, "unchanged": 0}
    for rel, src, forced in sources:
        cls = forced or class_of(rel)
        if cls is None:
            die(2, "template file without a class in update-classes.json: %s" % rel)
        dst = os.path.join(target, *rel.split("/"))
        if not contained(real_target, dst):
            die(2, "%s would resolve outside the target" % rel)
        sdata = read_bytes(src)
        if sdata is None:
            die(2, "cannot read template file: %s" % rel)
        data = sdata if forced else render(sdata)
        mode = 0o755 if os.access(src, os.X_OK) else 0o644
        exists = os.path.lexists(dst)
        cur = read_bytes(dst) if exists else None
        if cls == "foreman":
            if not exists:
                action = "new"
            elif cur is not None and cur == data:
                action = "unchanged"
            else:
                action = "update"
        elif cls == "project":
            action = "create" if not exists else ("unchanged" if cur == data else "keep")
        elif cls == "mixed":
            action = "create" if not exists else ("unchanged" if cur == data else "keep")
        else:
            die(2, "unknown class %r for %s" % (cls, rel))
        counts[action] += 1
        if cls == "mixed" and action == "keep" and cur is not None:
            mixed_keep.append((rel, cur, data))
        if action != "unchanged":
            plan.append((action, rel, data, mode, "  (mixed: merge by hand)" if (cls == "mixed" and action == "keep") else ""))

    # --- dirty check
    to_update = [p[1] for p in plan if p[0] == "update" and os.path.lexists(os.path.join(target, *p[1].split("/")))]
    git_note = False
    if to_update:
        env = dict(os.environ, GIT_OPTIONAL_LOCKS="0")
        try:
            inside = subprocess.run(["git", "-C", target, "rev-parse", "--is-inside-work-tree"],
                                    capture_output=True, env=env)
            in_tree = inside.returncode == 0 and inside.stdout.strip() == b"true"
        except OSError:
            in_tree = False
        if not in_tree:
            git_note = True
        else:
            try:
                res = subprocess.run(["git", "-C", target, "status", "--porcelain", "-z", "--no-renames", "--"]
                                     + to_update, capture_output=True, check=True, env=env)
            except (OSError, subprocess.CalledProcessError):
                die(2, "cannot run git status in %s" % target)
            dirty = [e[3:].decode("utf-8", "replace") for e in res.stdout.split(b"\0") if len(e) > 3]
            if dirty:
                die(2, "uncommitted changes in foreman files that would be overwritten (commit or stash them): %s"
                    % ", ".join(dirty))

    # --- version bump text
    bump = None
    if vo < vn:
        bump_text, n = re.subn(r'("foreman"\s*:\s*")[^"]*(")', lambda m: m.group(1) + new + m.group(2), conf_text, count=1)
        try:
            ok = n == 1 and json.loads(bump_text).get("foreman") == new
        except ValueError:
            ok = False
        if not ok:
            die(2, "cannot replace the \"foreman\" value in .foreman.json")
        bump = bump_text.encode("utf-8")

    # --- report
    out = ["foreman update: %s -> %s" % (old, new), "target: %s" % target]
    if git_note:
        out.append("note: not a git repository, local changes not checked")
    if dry:
        out.append("(dry run, nothing written)")
    for action, rel, _d, _m, note in plan:
        out.append("  %s  %s%s" % (action, rel, note))
    out.append("summary: %d new, %d update, %d create, %d keep, %d unchanged" % (
        counts["new"], counts["update"], counts["create"], counts["keep"], counts["unchanged"]))
    for rel, cur, tdata in mixed_keep:
        try:
            cl, tl = cur.decode("utf-8").splitlines(), tdata.decode("utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        dl = list(difflib.unified_diff(cl, tl, fromfile="current", tofile="template", lineterm=""))
        out.append("diff %s (current vs template):" % rel)
        out.extend(dl[:60])
        if len(dl) > 60:
            out.append("... (%d more lines)" % (len(dl) - 60))
    writes = [p for p in plan if p[0] in ("new", "update", "create")]
    if not writes:
        out.append("nothing to do")
    out.append("foreman update: dry run, nothing written" if dry else "foreman update: done")

    if not dry:
        for action, rel, data, mode, _n in writes:
            dst = os.path.join(target, *rel.split("/"))
            try:
                if os.path.isfile(dst):
                    mode = (os.stat(dst).st_mode & 0o7777) | (mode & 0o111)
                write_atomic(dst, data, mode)
            except OSError as e:
                sys.stdout.flush()
                sys.stderr.write("foreman update: write failed: %s: %s\n" % (dst, e.strerror or e))
                sys.exit(1)
        if bump is not None:
            try:
                write_atomic(conf_path, bump, os.stat(conf_path).st_mode & 0o7777)
            except OSError as e:
                sys.stderr.write("foreman update: write failed: %s: %s\n" % (conf_path, e.strerror or e))
                sys.exit(1)
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1:])

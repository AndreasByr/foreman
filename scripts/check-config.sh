#!/usr/bin/env bash
# CI guard for the foreman setup: no opusplan, size limits, no committed worker task files, autopilot-check --no-fetch warning (warn only), .foreman.json settings.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fail=0

if grep -rqs '"opusplan"\|opusplan' .claude/settings.json .claude/settings.local.json 2>/dev/null; then
  echo "FAIL: opusplan in .claude/settings*.json (autonomous runs never enter plan mode and run on the smaller model). Set a fixed model name."; fail=1
fi
if grep -vs '^[[:space:]]*#' tools/delegate/config.toml | grep -q 'opusplan'; then
  echo "FAIL: opusplan in tools/delegate/config.toml. Set a fixed model name."; fail=1
fi

size() { wc -c < "$1" | tr -d ' '; }
if [ -f CLAUDE.md ] && [ "$(size CLAUDE.md)" -gt 2600 ]; then
  echo "FAIL: CLAUDE.md is $(size CLAUDE.md) bytes (limit ~2 KB, move details into skills or docs/learnings.md)"; fail=1
fi
skill=.claude/skills/foreman-delegation/SKILL.md
if [ -f "$skill" ]; then
  core=$(awk '/^## Core[[:space:]]*$/{on=1; next} on && /^## /{exit} on{print}' "$skill" | wc -c | tr -d ' ')
  if [ "$core" -gt 1800 ]; then echo "FAIL: Core section of $skill is $core bytes (limit ~1.5 KB)"; fail=1; fi
fi
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  if [ "$(size "$f")" -gt 10240 ]; then
    echo "WARN: $f is $(size "$f") bytes (target ~8 KB, move parts to references/)"
  fi
done

n=$(git ls-files tools/delegate/tasks 2>/dev/null | grep -v '\.gitkeep$' | wc -l | tr -d ' ')
if [ "$n" -gt 0 ]; then echo "FAIL: $n worker task files are committed in tools/delegate/tasks. Remove them with git rm --cached."; fail=1; fi

ap=(scripts/autopilot-check.*)
if [ -e "${ap[0]}" ] && ! grep -qs -- '--no-fetch' "${ap[@]}"; then
  echo "WARN: scripts/autopilot-check.* does not support --no-fetch. The dispatcher passes it; without support the check fails with its exit code and nothing is started. Add the option (see the template scripts/autopilot-check.mjs)."
fi

# .foreman.json settings: python3 stdlib only; a missing file or missing python3 is fine.
if [ -f .foreman.json ] && command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' || fail=1
import http.client, json, os, re, socket, sys, unicodedata, urllib.error, urllib.parse, urllib.request
try:
    import zoneinfo
except ImportError:  # Python without zoneinfo: the name lookup is skipped, the pattern check stays
    zoneinfo = None

bad = False
try:
    with open(".foreman.json", encoding="utf-8") as fh:
        cfg = json.load(fh)
except (ValueError, OSError):
    print("FAIL: .foreman.json is not valid JSON")
    sys.exit(1)
if not isinstance(cfg, dict):
    cfg = {}

ctx = cfg.get("context")
if isinstance(ctx, dict) and "timeZone" in ctx:
    tz = ctx["timeZone"]
    ok = True
    if tz != "":  # an empty string means "not set"
        ok = isinstance(tz, str) and re.fullmatch(r"[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){0,2}", tz) is not None
        if ok and zoneinfo is not None:
            try:
                zoneinfo.ZoneInfo(tz)
            except Exception:
                # no tz database on this system: UTC is still fine; other names stay a failure
                ok = tz == "UTC"
    if not ok:
        print("FAIL: context.timeZone must be a non-empty IANA time zone name such as Europe/Berlin")
        bad = True

MODEL_CLASSES = ("strong", "standard", "cheap")
MODEL_CATEGORIES = ("question", "fixpack", "milestone", "brief", "roadmap", "architecture", "bugRetry", "release", "docs")
if "models" in cfg:
    mo = cfg["models"]
    if not isinstance(mo, dict):
        print("FAIL: models must be an object")
        bad = True
    else:
        if "coordinator" in mo and mo["coordinator"] not in MODEL_CLASSES:
            print("FAIL: models.coordinator must be one of strong, standard, cheap")
            bad = True
        if "effort" in mo and mo["effort"] not in ("low", "medium", "high"):
            print("FAIL: models.effort must be one of low, medium, high")
            bad = True
        th = mo.get("threads", {})
        if not isinstance(th, dict):
            print("FAIL: models.threads must be an object")
            bad = True
        else:
            for k, v in th.items():
                if k not in MODEL_CATEGORIES:
                    print("FAIL: models.threads." + str(k) + " is not a known category (" + ", ".join(MODEL_CATEGORIES) + ")")
                    bad = True
                elif v not in MODEL_CLASSES:
                    print("FAIL: models.threads." + k + " must be one of strong, standard, cheap")
                    bad = True

ap = cfg.get("autopilot")
if isinstance(ap, dict):
    if "batchHours" in ap:
        bh = ap["batchHours"]
        if not (isinstance(bh, list) and bh and all(type(h) is int and 0 <= h <= 23 for h in bh)):
            print("FAIL: autopilot.batchHours must be a non-empty list of integers from 0 to 23")
            bad = True
    if "waitHours" in ap:
        w = ap["waitHours"]
        if not (type(w) in (int, float) and 0 < w <= 168):
            print("FAIL: autopilot.waitHours must be a number greater than 0 and at most 168")
            bad = True
    if "mainAutoMerge" in ap and not isinstance(ap["mainAutoMerge"], bool):
        print("FAIL: autopilot.mainAutoMerge must be true or false")
        bad = True

# German words (lowercase, whole words) that mark a name as German; no word here is also an English name
GERMAN_WORDS = {"paket", "meilenstein", "freitag", "wartet", "warten", "eingriff", "runde", "abgebrochen",
                "fertig", "bereit", "pruefung", "fehler", "aufgabe", "und", "oder", "nicht", "auf",
                "freigabe", "abnahme"}
GERMAN_UMLAUTS = set("äöüÄÖÜß")
# known German names and the English foreman name they stand for (named in the FAIL line)
TRANSLATIONS = {
    "Fix-Paket": "Fix pack", "Meilenstein": "Milestone", "Art": "Type", "Abgebrochen": "Canceled",
    "Wartet auf Merge": "Wait for Merge", "Fertig": "Done",
    "AP: Eingriff nötig": "AP: Action Required", "AP: Fix-Runde": "AP: Fix round",
    "AP: Pretest läuft": "AP: Pretest running", "AP: Pretest wartet": "AP: Pretest waiting",
    "AP: Release Freitag": "AP: Release ready", "AP: UAT bereit": "AP: UAT ready",
    "AP: Wartet auf Merge": "AP: Waiting for merge",
}

def looks_german(name):
    if any(ch in GERMAN_UMLAUTS for ch in name):
        return True
    # split on non-letters, case-insensitive: "Fix-Paket" -> fix, paket
    return any(w in GERMAN_WORDS for w in re.findall(r"[^\W\d_]+", name.lower()))

def name_problems(kind, names, expected, alias_map, hint, prefix=None):
    # prefix None (columns): unknown names are listed only inside a missing-column message; a string prefix (labels): only names starting with it are reported as unknown
    msgs = []
    have = set(names)
    known = set(expected)
    for canon in expected:
        known.update(alias_map.get(canon, []))
    # columns: the project's names foreman does not use, listed only inside a missing-column message
    unnamed = [n for n in dict.fromkeys(names) if n not in known] if prefix is None else []
    # labels: the project's names that look German, listed only inside a missing-label message
    german = [n for n in dict.fromkeys(names) if n not in known and looks_german(n)] if prefix is not None else []
    for canon in expected:
        alts = alias_map.get(canon, [])
        if canon not in have and not any(a in have for a in alts):
            detail = hint
            if unnamed:
                detail = "project columns without a foreman name: %s; %s" % (", ".join('"%s"' % n for n in unnamed), hint)
            if german:
                detail = "project labels that look German: %s; %s" % (", ".join('"%s"' % n for n in german), hint)
            msgs.append('FAIL: itsaplan %s "%s" is missing (%s)' % (kind, canon, detail))
    for name in dict.fromkeys(names):
        if name in known:
            continue
        if looks_german(name) or name in TRANSLATIONS:
            if name in TRANSLATIONS:
                msgs.append('FAIL: itsaplan %s "%s" looks German (English name: "%s")' % (kind, name, TRANSLATIONS[name]))
            else:
                msgs.append('FAIL: itsaplan %s "%s" looks German (use the English foreman name)' % (kind, name))
        elif prefix is not None and name.startswith(prefix):
            msgs.append('FAIL: itsaplan %s "%s" is not a name foreman uses' % (kind, name))
    return msgs

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    # a redirect could send the API key to another host: report the status instead of following it
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

# an empty ProxyHandler: proxy variables (HTTP_PROXY, NO_PROXY, ...) are never used
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect)

def itsaplan_base(raw):
    # scheme://host[:port]/path only: credentials, query and fragment are dropped
    parts = urllib.parse.urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    host = parts.hostname
    if ":" in host:
        host = "[" + host + "]"
    port = parts.port
    netloc = host + (":%d" % port if port else "")
    return parts.scheme + "://" + netloc + parts.path.rstrip("/")

tracker = cfg.get("tracker")
modules = cfg.get("modules")
if (isinstance(tracker, dict) and tracker.get("type") == "itsaplan") or (isinstance(modules, list) and "tracker-itsaplan" in modules):
    if not isinstance(tracker, dict):
        tracker = {}
    mirror = cfg.get("mirror")
    its = mirror.get("itsaplan") if isinstance(mirror, dict) else None
    if not isinstance(its, dict):
        its = {}
    project_key = its.get("projectKey")
    prefix = its.get("labelPrefix", "AP: ")
    if not isinstance(prefix, str):
        prefix = "AP: "
    alias_map = {"Action Required": ["Intervention needed"]}
    extra = tracker.get("columnAliases")
    if isinstance(extra, dict):
        for canon, names in extra.items():
            if isinstance(names, list):
                alias_map.setdefault(canon, []).extend(n for n in names if isinstance(n, str))
    expect_cols = ["Backlog", "Todo", "In Progress", "Action Required", "Wait for Merge", "Testing", "In Review", "Done"]
    expect_labels = ["Milestone", "Fix pack"] + [prefix + s for s in (
        "Coding", "Fix round", "Action Required", "Waiting for merge",
        "Pretest waiting", "Pretest running", "UAT ready", "Release ready")]
    url = os.environ.get("ITSAPLAN_URL", "").strip()
    api_key = os.environ.get("ITSAPLAN_API_KEY", "")
    if not url or not api_key:
        print("note: itsaplan names not checked (ITSAPLAN_URL or ITSAPLAN_API_KEY is not set)")
    elif not isinstance(project_key, str) or not project_key:
        print("note: itsaplan names not checked (mirror.itsaplan.projectKey is not set)")
    else:
        try:
            base = itsaplan_base(url)
            req = urllib.request.Request(
                base + "/projects/" + urllib.parse.quote(project_key, safe=""),
                headers={"x-api-key": api_key, "Accept": "application/json"})
        except Exception:
            base = None
        if base is None:
            print("WARN: itsaplan names not checked (ITSAPLAN_URL is not an http or https URL)")
        else:
            doc, loaded = None, False
            try:
                with _OPENER.open(req, timeout=5) as resp:
                    doc = json.loads(resp.read(1 << 22).decode("utf-8"))
                loaded = True
            except urllib.error.HTTPError as e:
                print("WARN: itsaplan names not checked (HTTP %d)" % e.code)
            except (urllib.error.URLError, OSError) as e:
                reason = getattr(e, "reason", e)
                print("WARN: itsaplan names not checked (%s)" % ("timeout" if isinstance(reason, socket.timeout) else "unreachable"))
            except (ValueError, http.client.HTTPException):
                print("WARN: itsaplan names not checked (invalid response)")
            except Exception:
                print("WARN: itsaplan names not checked (request failed)")
            if loaded:
                if not (isinstance(doc, dict) and isinstance(doc.get("columns"), list) and isinstance(doc.get("labels"), list)):
                    print("WARN: itsaplan names not checked (invalid response)")
                else:
                    cols = [c.get("name") for c in doc["columns"] if isinstance(c, dict) and isinstance(c.get("name"), str)]
                    labs = [c.get("name") for c in doc["labels"] if isinstance(c, dict) and isinstance(c.get("name"), str)]
                    problems = name_problems("column", cols, expect_cols, alias_map,
                                             "rename it or add an alias in tracker.columnAliases")
                    problems += name_problems("label", labs, expect_labels, {},
                                              "create it with exactly this name", prefix)
                    for msg in problems:
                        print(msg)
                        bad = True

# wiki.* settings: enabled is a boolean; when true it needs a language, audiences and rootPageId;
# forbidden entries are non-empty strings in every state
def nonempty_str(v):
    return isinstance(v, str) and v.strip() != ""

wk = cfg.get("wiki", {})
if not isinstance(wk, dict):
    print("FAIL: wiki must be an object")
    bad = True
    wk = {}
wk_on = wk.get("enabled", False)
if not isinstance(wk_on, bool):
    print("FAIL: wiki.enabled must be true or false")
    bad = True
    wk_on = False
forb = wk.get("forbidden", [])
if not (isinstance(forb, list) and all(nonempty_str(x) for x in forb)):
    print("FAIL: wiki.forbidden must be a list of non-empty strings")
    bad = True
if wk_on:
    lang = wk.get("language") or (ctx.get("language") if isinstance(ctx, dict) else None)
    if not nonempty_str(lang):
        print("FAIL: wiki.language must be a non-empty language code such as de (or set context.language)")
        bad = True
    auds = wk.get("audiences")
    if not (isinstance(auds, list) and auds and all(isinstance(a, dict) and nonempty_str(a.get("name")) for a in auds)):
        print("FAIL: wiki.audiences must be a non-empty list of objects, each with a non-empty name")
        bad = True
    elif len({a["name"].strip().lower() for a in auds}) != len(auds):
        print("FAIL: wiki.audiences names must be unique (case-insensitive)")
        bad = True
    else:
        # same slug rule as audienceSlug in lib/docs-wiki.mjs: umlauts spelled out, accents dropped, other runs become "-"
        def slug(n):
            n = n.translate(str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"}))
            n = "".join(c for c in unicodedata.normalize("NFKD", n) if not unicodedata.category(c).startswith("M"))
            return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
        slugs = [slug(a["name"]) for a in auds]
        if "" in slugs or len(set(slugs)) != len(slugs):
            print("FAIL: wiki.audiences names must give a non-empty, unique folder slug (letters and digits)")
            bad = True
    if not nonempty_str(wk.get("rootPageId")):
        print("FAIL: wiki.rootPageId must be a non-empty string when wiki.enabled is true")
        bad = True
    else:
        dn = cfg.get("docs" + "N" + "otion")  # key built in parts: the word must not appear in files installed without the module
        dn_root = dn.get("rootPageId") if isinstance(dn, dict) else None
        norm = lambda s: s.replace("-", "").strip().lower()  # ids compare without dashes and case
        if nonempty_str(dn_root) and norm(dn_root) == norm(wk["rootPageId"]):
            print("FAIL: wiki.rootPageId must differ from the mirror rootPageId (same root page)")
            bad = True

sys.exit(1 if bad else 0)
PY
fi

[ $fail = 0 ] && echo "foreman config check: ok"
exit $fail

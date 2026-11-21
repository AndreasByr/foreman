#!/usr/bin/env python3
"""Checks a workspace.json file against docs/workspace.schema.json and scans its values for secrets.

Usage: python3 scripts/check-workspace.py <file>

Exit 0 and "workspace: ok" when the file is valid. Otherwise one line per problem,
"workspace: <file>: <json path>: <problem>", and exit 1. Unreadable or non-JSON
files give one problem line and exit 1. Secret values are never printed.

Python stdlib only. The validator covers the schema subset used in
docs/workspace.schema.json and refuses any other keyword instead of skipping it.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "docs" / "workspace.schema.json"

ANNOTATIONS = {"$schema", "title", "description"}
SUPPORTED = ANNOTATIONS | {
    "type", "enum", "const", "required", "properties",
    "additionalProperties", "items", "pattern", "minItems",
}
KNOWN_TYPES = {"object", "array", "string", "integer", "number", "boolean", "null"}

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

SECRET_PATTERNS = [
    ("sk- key", re.compile(r"sk-[A-Za-z0-9_-]{10,}")),
    ("lin_api_ key", re.compile(r"lin_api_")),
    ("ghp_ token", re.compile(r"ghp_")),
    ("ntn_ token", re.compile(r"ntn_")),
    ("secret_ token", re.compile(r"secret_[A-Za-z0-9]{20,}")),
    ("trig_ token", re.compile(r"trig_")),
    ("env_ token", re.compile(r"env_[A-Za-z0-9]{10,}")),
    ("cse_ token", re.compile(r"cse_")),
    ("Bearer token", re.compile(r"Bearer ")),
]
LONG_TOKEN = re.compile(r"[A-Za-z0-9+/_=-]{32,}")
WEBHOOK_HOSTS = {"hooks.slack.com"}
WEBHOOK_PATH_PREFIX = "/api/webhooks/"


class SchemaError(Exception):
    pass


def check_supported(node, where):
    """Refuse schema keywords the validator does not implement."""
    if not isinstance(node, dict):
        raise SchemaError(f"{where} is not an object")
    unknown = sorted(set(node) - SUPPORTED)
    if unknown:
        raise SchemaError(f"unsupported keyword(s) {', '.join(unknown)} at {where}")
    if "type" in node and node["type"] not in KNOWN_TYPES:
        raise SchemaError(f"unknown type at {where}")
    if "additionalProperties" in node and node["additionalProperties"] is not False:
        raise SchemaError(f"only additionalProperties false is supported at {where}")
    for key, sub in node.get("properties", {}).items():
        check_supported(sub, f"{where}/{key}")
    if "items" in node:
        check_supported(node["items"], f"{where}/items")


def load_schema():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    check_supported(schema, "#")
    return schema


def type_ok(value, expected):
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    return value is None


def json_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    return {dict: "object", list: "array", str: "string"}[type(value)]


def same(a, b):
    """Equality that keeps JSON types apart, so true is not 1."""
    return type(a) is type(b) and a == b


def validate(value, schema, path, errors):
    expected = schema.get("type")
    if expected is not None and not type_ok(value, expected):
        errors.append((path, f"expected {expected}, got {json_type(value)}"))
        return
    if "const" in schema and not same(value, schema["const"]):
        errors.append((path, f"must be {json.dumps(schema['const'])}"))
    if "enum" in schema and not any(same(value, opt) for opt in schema["enum"]):
        allowed = ", ".join(json.dumps(opt) for opt in schema["enum"])
        errors.append((path, f"must be one of {allowed}"))
    if isinstance(value, str):
        if CONTROL_CHARS.search(value):
            errors.append((path, "must not contain line breaks or control characters"))
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append((path, f"does not match pattern {schema['pattern']}"))
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append((path, f"needs at least {schema['minItems']} item(s)"))
        if "items" in schema:
            for index, item in enumerate(value):
                validate(item, schema["items"], f"{path}[{index}]", errors)
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append((path, f"missing required field \"{key}\""))
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append((f"{path}.{key}", "unknown field"))
        for key, sub_schema in properties.items():
            if key in value:
                validate(value[key], sub_schema, f"{path}.{key}", errors)


def scan_url(value):
    """Return a problem text when an http(s) URL string carries a secret, else None."""
    try:
        parts = urlsplit(value)
        host = (parts.hostname or "").lower()
    except ValueError:
        return None
    if host in WEBHOOK_HOSTS or parts.path.startswith(WEBHOOK_PATH_PREFIX):
        return "URL is a webhook URL, which is a secret; store only the channel name"
    for segment in parts.path.split("/"):
        if LONG_TOKEN.search(segment) or any(p.search(segment) for _, p in SECRET_PATTERNS):
            return "URL path contains a key-like secret part; store only names"
    return None


def scan_secrets(value, path, errors):
    """Scan every string value (not object keys) for key-like content."""
    if isinstance(value, str):
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(value):
                errors.append((path, f"value looks like a secret ({label}); store only names"))
                return
        if value.startswith(("http://", "https://")):
            problem = scan_url(value)
            if problem:
                errors.append((path, problem))
            return
        if LONG_TOKEN.fullmatch(value):
            errors.append((path, "value is a key-like secret (32+ characters, no spaces); store only names"))
    elif isinstance(value, dict):
        for key, sub in value.items():
            scan_secrets(sub, f"{path}.{key}", errors)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            scan_secrets(item, f"{path}[{index}]", errors)


def main(argv):
    if len(argv) != 2:
        print("usage: python3 scripts/check-workspace.py <file>", file=sys.stderr)
        return 2
    target = argv[1]

    try:
        schema = load_schema()
    except (OSError, ValueError, SchemaError) as exc:
        print(f"workspace: {SCHEMA_PATH}: $: cannot load schema: {exc}")
        return 1

    try:
        text = Path(target).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        print(f"workspace: {target}: $: cannot read file: {exc}")
        return 1

    try:
        data = json.loads(text)
    except ValueError as exc:
        print(f"workspace: {target}: $: not valid JSON: {exc}")
        return 1

    errors = []
    validate(data, schema, "$", errors)
    scan_secrets(data, "$", errors)
    for path, problem in errors:
        print(f"workspace: {target}: {path}: {problem}")
    if errors:
        return 1
    print("workspace: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

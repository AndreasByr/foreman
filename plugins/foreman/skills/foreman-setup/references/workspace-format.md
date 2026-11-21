# workspace.json (format version 1)

## What it is

A short description of the human's setup: which machines exist, which AI subscriptions, notification channel, tracker and gateway. It is written once by foreman-setup and read by later steps (the install `--workspace` option copies its infra part into `.foreman.json`).

It holds **names and roles only, never a value**. No API keys, tokens, passwords, webhook URLs or key contents. For the gateway key it stores the name of the environment variable that holds it (`keyEnv`).

## Where it lives

- Format and rules: `docs/workspace.schema.json` (JSON Schema, draft 2020-12 style).
- Example: `docs/workspace.example.json`.
- The human's own file: wherever they keep it, passed to the installer with `--workspace <file>`. It is not committed by foreman.

## Fields

| Field | Required | Type / values |
|---|---|---|
| `schema` | yes | integer, must be `1` |
| `machines` | yes | array, may be empty. Each item: `name`, `role`, `services` (required); `purposes`, `domain`, `https` (optional) |
| `machines[].name` | yes | lowercase letters, digits, hyphens; starts with a letter or digit |
| `machines[].role` | yes | `server`, `home-server`, `laptop`, `other`, `unbekannt` |
| `machines[].services` | yes | array of `docker`, `coolify`, `itsaplan`, `litellm`, `dispatcher`, `other`, `unbekannt`; may be empty |
| `machines[].purposes` | no | array of `dispatcher-host`, `local-runs`, `app-hosting`, `tracker-host`, `gateway-host`, `other`, `unbekannt` |
| `machines[].domain` | no | `yes`, `no`, `unbekannt` |
| `machines[].https` | no | `yes`, `no`, `unbekannt` |
| `ai.claude.plan` | yes | `none`, `pro`, `max`, `team`, `enterprise`, `api`, `unbekannt` |
| `ai.claude.routinesApiTrigger` | no | `yes`, `no`, `unbekannt` |
| `ai.ollamaCloud.plan` | yes | `none`, `free`, `pro`, `max`, `unbekannt` |
| `ai.chatgpt.plan` | yes | `none`, `plus`, `pro`, `team`, `enterprise`, `unbekannt` |
| `ai.other` | no | array of names, 1 to 40 characters each: letters, digits, space, `.`, `_`, `-` |
| `notification` | yes | array of `mail`, `discord-webhook`, `slack-webhook`, `push`, `none`, `unbekannt`; empty array means no channel |
| `tracker.type` | yes | `itsaplan`, `linear`, `none`, `unbekannt` |
| `tracker.url` | no | `http(s)://host[/path]`; no userinfo, query or fragment |
| `gateway.running` | yes | `yes`, `no`, `unbekannt` |
| `gateway.url` | no | `https://` host with dots, or `http://` only for `localhost` or `127.0.0.1`; no userinfo, query or fragment |
| `gateway.keyEnv` | no | name of an environment variable: uppercase letters, digits, underscore, starting with a letter |
| `chatgptViaGateway` | no | `accepted-risk`, `declined`, `not-asked`, `unbekannt` |
| `agent` | no | `claude-code`, `opencode`, `other`, `unbekannt` |
| `github` | no | `yes`, `no`, `unbekannt` |

No other fields are allowed. An unknown field is an error, so a typo cannot slip through.

## The value `unbekannt`

`unbekannt` is German for "unknown". It is the answer for "I don't know". Every enum field accepts it. The setup never guesses a value: if the human does not know, the field gets `unbekannt`. Optional fields that were not asked can be left out instead; the summary then lists them as gaps marked `(not answered)`.

## Rule: names and roles only

Before a value is written, check that it is a name, a role or a plan, not a secret. The checker refuses:

- strings that look like keys or tokens (`sk-…`, `lin_api_…`, `ghp_…`, `ntn_…`, `secret_…`, `trig_…`, `env_…`, `cse_…`, `Bearer ` followed by a token),
- any string of 32 or more characters without spaces, including `keyEnv`,
- webhook URLs (host `hooks.slack.com`, or a path starting with `/api/webhooks/`) and URLs whose path has a key-like part (a segment of 32 or more characters).

It never prints the matching value, only the path and the kind of match.

## How foreman-setup writes it

1. It asks the short question catalog (see `question-catalog.md`).
2. Each answer maps to one field. A missing answer becomes `unbekannt`, or the optional field is left out.
3. Keys, tokens and webhook URLs are never copied into the file. The setup asks for the variable name (`keyEnv`) instead.
4. It writes the file as JSON with `"schema": 1`, then runs the checker (below) before it reports the file as done.

## How to validate it

```bash
python3 scripts/check-workspace.py path/to/workspace.json
```

- `workspace: ok` and exit 0: valid.
- One line per problem, `workspace: <file>: <json path>: <problem>`, and exit 1. Fix each listed path and run it again.
- An unreadable file or invalid JSON gives one problem line and exit 1.

The checker uses only the Python standard library. The schema is the source of truth; the checker implements the subset of JSON Schema it uses.

# tools/delegate

Wrapper that runs one task file with a worker model. The session plans and accepts; workers read and code.

## Flow

1. Write a task file in `tasks/` (git-ignored), name `<UTC-timestamp>-<4 random chars>-<slug>.md`:
   ```
   ---
   role: execution_simple
   verify: node --test "tests/*.test.mjs"   # exit 0 = done
   files: [src/**, tests/**]                # optional scope
   ---
   Concrete, bounded task with file paths and expected result.
   ```
2. Run: `python3 tools/delegate/run_task.py tools/delegate/tasks/<id>.md`
   Options: `--role`, `--config`, `--workdir`, `--out`, `--no-escalate`, `--dry-run`.
3. Read `tasks/<id>.result.md` (status, findings, short answers). The full worker report is `tasks/<id>.report.md`.
4. Accept: read the diff and run the checks yourself. Never trust the worker's own summary.
5. Exit code 1 means every escalation step failed: the session does the task.

A task without a role is rejected (exit 2). Roles and models live only in `config.toml`.

## Exit codes

`0` done · `1` session takes over · `2` call/config error (missing or unknown role, invalid config, placeholder model) ·
`3` prerequisite missing (`claude` CLI, API key without fallback) · `4` the `verify` command itself is not runnable.

## Isolation

Each worker is a separate `claude -p` process with its own temp `HOME`, only `PATH`, locale and proxy variables, and no host
token. A Claude worker receives only the variable(s) listed in `claude_auth_env`; an Ollama worker only its own key.
Keys are never written to files or logs, and all output is masked. Workers may not use `git`, `rm`, `curl` or `wget`.
Readonly roles (`research`, `planning`, `validation`) get only `Read`, `Glob`, `Grep`.

## Verify

If the task has `verify`, the wrapper runs it once before any worker. A command that is itself broken (exit 126/127,
syntax or usage error, no tests found) aborts with exit 4. A red but valid result is normal; the worker then starts.
After each worker the command runs again; exit 0 = done, otherwise escalate. Assignments at the start of the command
(`A=1 cmd`) and the `[env]` table are set by the wrapper, so workers call checks without prefixes.

## Scope check

If the front matter has `files:` (globs, `**` allowed), the wrapper snapshots all files (mtime, size, hash; workers have no
git) before and after and lists every changed file outside the globs under `## Findings` in the result. A readonly role that
changes anything is a finding too. Findings do not change the exit code; the session treats them as a red check.

## Providers and fallback

`claude/<id>` runs on Anthropic models (subscription). `ollama/<id>` (Ollama Cloud directly) uses the Anthropic-compatible Ollama Cloud endpoint with
the key from the variable named in `api_key_env`. If the Ollama API is unusable (key missing, limit, server, network,
timeout), the wrapper repeats the role with `fallback_model`. A failed task (red `verify`) escalates instead.

## Gateway backend

`gateway/<alias>` sends the worker through your LiteLLM proxy (module `gateway`). Settings live in the `[gateway]` table:
`base_url`, `api_key_env` (the name of the variable that holds a virtual key) and `fallback_model`. The aliases are
`task-simple`, `task-research`, `task-normal`, `task-complex` and `task-testing`. The key reaches only the worker that uses
the gateway. If the proxy is unreachable, the key is missing or a plan limit is exhausted, the wrapper repeats the role with
`fallback_model`, a `claude/<id>` model run through `claude -p` with your Claude subscription. No Anthropic API key is used.
Setup of the proxy: `gateway/README.md` in the foreman repo.

## Dry run

`--dry-run` validates the config and the task file and prints role, provider, model, escalation chain, verify and scope.
It starts nothing and rejects model placeholders that setup has not filled in.

## Tests

`python3 tools/delegate/test_run_task.py`

## Limits

Two limits apply: the number of worker attempts per run (`max_calls_per_run`, default 12; reaching it stops the run with exit 1 and a report) and the requests per provider (`requests_per_minute`, `requests_per_hour` in `[limits.<provider>]`; the wrapper waits for a free slot).
Endpoint providers (`ollama`, `gateway`) retry up to 3 times with growing pauses (`pause_seconds`, doubled after each failure, capped at `max_pause_seconds`), then fall back to `fallback_model`, or to the next role when there is none.
A provider is locked after 3 failures in a row. The lock lasts only for the rest of the run. Every lock appears in the section `## Limits and locks` of the result and report files.
The ledger (`ledger_file`, default `tasks/.limits.json`) records only the call times per provider.
Per-role timeout: a role can set `timeout = <seconds>` in its `[roles.<name>]` block; without it the global `timeout_seconds` from `[defaults]` applies. An attempt that runs out reports the cause `timeout after <N>s`. A value of 0 or below is rejected with exit 2.

## Claude login of workers

Claude workers reuse the login of the running session (`claude_login = "inherit"`, the default). This is required in Claude Code cloud sessions and routines: the login belongs to the session, so a worker with a clean `HOME` and no token fails with "Not logged in". Keys of other providers, trackers and tokens (`ANTHROPIC_API_KEY`, `OLLAMA_API_KEY`, `FOREMAN_GATEWAY_KEY`, `FOREMAN_GATEWAY_URL`, `ITSAPLAN_*`, `LINEAR_*`, `GITHUB_TOKEN`, `*_FIRE_TOKEN`, Discord tokens) are stripped either way.

The gateway variables never reach Claude workers.

`claude_login = "isolated"` gives workers a clean `HOME`; then only `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) logs them in. `ANTHROPIC_API_KEY` is rejected: subscription only.

If a Claude worker still cannot log in, the wrapper stops all further Claude attempts and exits with code 5. The session then gives the same task file to one of its own subagents (model of the role), which runs on the session's login.

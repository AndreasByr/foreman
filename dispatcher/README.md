# Dispatcher

The central, model-free part of the autopilot. A small script on a server or computer of yours checks your projects every 10 minutes and starts work runs. It costs no tokens: it runs `scripts/autopilot-check.sh` in each project (reads `STATE.md` on the remote branches, tracker comments and the clock) and starts one work run per task it prints. This directory is not copied into your projects.

Needs: Node 20+, git, a machine that is on (a small VPS, a home server, a Raspberry Pi), outbound HTTPS, and per project a GitHub (or comparable) repository with the foreman `autopilot` module installed. Setup time: about 15 minutes.

## What it does per project

1. Clones or updates a read-only checkout with a deploy key (read access only).
2. Runs the project's check script (`scripts/autopilot-check.sh --no-fetch`) with a clean environment: only PATH, HOME, LANG and the variables listed in the project's `pass_env` (`NAME` -> name of the variable in the dispatcher environment). Other projects' tokens never reach it. Exit code not 0: nothing is started, the error is logged and sent to the webhook.
3. Parses the output: `TASK|<kind>|<unit>|<info>` lines and `=== PROMPT n <kind> <unit> ===` ... `=== END n ===` blocks (`ENDE` is accepted too). `NOTHING|...` means nothing to do.
4. Starts at most 3 tasks, at most one per unit, and none for a unit it started within `cooldown_minutes` (default 45), so two runs 10 minutes apart never start the same unit twice before the work run took its lock.
5. Fire target:
   - **Claude Code routine (recommended):** `POST` to the routine's fire URL with the headers `Authorization: Bearer <token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01` and the body `{"text": "<order text>"}`. The answer's session URL is logged.
   - **Other agents:** `fire_command`, a shell command that receives the order text on stdin, for example `opencode run`. It runs detached in the project checkout with the same environment rule (only PATH, HOME, LANG and the `pass_env` names) plus `FOREMAN_PROJECT`, `FOREMAN_KIND` and `FOREMAN_UNIT` set, output in `<workdir>/logs/`. Resuming a session, running several orders in parallel and cleaning up after a crashed agent are then your job: the dispatcher starts the command and does not watch it. The lock in `STATE.md` still protects each unit for 3 hours.
6. Tokens and keys are never logged. A failed start goes to the optional webhook (`DISPATCHER_ERROR_WEBHOOK_URL`). The body depends on `webhook_format` in `config.json`: `discord` sends `{"content": ...}`, `slack` sends `{"text": ...}`, `auto` (default) decides by host (`discord.com`, `discordapp.com`, `hooks.slack.com`). Unknown host, an invalid or non-https URL or an unknown format is logged as `webhook not used: <reason>` without the URL, nothing is sent, the exit code stays 1.

## Update notice

On every run, for each project, the dispatcher checks whether the project runs an older foreman version. It is off when `update_notice` is `false` in `config.json` or in the project's entry.

1. It reads `foreman` (the project's version) from the project's `.foreman.json`.
2. It reads the current foreman version. The source is `foreman_version_source`:
   - `release` (default): the newest GitHub release of `foreman_repo` (default `AndreasByr/foreman`), from `https://api.github.com/repos/<foreman_repo>/releases/latest`. One anonymous call per run. Public repositories only.
   - `local`: the `VERSION` file of the foreman checkout that holds `dispatch.mjs`. Use it for a private repository or when offline.
3. If the project is behind, it reports this once per project and version:
   - **Webhook:** the same webhook, `webhook_format` and `webhook_url_env` as the failure messages. Sent only after a successful post. The version is remembered in the project's state file under `update`.
   - **Ticket** (only with module `tracker-itsaplan`): titled `foreman update available: <old> → <new>`, in column `Action Required` (aliases `Intervention needed`, or `tracker.columnAliases` in `.foreman.json`). The dispatcher creates it with the bot account from the project's `pass_env` values `ITSAPLAN_URL` and `ITSAPLAN_API_KEY`. It needs `mirror.itsaplan.projectKey` in `.foreman.json`. Without these, no ticket is created, but the webhook still goes out.
   - With tracker `none` or `linear`, only the webhook is sent.
   - A ticket that was closed by hand is not recreated. A newer version supersedes the older open ticket. Once `.foreman.json` shows the new version, the ticket moves to `Done` with a comment.
4. A failed ticket or webhook sets exit code 1. It is retried on the next run.

The dispatcher updates nothing itself. The message names `foreman-update` for the project chat.

`--dry-run` logs `would report update` and writes and sends nothing.

If the source is unreachable or has no release, the dispatcher logs one line, `foreman version unknown`, reports nothing, and the other runs go on.

Nothing is reported before a release newer than the project's version exists. To see the notice before that, set `"foreman_version_source": "local"`.

## Local run with Claude Code (fire_command)

If you have no cloud routine, `fire_command` can start Claude Code on your own machine.

1. Copy `fire-claude.example.sh` to that machine.
2. In it, set the project directory and the EXACT model ID. Aliases like `opus` are refused.
3. Keep `claude_login = "inherit"` in the project's `tools/delegate/config.toml`.
4. In the project's entry in `config.json`, set `"fire_command": "ssh my-server bash ~/fire-claude.sh"`.
5. Try `./dispatch.sh --dry-run` first. It prints `would start ... via command`.

Know before you rely on it:

- Environment variables do not cross `ssh`. The start script on the server holds the project's values.
- The command gets no `SSH_AUTH_SOCK`, so `ssh` uses the key files in `~/.ssh` of the dispatcher's user (a systemd timer has no agent anyway). Add `SSH_AUTH_SOCK` to `pass_env` only if you need an agent.
- The dispatcher does not watch the run. The lock in `STATE.md` protects the unit for 3 hours; measuring comes with a later milestone.
- Unattended `claude -p` needs the project's `.claude/settings.json` to allow the commands it needs.

## Install

```sh
git clone https://github.com/<you>/foreman ~/foreman        # or copy the dispatcher/ directory
cd ~/foreman/dispatcher
cp config.example.json config.json                          # edit: projects, repos, variable names
cp dispatcher.env.example dispatcher.env && chmod 600 dispatcher.env   # fill in the values
```

Create a read-only deploy key per repository (GitHub: Settings, Deploy keys, leave "Allow write access" off), store the private key on the server and put its path into the variable named by `deploy_key_env`. The work run routine and its fire URL and token come from `docs/routines/work-run.md` of the project.

Dry run first. It updates the checkout, runs the check and prints what it would start, without calling any fire URL or writing state:

```sh
./dispatch.sh --dry-run
./dispatch.sh --dry-run --project my-project
```

The `TASK` lines must match the units you expect. Then pick one scheduler.

**systemd user timer (recommended):**

```sh
mkdir -p ~/.config/systemd/user
cp systemd/foreman-dispatcher.service systemd/foreman-dispatcher.timer ~/.config/systemd/user/
# edit the paths in the .service file if foreman is not in ~/foreman
systemctl --user daemon-reload
systemctl --user enable --now foreman-dispatcher.timer
loginctl enable-linger "$USER"        # keeps user timers running after you log out and after a reboot
systemctl --user list-timers foreman-dispatcher.timer
journalctl --user -u foreman-dispatcher.service -n 50
```

**cron alternative:** `crontab -e` and add the line from `crontab.example`.

## Heartbeat, watcher and alarm

A module that stops used to raise no alarm. A 14 hour standstill went unnoticed. The dispatcher was the only part that could report, and it reported only while it ran and only through the webhook. Now every module writes a heartbeat, and a separate watcher judges them.

**Heartbeats.** One JSON file per module, in `<workdir>/status/` or in the directory named by `FOREMAN_STATUS_DIR`. Each file holds `module`, `last_run`, `result` (`ok` or `error`), `note` and an optional `max_age_min`. Writers:

- The dispatcher writes `dispatcher` and `project:<name>` for each enabled project. It does this on every run except `--dry-run`. A run that is skipped because another run holds the lock writes nothing, so a hung run turns stale.
- `scripts/state-mirror.mjs` writes `tracker-sync`, but only when `FOREMAN_STATUS_DIR` is set. It writes `error` when the mirror failed or was skipped for missing credentials. Its exit code does not change.
- Any script: `node dispatcher/heartbeat.mjs beat <module> ok|error [note]`.

**Watcher.** `dispatcher/watch.sh` runs every 15 minutes, from its own systemd timer or a cron line. It does not depend on the dispatcher. It judges every beat except its own (`watcher`). A beat is:

- `error`: the last beat says `error`.
- `stale`: the last run is older than the limit.
- `never`: the module has a limit in `heartbeat.limits_minutes` but never sent a beat.

The limit comes from the first setting that exists:

1. `heartbeat.limits_minutes.<module>` in `config.json`. Defaults: `dispatcher` 30, `watcher` 45.
2. The beat's own `max_age_min`.
3. `heartbeat.default_limit_minutes`. Default: none. A module without a limit alarms only on error.

**Alarms.** One alarm per new problem. A problem that stays is repeated after `alarm.repeat_hours` (default 6). When the module is ok again, one recovery message follows. The channels are set in `alarm.channels` (default `["webhook"]`):

- `webhook`: the error webhook (`DISPATCHER_ERROR_WEBHOOK_URL`).
- `push`: an HTTPS POST of the text to the URL in the variable named by `alarm.push_url_env` (default `ALARM_PUSH_URL`). For example an ntfy topic URL.
- `tracker`: an itsaplan ticket. A new problem opens a ticket in "Action Required". A repeat adds a comment. Recovery adds a comment and moves the ticket to "Done". Set `alarm.tracker.project_key`, or `project` to read the key from that project's `.foreman.json`. `url_env` and `key_env` name the variables for the itsaplan URL and API key (defaults `ITSAPLAN_URL` and `ITSAPLAN_API_KEY`).

An alarm counts as delivered when at least one channel sent it. If none did, the watcher exits 1, writes an error beat and retries on the next run.

The dispatcher checks the watcher beat on each run. If the watcher beat is stale or failed, the dispatcher sends a webhook message, at most once per `alarm.repeat_hours`. So the two watch each other. The watcher never judges itself.

**Status.** `dispatcher/status.sh`, or `node dispatcher/heartbeat.mjs status`, prints a table of all modules. It exits 1 when any module is not ok. To run it by name, add `alias foreman-status='~/foreman/dispatcher/status.sh'` to your shell profile.

**Setup on the dispatcher machine:**

1. Add `heartbeat` and `alarm` to `config.json`. See `config.example.json`. Without `alarm`, the watcher uses the webhook only.
2. For the `push` channel, set `ALARM_PUSH_URL` in `dispatcher.env`.
3. Install the watcher timer: `cp systemd/foreman-watcher.service systemd/foreman-watcher.timer ~/.config/systemd/user/`, then `systemctl --user daemon-reload` and `systemctl --user enable --now foreman-watcher.timer`. For cron, add the watcher line from `crontab.example`.
4. For the tracker sync, set `FOREMAN_STATUS_DIR` where `state-mirror.mjs` runs. Point it at the directory the watcher reads.

## Switch off

Per project: `"enabled": false` in `config.json`. Everything: `systemctl --user disable --now foreman-dispatcher.timer` (or remove the cron line). Nothing is left running; a started work run finishes on its own and frees its lock. The watcher stops with `systemctl --user disable --now foreman-watcher.timer` (or by removing its cron line).

## Merging into main

The check starts a batch for `main` only when `.foreman.json` has `autopilot.mainAutoMerge: true`. The default is `false`, and only the boolean `true` counts. Otherwise only the human's "Batch PR main" starts it. Units the human already merged are still closed.

## Without a server

A Claude Code routine on the smallest model can do the same check hourly: `docs/routines/delegation.md` in the project ("Plan B"). It costs tokens every hour and depends on a model following the prompt, so it is the fallback, not the default.

## Tests

`node dispatcher/tests/test-dispatch.mjs` (part of `bash scripts/test-all.sh`).

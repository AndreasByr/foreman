# Dispatcher

The central, model-free part of the autopilot. A small script on a server or computer of yours checks your projects every 10 minutes and starts work runs. It costs no tokens: it runs `scripts/autopilot-check.sh` in each project (reads `STATE.md` on the remote branches, tracker comments and the clock) and starts one work run per task it prints. This directory is not copied into your projects.

Needs: Node 20+, git, a machine that is on (a small VPS, a home server, a Raspberry Pi), outbound HTTPS, and per project a GitHub (or comparable) repository with the foreman `autopilot` module installed. Setup time: about 15 minutes.

## What it does per project

1. Clones or updates a read-only checkout with a deploy key (read access only).
2. Runs the project's check script (`scripts/autopilot-check.sh --no-fetch`). Exit code not 0: nothing is started, the error is logged and sent to the webhook.
3. Parses the output: `TASK|<kind>|<unit>|<info>` lines and `=== PROMPT n <kind> <unit> ===` ... `=== END n ===` blocks (`ENDE` is accepted too). `NOTHING|...` means nothing to do.
4. Starts at most 3 tasks, at most one per unit, and none for a unit it started within `cooldown_minutes` (default 45), so two runs 10 minutes apart never start the same unit twice before the work run took its lock.
5. Fire target:
   - **Claude Code routine (recommended):** `POST` to the routine's fire URL with the headers `Authorization: Bearer <token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01` and the body `{"text": "<order text>"}`. The answer's session URL is logged.
   - **Other agents:** `fire_command`, a shell command that receives the order text on stdin, for example `opencode run`. It runs detached in the project checkout with `FOREMAN_PROJECT`, `FOREMAN_KIND` and `FOREMAN_UNIT` set, output in `<workdir>/logs/`. Resuming a session, running several orders in parallel and cleaning up after a crashed agent are then your job: the dispatcher starts the command and does not watch it. The lock in `STATE.md` still protects each unit for 3 hours.
6. Tokens and keys are never logged. A failed start goes to the optional webhook (`DISPATCHER_ERROR_WEBHOOK_URL`, JSON body `{"text": ..., "content": ...}`).

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

## Switch off

Per project: `"enabled": false` in `config.json`. Everything: `systemctl --user disable --now foreman-dispatcher.timer` (or remove the cron line). Nothing is left running; a started work run finishes on its own and frees its lock.

## Without a server

A Claude Code routine on the smallest model can do the same check hourly: `docs/routines/delegation.md` in the project ("Plan B"). It costs tokens every hour and depends on a model following the prompt, so it is the fallback, not the default.

## Tests

`node dispatcher/tests/test-dispatch.mjs` (part of `bash scripts/test-all.sh`).

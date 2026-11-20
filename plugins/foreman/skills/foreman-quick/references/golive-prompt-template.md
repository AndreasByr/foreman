# Go-live prompt template (infrastructure)

For the optional second prompt. The hard rules in section 2 are fixed; fill only the placeholders. The result is `PROMPT-<slug>-go-live.md`, to be run in a fresh session after the app is finished on `dev`.

````markdown
# Order: set up the infrastructure for <Project name> and put the app live

Work as the infrastructure Agent for **<Project name>**. The app is built and tested and lives on branch `dev`. Goal: a running app at `https://<domain>`, delivered with a short acceptance check. This prompt is your only order. Read it completely, then `CLAUDE.md`, `docs/requirements.md` (hosting and legal sections), `Dockerfile` and `.env.example` before the first command. Where `CLAUDE.md` says "never touch servers", this prompt replaces that rule for this order only; everything else in `CLAUDE.md` still applies.

## 1. Access

| What | How |
|---|---|
| Server | <how the Agent reaches it, for example an SSH alias that is already configured> |
| Deploy tool API | token in `<ENV_NAME>`, base URL in `<ENV_NAME>`; header `Authorization: Bearer ...` |
| DNS | token in `<ENV_NAME>`, scope only the zone `<zone>`; first verify the token, then read the zone ID |
| Repo | branch `dev`; push only to `dev` |

Tokens are temporary. At the start check that each is set and works. A missing token or a 401 or 403 answer: stop and report. Do not try another way in.

## 2. Hard rules

1. Do not touch anything that is not clearly part of this project. Other apps, containers, volumes, networks, projects and DNS records stay as they are. No stopping, restarting, changing or deleting them. After every changing step, check that the neighbours still answer.
2. Delete only after approval. Before removing anything that exists already, show the human an inventory table (resource, belongs to, evidence) and wait for an explicit "yes, delete". Without approval, leave it and continue without using its ports or names.
3. No `docker system prune`, no `docker volume prune`, no wildcards when deleting, no `rm -rf` outside directories you created for this project.
4. DNS: create or change only the records named in section 3. Do not change other records or any zone setting (SSL mode, firewall, rules, caching). If a zone setting is needed, ask.
5. Deploy tool: create your own project for this app and work only in it. Do not change other projects, server settings or the proxy without asking.
6. Secrets: generate them on the server (`openssl rand -hex 32`), store them only in the deploy tool's variables or in `.env` files with mode `600` under the project directory on the server. Never in the repo, in chat or in logs. Mask tokens and secrets in all output.
7. No test login on the server. Environment is production.
8. Git: only `dev`. No push to `main`, no merge, no force push, no tags. The merge `dev` to `main` is the human's, see section 6.
9. Firewall: open ports only with the human's approval. Check with `ss -tulpn` that they are free first.
10. A step fails twice: stop, report the finding, do not keep trying.

## 3. Target picture

| Name | Service | Target | DNS |
|---|---|---|---|
| `<domain>` | the app | <port or container> | <record type and proxy setting> |
| <more rows> | | | |

## 4. Phases

Keep a log in `docs/ops/infra-log.md`: per phase the time, what was done, the check result. Commit the log to `dev`.

1. Preflight: access checks, inventory of what exists, free ports, disk space. Show the inventory.
2. Prepare: directories, secrets, variables, `.env` files.
3. Services: <services the app needs, in order>.
4. App: create the project in the deploy tool, set variables, first deploy from branch `main` once it is merged (see 6).
5. DNS: records from section 3, then verify resolution and HTTPS.
6. Hand-over.

## 5. Checks per phase

Each phase ends with a command that proves it (HTTP status, container health, resolution). A phase without proof is not done.

## 6. Hand-over

1. Ask the human to merge `dev` into `main` when the deploy tool deploys from `main`. Wait for it.
2. Run the acceptance check: the app answers over HTTPS, the core flow works with a real account the human provides, the neighbours still answer.
3. Write `docs/ops/deploy.md`: how it was set up, which variables exist (names only), how to redeploy, how to roll back, how to stop.
4. Final message: URL, what runs where, what the human still has to do, open findings.
````

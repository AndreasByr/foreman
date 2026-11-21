# Question catalog

Four blocks. Ask one block per round, at most 3 questions, and skip every question an earlier answer already settles. Offer options with the recommended one first. "Not sure" is always allowed.

## A. What do you know?

Decides how deeply you explain. Ask all three in one round.

1. Git and GitHub: never used / commit and push / branches and pull requests.
2. Terminal: never / copy and paste commands / comfortable.
3. Deploy and servers: never / used a hosting dashboard / run my own server or Docker.

Add only if relevant: experience with a coding agent (Claude Code, OpenCode, other): none / used it for small tasks / used it for whole features.

"Not sure" counts as the beginner answer here: it sets the depth of explanation. Everywhere else it is recorded as `unbekannt`.

Effect:

| Answer | Explanation depth |
|---|---|
| beginner in git or terminal | every command in a code block, say what it does and what success looks like, one command at a time |
| intermediate | commands in blocks, a one-line purpose each |
| comfortable | the command list and the checklist, no explanation unless asked |
| never deployed | do not propose staging and production yet; offer deploy as a later, separate step with its own prompt (see `foreman-quick`) |

## B. What do you need?

Decides the profile.

1. What are you building: a quick demo or prototype / a product that stays and gets updates?
2. Who works on it: only you / you and others (who tests, who approves)?
3. How much should run without you: nothing, I start every run / runs while I sleep, I only approve?

If B1 is "stays" or B2 is "others" or B3 is "while I sleep", ask once more:

4. Release rhythm: whenever ready / a fixed weekday (default Friday, so the weekend buffers follow-up errors).
5. Do you need a test environment (staging) before production? Recommended once real users exist.

## C. What do you have?

Full inventory of what exists: machines, services, access, tracker, gateway, agent. Runs for profiles Repo and Autopilot; Quick skips it. Decides modules and missing prerequisites.

Rules:

- Nothing is inferred. Every statement later in the summary comes from an answer. Never ask for key values, only whether one exists.
- "none" is always allowed and means zero matches.
- "I don't know" is always allowed. Record it as `unbekannt`, never guess it, and name it later as a gap. The same goes for "unknown".

Ask in three rounds of at most three questions: C1 to C3, then C4 to C6, then C7 to C9. Nine questions, three rounds. Multi-select where marked.

- **C1.** Machines, one entry per machine: its name, its role (server, home server, laptop, other) and its purpose (multi-select, stored as `purposes`): dispatcher host, local runs, app hosting, tracker host, gateway host, other. After each machine ask "another machine?" and repeat until the human says no.
- **C2.** Services running on each machine from C1 (multi-select): Docker, Coolify or a similar deploy tool, itsaplan, LiteLLM gateway, dispatcher, other.
- **C3.** Domain and HTTPS per service or machine from C1 and C2: yes / no / unknown.
- **C4.** AI access with its tier (multi-select): Claude plan (Pro, Max, Team/Enterprise, API); Claude Code routines with API trigger available (yes / no / unknown); Ollama Cloud plan; ChatGPT plan; other providers. Ask for the tier, never for a key.
- **C5.** Notification channel (multi-select): mail, Discord webhook, Slack webhook, push, none. For a webhook ask only whether one exists, never its URL.
- **C6.** Tracker (single choice, one tracker module at a time): itsaplan, Linear, none. For itsaplan ask for its URL and only whether it is reachable, never for a key. For Linear ask only whether the account exists.
- **C7.** Gateway: is a LiteLLM gateway running? Answer: its URL / no / unknown. If it runs, also ask for the NAME of the environment variable that holds the gateway key (default `FOREMAN_GATEWAY_KEY`), never the key value; store it as `gateway.keyEnv`.
- **C8.** Coding agent and GitHub: Claude Code with a subscription, OpenCode or another agent, and which subscription or API access; GitHub account and a repo for the project: yes / no / unsure.
- **C9.** Consent for ChatGPT via the gateway. Ask only when C4 reports a ChatGPT plan other than none, whether the gateway runs now or is planned. Show the risk notice in 3 short lines: (1) this is not an official Codex client; (2) automatic use may violate the terms of use and may get the subscription blocked; (3) alternatives: the official Codex CLI as worker, an API key with its own budget, Ollama and Claude only. The human decides explicitly: `accepted-risk` or `declined`. Store the answer as `chatgptViaGateway`; once stored, never ask again. Details: `references/gateway-block.md`.

## D. How do you work?

Decides schedule, release day and notifications. Ask only for Autopilot, short for Repo.

1. Time zone and the hours you want to test in (the dispatcher bundles merges every 4 hours in the project's time zone; the default is hours 3, 7, 11, 15, 19, 23). The time zone is stored once as `timeZone` in `workspace.json` and is the suggestion that `foreman-project` shows per project; the merge window hours, wait time and the `main` rule are asked per project, not here.
2. Release day (default Friday) or "no fixed day".
3. How often you can test: daily / a few times a week / weekly. There is no limit on waiting UATs; the answer only sets how often you get a summary.
4. Language: already asked in step 0 of the setup (`context.language`). Ask again only if documents should use a different language than the chat.
5. Notification channel: already asked in C5. Reuse that answer. Ask only for the webhook or mail detail names (never a URL) if they are missing.

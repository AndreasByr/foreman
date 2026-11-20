# Question catalog

Four blocks. Ask one block per round, at most 3 questions, and skip every question an earlier answer already settles. Offer options with the recommended one first. "Not sure" is always allowed; treat it as the beginner answer.

## A. What do you know?

Decides how deeply you explain. Ask all three in one round.

1. Git and GitHub: never used / commit and push / branches and pull requests.
2. Terminal: never / copy and paste commands / comfortable.
3. Deploy and servers: never / used a hosting dashboard / run my own server or Docker.

Add only if relevant: experience with a coding agent (Claude Code, OpenCode, other): none / used it for small tasks / used it for whole features.

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

Decides modules and missing prerequisites. Ask in two rounds.

Round 1:

1. Coding agent and plan: Claude Code with a subscription / OpenCode / another agent. Which subscription or API access.
2. GitHub account and a repo for the project: yes / no / unsure.
3. A machine that is on all the time: server or VPS / home server / only my laptop.

Round 2, only for Autopilot or Repo with a deploy:

4. Docker or a deploy tool (Coolify or similar) on that machine: yes / no.
5. Domain name: yes / no. Needed only for a public app or a tracker reachable from outside.
6. Tracker: itsaplan running / Linear account / none. 
7. Worker access: Ollama Cloud key / ChatGPT subscription (for the gateway) / none, Claude only.
8. Monitoring or notifications (mail, webhook, chat): optional.

Never ask for key values. Ask only whether one exists.

## D. How do you work?

Decides schedule, release day and notifications. Ask only for Autopilot, short for Repo.

1. Time zone and the hours you want to test in (the dispatcher bundles merges every 4 hours in the project's time zone; the default is hours 3, 7, 11, 15, 19, 23).
2. Release day (default Friday) or "no fixed day".
3. How often you can test: daily / a few times a week / weekly. This sets how many units may wait for UAT.
4. Language of the documentation: English / your language. Chat answers follow your language either way.
5. How you want to be notified when the work needs you: push, mail, a chat webhook, nothing.

## Result

After block C or D, write a short profile summary the human can confirm:

```
You know: <one line>
You need: <one line>
You have: <one line>
Gaps: <list, each with minutes>
Recommendation: Quick | Repo | Autopilot, because <reason>
```

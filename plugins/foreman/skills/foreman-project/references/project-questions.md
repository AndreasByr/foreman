# Project questions

Read by `foreman-project` in section 2, before it asks anything. Ask each question once, at most 3 per round. Values from `workspace.json` are not asked: take them over and show them in one line. Every question has a suggestion; the human may change it.

### P1 Project name and slug

Ask for the project name and a slug: a short lowercase id used for the repo, the branches and the file names, for example `acme-shop`.

**Suggestion:** the project name in lowercase, with dashes instead of spaces.

### P2 Profile: Repo or Autopilot

Ask which profile fits the project. Quick was already decided in step 1 of the skill, so only these two are offered here:

- Repo: the repo with the foreman skills and the tracker; the human starts each run.
- Autopilot: Repo plus unattended batch runs that go on without the human.

**Suggestion:** Repo. Take Autopilot when the runs should go on without the human.

### P3 Modules

Ask which modules to enable. Offer only the modules that fit the chosen profile. The tracker is asked when it is not in workspace.json: the answer "itsaplan" maps to `tracker-itsaplan`, the answer "linear" maps to `tracker-linear`, and "none" means no tracker module.

**Suggestion:** the modules that the profile recommends.

### P4 Run in the cloud or local

Ask whether the Agent runs in the cloud or locally. Cloud means a cloud session; local means a run on the human's own computer.

**Suggestion:** cloud, unless the repo needs local files or tools that a cloud session cannot reach.

### P5 Staging

Ask whether the project has a staging environment, separate from production, that is tested before a release.

**Suggestion:** yes for a product with real users; no for a prototype or an internal tool.

### P6 Time zone

**Profiles Repo and Autopilot.** Ask the time zone, used for the merge window and the batch hours.

**Suggestion:** the `timeZone` from `workspace.json`. If there is none, ask without a suggestion. Always ask; the human confirms.

### P7 Batch hours

**Autopilot only.** Ask the hours at which a batch window opens, on the 24-hour clock, as a comma list.

**Suggestion:** 3, 7, 11, 15, 19, 23, or the human's own hours.

### P8 Wait for the merge

**Autopilot only.** Ask how many hours a finished batch may wait for its merge when the merge window is closed.

**Suggestion:** 4 hours.

### P9 mainAutoMerge

**Autopilot only.** Ask whether `main` merges by itself inside the merge window (`mainAutoMerge` yes), or only when the human writes "Batch PR main" (`mainAutoMerge` no).

**Suggestion:** no, only on "Batch PR main".

## Answers to installer flags and keys

| Question | Installer flag | `.foreman.json` key | Value |
|---|---|---|---|
| P1 name and slug | `--project <slug>` (required), `--name "<Display Name>"` (optional) | `project` and `name` | the slug from P1 goes to `project`, the display name to `name` |
| P2 profile | `--scope docs\|repo\|autopilot` | `scope` | `repo` for Repo, `autopilot` for Autopilot (Autopilot also needs module autopilot in P3) |
| P3 modules | `--modules <comma list>` | `modules` | the modules from P3, comma list of the names `tracker-itsaplan`, `tracker-linear`, `delegate`, `gateway`, `autopilot`, `pretest`. `tracker-itsaplan` and `tracker-linear` are exclusive: they exclude each other. Tracker "none" means neither of them. |
| P5 staging | `--no-staging` | `staging` | `no` passes the flag and writes `false`; `yes` omits the flag |
| P6 time zone | `--tz <IANA name>`, e.g. `Europe/Berlin` | `context.timeZone` | the zone from P6 |
| P7 batch hours | `--batch-hours <h,h,...>`, hours 0 to 23, no spaces | `autopilot.batchHours` | the hours from P7 |
| P8 wait | `--wait-hours <number>`, greater than 0, at most 168 | `autopilot.waitHours` | the hours from P8 |
| P9 mainAutoMerge | `--main-auto-merge yes\|no` | `autopilot.mainAutoMerge` | `yes` is `true`, `no` is `false` |

P6 applies to profiles Repo and Autopilot. P7 to P9 apply only to profile Autopilot.

## Do not ask

Machines, gateway, plans and subscriptions, tracker server, notification channel: these are in `workspace.json`. Use them, do not ask.

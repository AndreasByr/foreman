#!/usr/bin/env node
// Dispatcher check: reads every unit's STATE.md on the remote branches, the tracker signals and the clock, and prints
// TASK lines plus complete order texts (contract in lib/autopilot-check.mjs). Costs no model tokens.
//
//   scripts/autopilot-check.sh [--no-fetch] [--now <ISO time>]
//
// Environment: FOREMAN_TZ, FOREMAN_BATCH_HOURS, FOREMAN_RELEASE_WEEKDAY, FOREMAN_RELEASE_HOUR, FOREMAN_LOCK_SECONDS,
// FOREMAN_WAIT_SECONDS, FOREMAN_MAX_TASKS (see .foreman.json "autopilot"); ITSAPLAN_URL + ITSAPLAN_API_KEY (tracker-itsaplan),
// LINEAR_API_KEY (tracker-linear), GITHUB_TOKEN (read only, open batch PRs). A missing variable skips that part and is
// reported on stderr. Exit 0 when the check ran, 2 on an error of the script itself (then nothing must be started).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitRun, gitText, listFiles, showFile } from "./lib/git.mjs";
import { collectUnits, FETCH_SPEC } from "./lib/units.mjs";
import { gatherSignals } from "./lib/trackers.mjs";
import { settingsFrom, tasks, formatOutput, verdictFromFile, pretestRound } from "./lib/autopilot-check.mjs";

function repoSlug(conf, git) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  if (conf.repo) return conf.repo;
  const url = gitText(git, ["remote", "get-url", "origin"]) ?? "";
  return /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url)?.[1] ?? null;
}

export async function findVerdicts(units, git) {
  const verdicts = {};
  for (const u of units) {
    if (u.status !== "pretest-waiting" && u.status !== "pretest-running") continue;
    const refs = [...new Set([u.ref, "origin/dev"].filter(Boolean))];
    const name = u.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rounds = [];
    for (const ref of refs) {
      for (const f of listFiles(git, ref, "docs/pretest")) {
        const m = new RegExp(`^docs/pretest/${name}-round-(\\d+)\\.md$`).exec(f);
        if (m) rounds.push(Number(m[1]));
      }
    }
    const round = pretestRound(u, rounds);
    verdicts[u.id] = { round, verdict: null };
    for (const ref of refs) {
      const verdict = verdictFromFile(showFile(git, ref, `docs/pretest/${u.id}-round-${round}.md`));
      if (verdict) { verdicts[u.id] = { round, verdict }; break; }
    }
  }
  return verdicts;
}

export async function findOpenPrs(slug, fetchImpl, stderr) {
  const prs = { dev: null, main: null };
  if (!slug || !process.env.GITHUB_TOKEN) {
    stderr("Note: GITHUB_TOKEN or repository name missing; open batch PRs are not checked.");
    return prs;
  }
  const owner = slug.split("/")[0];
  for (const t of ["dev", "main"]) {
    try {
      const r = await fetchImpl(`https://api.github.com/repos/${slug}/pulls?state=open&head=${owner}:batch/${t}`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
      });
      if (!r.ok) throw new Error(`GitHub API ${r.status}`);
      const list = await r.json();
      prs[t] = Array.isArray(list) && list.length ? list[0].number : null;
    } catch (e) { stderr(`Note: open batch PRs for ${t} could not be read: ${e.message}`); }
  }
  return prs;
}

export function findCatchUp(units, git, now) {
  const late = { dev: [], main: [] };
  for (const u of units) {
    if (!["dev", "main"].includes(u.target) || u.kind !== "fixpack") continue;
    if (u.status === "awaiting-merge") {
      const sha = gitText(git, ["log", "-1", "--format=%H", u.ref, "--", u.path]);
      if (sha && git(["merge-base", "--is-ancestor", sha, `origin/${u.target}`])?.status === 0) late[u.target].push(u.id);
    } else if (u.status === "batch-pr" && u.since && now.getTime() - Date.parse(u.since) > 30 * 60 * 1000) {
      if (u.ref.startsWith("origin/batch/") && git(["merge-base", "--is-ancestor", u.ref, `origin/${u.target}`])?.status === 0) late[u.target].push(u.id);
    }
  }
  return late;
}

export async function main(argv = [], deps = {}) {
  const stderr = deps.stderr ?? ((m) => console.error(m));
  const git = deps.git ?? ((args) => gitRun(args));
  const i = argv.indexOf("--now");
  if (i >= 0 && !argv[i + 1]) throw new Error("--now needs an ISO time.");
  const now = deps.now ?? (i >= 0 ? new Date(argv[i + 1]) : new Date());
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid time for --now.");
  const conf = deps.conf ?? (existsSync(".foreman.json") ? JSON.parse(readFileSync(".foreman.json", "utf8")) : {});
  const settings = settingsFrom(process.env, conf);
  if (!argv.includes("--no-fetch")) {
    const r = git(["fetch", "-q", "origin", ...FETCH_SPEC]);
    if (r?.status !== 0) stderr("Warning: git fetch failed; existing remote refs are used.");
  }
  const units = deps.units ?? collectUnits(git);
  const verdicts = await findVerdicts(units, git);
  const signals = await gatherSignals({
    conf, units, now, tz: settings.tz, git, stderr, client: deps.client,
    wantRelease: true,
  });
  const openPrs = deps.openPrs ?? await findOpenPrs(repoSlug(conf, git), deps.fetch ?? fetch, stderr);
  const catchUp = findCatchUp(units, git, now);
  console.log(formatOutput(tasks({ units, now, settings, verdicts, signals, openPrs, catchUp })));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 2;
  });
}

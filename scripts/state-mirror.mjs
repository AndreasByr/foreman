#!/usr/bin/env node
// Mirror unit status from STATE.md (the only source of truth) to the tracker: itsaplan or Linear.
// Idempotent: a second run with unchanged STATE.md files changes nothing. With tracker `none` there is nothing to mirror;
// the check still verifies that every `needs-input` unit carries its question in STATE.md.
//
//   node scripts/state-mirror.mjs [--dry-run] [--check] [--local] [--help]
//   --check: like --dry-run, exits 1 when the tracker differs from STATE.md (use after UAT approval and release)
//
// Reads STATE.md of every unit on origin/batch/* (default) or in the working tree (--local).
// Config: "modules" (tracker-itsaplan | tracker-linear | none) and "mirror" in .foreman.json.
// Secrets from env: ITSAPLAN_URL, ITSAPLAN_API_KEY (itsaplan); LINEAR_API_KEY (linear).
// Intervention: a unit in `needs-input` moves to the column "Action Required" and the ticket must carry an explanation
// comment (question, options with consequences, recommendation, report link, how to answer). The mirror writes it from the
// "Open question" section of STATE.md and `--check` fails while it is missing.
// Wiki: with `wiki.enabled` in .foreman.json, a milestone from batch-pr on needs a `Wiki:` line in STATE.md (pages or
// "no change"). A missing or placeholder line is a PROBLEM and the script exits 1 in every mode.
// Models never set tracker statuses by hand; they run this script.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseState, STATUSES } from "./lib/state.mjs";
import { gitRun, gitText } from "./lib/git.mjs";
import { collectUnits, collectLocalUnits, FETCH_SPEC } from "./lib/units.mjs";
import { itsaplanClient, webLink } from "./lib/itsaplan-api.mjs";
import { plan as itsaplanPlan, findIssue } from "./lib/itsaplan-mirror.mjs";
import { linearClient } from "./lib/linear-api.mjs";
import { openQuestion, explanationText, hasExplanation } from "./lib/intervention.mjs";
import { trackerKind } from "./lib/trackers.mjs";

export { parseState, STATUSES };

export const DEFAULT_LINEAR_STATE = {
  planning: "In Progress", slice: "In Progress", rework: "In Progress", validation: "In Progress",
  "batch-pr": "In Progress", fixpack: "In Progress", "needs-input": "Action Required",
  "awaiting-merge": "Wait for Merge", "pretest-waiting": "Testing", "pretest-running": "Testing",
  "uat-ready": "In Review", "release-ready": "In Review", done: "Done",
};

export function unitKey(unit) {
  return `[${unit.id}]`;
}

export function linearPlan(unit, issue, cfg) {
  // Returns the list of changes for one unit. issue = current Linear issue or null.
  const stateMap = { ...DEFAULT_LINEAR_STATE, ...(cfg.stateMap || {}) };
  const prefix = cfg.labelPrefix ?? "AP: ";
  const wantState = stateMap[unit.status];
  const wantLabel = unit.status === "done" ? null : `${prefix}${unit.status}`;
  const changes = [];
  if (!issue) {
    changes.push({ op: "create", title: `${unitKey(unit)} ${unit.title || unit.id}`, state: wantState, label: wantLabel });
    return changes;
  }
  if (wantState && issue.state !== wantState) changes.push({ op: "state", from: issue.state, to: wantState });
  const phaseLabels = (issue.labels || []).filter((l) => l.startsWith(prefix));
  for (const l of phaseLabels) if (l !== wantLabel) changes.push({ op: "removeLabel", label: l });
  if (wantLabel && !phaseLabels.includes(wantLabel)) changes.push({ op: "addLabel", label: wantLabel });
  return changes;
}

/** Problems that need no tracker: a needs-input unit without its question in STATE.md. */
export function interventionProblems(units) {
  return units
    .filter((u) => u.status === "needs-input" && !openQuestion(u.stateText))
    .map((u) => `${u.id}: status needs-input but STATE.md has no "Open question" section with content`);
}

const WIKI_STATUSES = ["batch-pr", "awaiting-merge", "pretest-waiting", "pretest-running", "uat-ready", "release-ready", "done"];

/** With wiki on: a milestone from batch-pr on needs its `Wiki:` line in STATE.md (pages affected or "no change"). */
export function wikiProblems(units, conf) {
  if (conf?.wiki?.enabled !== true) return [];
  return units
    .filter((u) => u.kind === "milestone" && WIKI_STATUSES.includes(u.status))
    .filter((u) => {
      const wiki = parseState(u.stateText).wiki;
      return !wiki || wiki === "-" || wiki.startsWith("<");
    })
    .map((u) => `${u.id}: Wiki line missing in STATE.md (wiki is on)`);
}

// ---------- reading units ----------

function unitsFromBranches() {
  gitRun(["fetch", "-q", "origin", ...FETCH_SPEC]);
  return collectUnits((args) => gitRun(args));
}

function unitsFromWorkingTree() {
  return collectLocalUnits(
    (dir) => (existsSync(dir) ? readdirSync(dir) : []),
    (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  );
}

function reportLink(unit) {
  const url = gitText((a) => gitRun(a), ["remote", "get-url", "origin"]) ?? "";
  const slug = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url)?.[1];
  const branch = (unit.ref ?? "dev").replace(/^origin\//, "");
  return slug ? `https://github.com/${slug}/blob/${branch}/${unit.path}` : `${branch}:${unit.path}`;
}

let pending = 0;
export const pendingChanges = () => pending;
export const resetPending = () => { pending = 0; };

// ---------- itsaplan ----------

async function mirrorItsaplan(units, cfg, dry, client = itsaplanClient(), aliases = {}) {
  const key = cfg.projectKey;
  if (!key) throw new Error("mirror.itsaplan.projectKey is missing in .foreman.json");
  const project = await client.project(key);
  const issues = await client.issues(key);
  for (const u of units) {
    let issue = findIssue(u, issues);
    const question = u.status === "needs-input" ? openQuestion(u.stateText) : null;
    const p = itsaplanPlan(u, issue, project, { prefix: cfg.labelPrefix ?? "AP: ", question: question?.short ?? null, aliases });
    if (p.action !== "ok") {
      pending++;
      console.log(`ITSAPLAN|${u.id}|${p.action}|${p.reasons.join("; ")}`);
    }
    if (!dry && p.action === "create") {
      const assignee = (project.assignees ?? []).find((a) => a.username === (cfg.assignee ?? process.env.ITSAPLAN_ASSIGNEE));
      if (assignee) p.fields.assigneeUserId = assignee.userId;
      issue = await client.createIssue(key, p.fields);
      console.log(`ITSAPLAN|${u.id}|created|${issue.identifier}${webLink(issue.identifier, key) ? ` ${webLink(issue.identifier, key)}` : ""}`);
    } else if (!dry && p.action === "update") {
      await client.updateIssue(issue.id, p.fields);
    }
    if (issue && !u.tracker && issue.identifier) console.log(`ITSAPLAN|${u.id}|tracker-id|${issue.identifier} (write it into STATE.md "Tracker:")`);
    if (u.status === "needs-input") {
      const feed = issue?.id ? await client.comments(issue.id) : [];
      if (!hasExplanation(feed, u.id, u.since)) {
        pending++;
        console.log(`ITSAPLAN|${u.id}|comment|explanation missing`);
        if (!dry && issue?.id) {
          if (!question) throw new Error(`${u.id}: STATE.md has no open question to explain`);
          await client.comment(issue.id, explanationText({ unit: u.id, question, link: reportLink(u) }));
        }
      }
    }
  }
}

// ---------- Linear ----------

async function mirrorLinear(units, cfg, dry, client = linearClient()) {
  const team = await client.gql(`query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id states{nodes{id name}} labels(first:250){nodes{id name}}}}}`, { k: cfg.teamKey });
  const t = team.teams.nodes[0];
  if (!t) throw new Error(`Linear team ${cfg.teamKey} not found. Check teamKey in .foreman.json`);
  const stateId = (n) => t.states.nodes.find((s) => s.name === n)?.id;
  const labelId = (n) => t.labels.nodes.find((l) => l.name === n)?.id;
  // A team without the state "Action Required" keeps the unit in "In Progress"; the phase label still shows it.
  const stateMap = { ...(cfg.stateMap || {}) };
  if (!stateMap["needs-input"] && !stateId(DEFAULT_LINEAR_STATE["needs-input"])) stateMap["needs-input"] = "In Progress";
  const eff = { ...cfg, stateMap };
  for (const u of units) {
    const found = await client.gql(`query($q:String!){issues(filter:{title:{startsWith:$q}},first:1){nodes{id identifier state{name} labels{nodes{id name}}}}}`, { q: unitKey(u) });
    const node = found.issues.nodes[0];
    const issue = node && { id: node.id, identifier: node.identifier, state: node.state.name, labels: node.labels.nodes.map((l) => l.name), labelIds: node.labels.nodes };
    const changes = linearPlan(u, issue, eff);
    for (const c of changes) {
      pending++;
      console.log(`LINEAR|${u.id}|${c.op}|${c.to || c.label || c.title || ""}`);
      if (dry) continue;
      if (c.op === "create") {
        const project = (cfg.projectByTarget || {})[u.target];
        await client.gql(`mutation($i:IssueCreateInput!){issueCreate(input:$i){success}}`, { i: {
          teamId: t.id, title: c.title, stateId: stateId(c.state) || stateId("Todo"),
          labelIds: c.label && labelId(c.label) ? [labelId(c.label)] : [], ...(project ? { projectId: project } : {}),
        } });
      } else if (c.op === "state" && stateId(c.to)) {
        await client.gql(`mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}`, { id: issue.id, s: stateId(c.to) });
      } else if (c.op === "addLabel" && labelId(c.label)) {
        await client.gql(`mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}`, { id: issue.id, l: labelId(c.label) });
      } else if (c.op === "removeLabel") {
        const l = issue.labelIds.find((x) => x.name === c.label);
        if (l) await client.gql(`mutation($id:String!,$l:String!){issueRemoveLabel(id:$id,labelId:$l){success}}`, { id: issue.id, l: l.id });
      }
    }
    if (u.status === "needs-input" && issue) {
      const feed = await client.comments(issue.identifier);
      if (!hasExplanation(feed, u.id, u.since)) {
        pending++;
        console.log(`LINEAR|${u.id}|comment|explanation missing`);
        const question = openQuestion(u.stateText);
        if (!dry) {
          if (!question) throw new Error(`${u.id}: STATE.md has no open question to explain`);
          await client.comment(issue.identifier, explanationText({ unit: u.id, question, link: reportLink(u) }));
        }
      }
    }
  }
  // Free plans count active issues: archive what has been done for a while.
  const days = cfg.archiveDoneAfterDays ?? 7;
  if (days > 0) {
    const before = new Date(Date.now() - days * 86400000).toISOString();
    const old = await client.gql(`query($k:String!,$d:DateTimeOrDuration!){issues(first:100,filter:{team:{key:{eq:$k}},state:{type:{eq:"completed"}},completedAt:{lt:$d}}){nodes{id identifier}}}`, { k: cfg.teamKey, d: before });
    for (const i of old.issues.nodes) {
      console.log(`LINEAR|archive|${i.identifier}`);
      if (!dry) await client.gql(`mutation($id:String!){issueArchive(id:$id){success}}`, { id: i.id });
    }
  }
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    console.log(`Config (.foreman.json):
  "modules": ["tracker-itsaplan"],             // or "tracker-linear"; without a tracker module: none
  "tracker": { "columnAliases": { "Action Required": ["<other column name>"] } },   // optional
  "mirror": {
    "itsaplan": { "projectKey": "<project key>", "labelPrefix": "AP: ", "assignee": "<username, optional>" },
    "linear": { "teamKey": "ABC", "projectByTarget": { "dev": "<project id>", "main": "<project id>" },
                "labelPrefix": "AP: ", "stateMap": {}, "archiveDoneAfterDays": 7 }
  }`);
    return;
  }
  const check = args.includes("--check");
  const dry = check || args.includes("--dry-run");
  const conf = existsSync(".foreman.json") ? JSON.parse(readFileSync(".foreman.json", "utf8")) : {};
  const kind = trackerKind(conf);
  const units = args.includes("--local") ? unitsFromWorkingTree() : unitsFromBranches();
  console.log(`UNITS|${units.length}|tracker ${kind}`);
  let failed = false;
  const wikiIssues = wikiProblems(units, conf);
  const problems = [...interventionProblems(units), ...wikiIssues];
  for (const p of problems) { pending++; console.log(`PROBLEM|${p}`); }
  if (kind === "itsaplan") {
    if (!process.env.ITSAPLAN_URL || !process.env.ITSAPLAN_API_KEY) console.log("SKIP|itsaplan|ITSAPLAN_URL or ITSAPLAN_API_KEY missing");
    else await mirrorItsaplan(units, conf.mirror?.itsaplan ?? {}, dry, undefined, conf.tracker?.columnAliases ?? {}).catch((e) => { failed = true; console.log(`ERROR|itsaplan|${e.message}`); });
  } else if (kind === "linear") {
    if (!conf.mirror?.linear) console.log("SKIP|linear|mirror.linear missing in .foreman.json");
    else if (!process.env.LINEAR_API_KEY) console.log("SKIP|linear|LINEAR_API_KEY missing");
    else await mirrorLinear(units, conf.mirror.linear, dry).catch((e) => { failed = true; console.log(`ERROR|linear|${e.message}`); });
  }
  if (check && pending > 0) console.log(`DIFF|${pending} changes pending`);
  process.exit(failed || wikiIssues.length > 0 || (check && pending > 0) ? 1 : 0);
}

export { mirrorItsaplan, mirrorLinear };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

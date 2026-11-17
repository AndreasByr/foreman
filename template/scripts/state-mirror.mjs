#!/usr/bin/env node
// Mirror unit status from STATE.md (the only source of truth) to Linear and Notion.
// Idempotent: a second run with unchanged STATE.md files changes nothing.
//
//   node scripts/state-mirror.mjs [--dry-run] [--check] [--local] [--help]
//   --check: like --dry-run, exits 1 when trackers differ from STATE.md (use after UAT approval and release)
//
// Reads STATE.md of every unit on origin/batch/* (default) or in the working tree (--local).
// Config: "mirror" in .foreman.json. Secrets from env: LINEAR_API_KEY, NOTION_TOKEN.
// Models never set tracker statuses by hand; they run this script.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const STATUSES = [
  "planning", "slice", "rework", "validation", "batch-pr", "fixpack", "awaiting-merge",
  "pretest-waiting", "pretest-running", "needs-input", "uat-ready", "release-ready", "done",
];

export const DEFAULT_LINEAR_STATE = {
  planning: "In Progress", slice: "In Progress", rework: "In Progress", validation: "In Progress",
  "batch-pr": "In Progress", fixpack: "In Progress", "needs-input": "In Progress",
  "awaiting-merge": "Wait for Merge", "pretest-waiting": "Testing", "pretest-running": "Testing",
  "uat-ready": "In Review", "release-ready": "In Review", done: "Done",
};

// ---------- parsing (pure, tested) ----------

export function parseState(text) {
  const field = (name) => {
    const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"));
    return m ? m[1].trim() : "";
  };
  const statusRaw = field("Status");
  const status = (statusRaw.match(/^([a-z-]+)/) || [])[1] || "";
  const since = (statusRaw.match(/since\s+(\d{4}-\d{2}-\d{2}T[\d:]+Z)/) || [])[1] || "";
  const title = field("Title") || (text.match(/^#\s+(.+)$/m) || [])[1] || "";
  const tracker = field("Tracker");
  return {
    status: STATUSES.includes(status) ? status : "",
    since,
    target: field("Target"),
    title: title.trim(),
    tracker: tracker && tracker !== "-" ? tracker.split(/\s/)[0] : "",
    pretestRound: parseInt(field("Pretest-round") || "0", 10) || 0,
  };
}

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

export function notionPlan(unit, rows, cfg) {
  // rows: [{id, round, phase}] for this unit. Only two transitions belong to the mirror:
  // open a pretest row when the unit waits for a pretest, close all rows when the unit is approved.
  // Result phases (fix round, UAT ready, needs input) are written by the pretest run itself.
  const p = { waiting: "Pretest waiting", closed: "Taken over", ...(cfg.phases || {}) };
  const changes = [];
  if (unit.status === "pretest-waiting") {
    const round = unit.pretestRound || 1;
    if (!rows.some((r) => r.round === round)) changes.push({ op: "createRow", round, phase: p.waiting });
    for (const r of rows) if (r.round < round && r.phase !== p.closed) changes.push({ op: "phase", id: r.id, to: p.closed });
  }
  if (unit.status === "done" || unit.status === "release-ready") {
    for (const r of rows) if (r.phase !== p.closed) changes.push({ op: "phase", id: r.id, to: p.closed });
  }
  return changes;
}

// ---------- reading units ----------

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function unitsFromBranches() {
  try { git(["fetch", "-q", "--depth", "1", "origin", "+refs/heads/batch/*:refs/remotes/origin/batch/*"]); } catch {}
  let branches = [];
  try { branches = git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/batch/"]).split("\n").filter(Boolean); } catch {}
  const units = [];
  for (const b of branches) {
    let files = [];
    try { files = git(["ls-tree", "-r", "--name-only", b, "docs/milestones", "docs/fixpacks"]).split("\n"); } catch {}
    for (const f of files.filter((f) => f.endsWith("/STATE.md") && !f.includes("_TEMPLATE"))) {
      try { units.push({ id: f.split("/").slice(-2)[0], path: `${b}:${f}`, ...parseState(git(["show", `${b}:${f}`])) }); } catch {}
    }
  }
  return dedupe(units);
}

function unitsFromWorkingTree() {
  const units = [];
  for (const dir of ["docs/milestones", "docs/fixpacks"]) {
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) {
      const f = join(dir, id, "STATE.md");
      if (id !== "_TEMPLATE" && existsSync(f)) units.push({ id, path: f, ...parseState(readFileSync(f, "utf8")) });
    }
  }
  return units;
}

function dedupe(units) {
  // The same unit can exist on several batch branches; the newest "since" wins.
  const by = new Map();
  for (const u of units) {
    const old = by.get(u.id);
    if (!old || (u.since || "") > (old.since || "")) by.set(u.id, u);
  }
  return [...by.values()].filter((u) => u.status);
}

let pending = 0;

// ---------- Linear ----------

async function linear(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: process.env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function mirrorLinear(units, cfg, dry) {
  const team = await linear(`query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id states{nodes{id name}} labels(first:250){nodes{id name}}}}}`, { k: cfg.teamKey });
  const t = team.teams.nodes[0];
  if (!t) throw new Error(`Linear team ${cfg.teamKey} not found. Check teamKey in .foreman.json`);
  const stateId = (n) => t.states.nodes.find((s) => s.name === n)?.id;
  const labelId = (n) => t.labels.nodes.find((l) => l.name === n)?.id;
  for (const u of units) {
    const found = await linear(`query($q:String!){issues(filter:{title:{startsWith:$q}},first:1){nodes{id identifier state{name} labels{nodes{id name}}}}}`, { q: unitKey(u) });
    const node = found.issues.nodes[0];
    const issue = node && { id: node.id, state: node.state.name, labels: node.labels.nodes.map((l) => l.name), labelIds: node.labels.nodes };
    const changes = linearPlan(u, issue, cfg);
    for (const c of changes) {
      pending++;
      console.log(`LINEAR|${u.id}|${c.op}|${c.to || c.label || c.title || ""}`);
      if (dry) continue;
      if (c.op === "create") {
        const project = (cfg.projectByTarget || {})[u.target];
        await linear(`mutation($i:IssueCreateInput!){issueCreate(input:$i){success}}`, { i: {
          teamId: t.id, title: c.title, stateId: stateId(c.state) || stateId("Todo"),
          labelIds: c.label && labelId(c.label) ? [labelId(c.label)] : [], ...(project ? { projectId: project } : {}),
        } });
      } else if (c.op === "state" && stateId(c.to)) {
        await linear(`mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}`, { id: issue.id, s: stateId(c.to) });
      } else if (c.op === "addLabel" && labelId(c.label)) {
        await linear(`mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}`, { id: issue.id, l: labelId(c.label) });
      } else if (c.op === "removeLabel") {
        const l = issue.labelIds.find((x) => x.name === c.label);
        if (l) await linear(`mutation($id:String!,$l:String!){issueRemoveLabel(id:$id,labelId:$l){success}}`, { id: issue.id, l: l.id });
      }
    }
  }
  // Free plans count active issues: archive what has been done for a while.
  const days = cfg.archiveDoneAfterDays ?? 7;
  if (days > 0) {
    const before = new Date(Date.now() - days * 86400000).toISOString();
    const old = await linear(`query($k:String!,$d:DateTimeOrDuration!){issues(first:100,filter:{team:{key:{eq:$k}},state:{type:{eq:"completed"}},completedAt:{lt:$d}}){nodes{id identifier}}}`, { k: cfg.teamKey, d: before });
    for (const i of old.issues.nodes) {
      console.log(`LINEAR|archive|${i.identifier}`);
      if (!dry) await linear(`mutation($id:String!){issueArchive(id:$id){success}}`, { id: i.id });
    }
  }
}

// ---------- Notion ----------

async function notion(path, body, method = "POST") {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (json.object === "error") throw new Error(json.message);
  return json;
}

async function mirrorNotion(units, cfg, dry) {
  const col = { unit: "Unit", phase: "Phase", round: "Round", name: "Name", kind: "Kind", ...(cfg.columns || {}) };
  for (const u of units) {
    const q = await notion(`databases/${cfg.databaseId}/query`, { filter: { property: col.unit, rich_text: { equals: u.id } } });
    const rows = q.results
      .filter((r) => (r.properties[col.kind]?.select?.name || "Pretest") === "Pretest")
      .map((r) => ({ id: r.id, round: r.properties[col.round]?.number || 0, phase: r.properties[col.phase]?.select?.name || "" }));
    for (const c of notionPlan(u, rows, cfg)) {
      pending++;
      console.log(`NOTION|${u.id}|${c.op}|${c.to || c.phase}`);
      if (dry) continue;
      if (c.op === "createRow") {
        await notion("pages", { parent: { database_id: cfg.databaseId }, properties: {
          [col.name]: { title: [{ text: { content: `${u.id} pretest round ${c.round}` } }] },
          [col.unit]: { rich_text: [{ text: { content: u.id } }] },
          [col.round]: { number: c.round },
          [col.phase]: { select: { name: c.phase } },
        } });
      } else if (c.op === "phase") {
        await notion(`pages/${c.id}`, { properties: { [col.phase]: { select: { name: c.to } } } }, "PATCH");
      }
    }
  }
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 10).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    console.log(`Config (.foreman.json):
  "mirror": {
    "linear": { "teamKey": "ABC", "projectByTarget": { "dev": "<project id>", "main": "<project id>" },
                "labelPrefix": "AP: ", "stateMap": {}, "archiveDoneAfterDays": 7 },
    "notion": { "databaseId": "<id>", "columns": { "unit": "Unit", "phase": "Phase", "round": "Round" },
                "phases": { "waiting": "Pretest waiting", "closed": "Taken over" } }
  }`);
    return;
  }
  const check = args.includes("--check");
  const dry = check || args.includes("--dry-run");
  const conf = existsSync(".foreman.json") ? JSON.parse(readFileSync(".foreman.json", "utf8")) : {};
  const mods = conf.modules || [];
  const units = args.includes("--local") ? unitsFromWorkingTree() : unitsFromBranches();
  console.log(`UNITS|${units.length}`);
  let failed = false;
  if (mods.includes("linear") && conf.mirror?.linear) {
    if (!process.env.LINEAR_API_KEY) console.log("SKIP|linear|LINEAR_API_KEY missing");
    else await mirrorLinear(units, conf.mirror.linear, dry).catch((e) => { failed = true; console.log(`ERROR|linear|${e.message}`); });
  }
  if (mods.includes("notion") && conf.mirror?.notion) {
    if (!process.env.NOTION_TOKEN) console.log("SKIP|notion|NOTION_TOKEN missing");
    else await mirrorNotion(units, conf.mirror.notion, dry).catch((e) => { failed = true; console.log(`ERROR|notion|${e.message}`); });
  }
  if (check && pending > 0) console.log(`DIFF|${pending} changes pending`);
  process.exit(failed || (check && pending > 0) ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

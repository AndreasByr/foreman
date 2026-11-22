#!/usr/bin/env node
// Counts the bytes of the fixed files a work run reads, per scenario, at a git ref, and compares with a baseline ref.
// Tests: node scripts/test-measure-reads.mjs
//
//   node scripts/measure-reads.mjs [--ref <git-ref>] [--baseline <git-ref>] [--root <repo dir>] [--json]
//
// Defaults: ref = the working tree (files read from disk under root), baseline = 9c51ceb, root = parent dir of scripts/.
// Any other ref is read with `git show <commit>:<path>` (spawnSync with an args array, no shell).
// A path missing at a ref counts 0 and is listed under "missing". Reads only; writes no file, no network.
// Exit 0: no counted scenario is above the baseline. 1: at least one counted scenario is above.
// 2: usage error, unknown ref, unknown option or missing option value (stderr starts with "measure-reads:", no numbers printed).

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: node scripts/measure-reads.mjs [--ref <git-ref>] [--baseline <git-ref>] [--root <repo dir>] [--json]";
const DEFAULT_BASELINE = "9c51ceb";
const WORKING_TREE = "working tree";
const VALUE_OPTIONS = { "--ref": "ref", "--baseline": "baseline", "--root": "root" };

const S = "template/.claude/skills";
const DISPATCH = `${S}/foreman-dispatch-run/SKILL.md`;
const PAYLOAD = `${S}/foreman-dispatch-run/references/payload.md`;
const BATCH_RUN = `${S}/foreman-dispatch-run/references/batch-run.md`;
const DELEGATION = `${S}/foreman-delegation/SKILL.md`;
const MILESTONE = `${S}/foreman-milestone/SKILL.md`;
const FIXPACK = `${S}/foreman-fixpack/SKILL.md`;
const BATCH = `${S}/foreman-batch/SKILL.md`;
const DEPLOY = `${S}/foreman-deploy/SKILL.md`;
const WIKI = `${S}/foreman-wiki/SKILL.md`;
const CLAUDE = "template/CLAUDE.md";

export const SCENARIOS = [
  { name: "milestone-run", counted: true, files: [CLAUDE, DISPATCH, PAYLOAD, DELEGATION, MILESTONE, BATCH, DEPLOY] },
  { name: "fixpack-run", counted: true, files: [CLAUDE, DISPATCH, PAYLOAD, DELEGATION, FIXPACK, BATCH, DEPLOY] },
  { name: "batch-run", counted: true, files: [CLAUDE, DISPATCH, BATCH_RUN, DELEGATION, BATCH, DEPLOY] },
  { name: "wiki-addon", counted: false, files: [WIKI] },
];

const size = (content) => (typeof content === "string" ? Buffer.byteLength(content) : content.length);

/** Sizes per scenario at one ref. readFile(path) returns the content (string or Buffer) or null when the path is missing. */
export function measure(readFile, scenarios = SCENARIOS) {
  return scenarios.map((sc) => {
    const files = [];
    const missing = [];
    let total = 0;
    for (const path of sc.files) {
      const content = readFile(path);
      if (content === null || content === undefined) { missing.push(path); files.push({ path, size: 0 }); continue; }
      const n = size(content);
      total += n;
      files.push({ path, size: n });
    }
    return { name: sc.name, counted: sc.counted, total, files, missing };
  });
}

/** Combines the current and baseline measurement into the report rows. */
export function compare(current, baseline) {
  const scenarios = current.map((cur, i) => {
    const base = baseline[i];
    return {
      name: cur.name,
      counted: cur.counted,
      current: cur.total,
      baseline: base.total,
      diff: cur.total - base.total,
      files: cur.files.map((f, j) => ({ path: f.path, current: f.size, baseline: base.files[j].size })),
      missing: [...cur.missing.map((p) => `${p} (current)`), ...base.missing.map((p) => `${p} (baseline)`)],
    };
  });
  const over = scenarios.filter((s) => s.counted && s.current > s.baseline).map((s) => s.name);
  return { scenarios, over };
}

function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") { opts.json = true; continue; }
    const key = VALUE_OPTIONS[arg];
    if (!key) throw new Error(`unknown option or argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
    opts[key] = value;
    i++;
  }
  return opts;
}

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

/** Resolves a ref to a commit id; throws when it is not a commit. */
function resolveCommit(root, ref) {
  if (ref.startsWith("-")) throw new Error(`unknown ref: ${ref}`);
  const r = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (r.error || r.status !== 0) throw new Error(`unknown ref: ${ref}`);
  return r.stdout.toString("utf8").trim();
}

function gitReader(root, commit) {
  return (path) => {
    const r = git(root, ["show", `${commit}:${path}`]);
    return !r.error && r.status === 0 ? r.stdout : null;
  };
}

function diskReader(root) {
  return (path) => {
    try { return readFileSync(join(root, path)); } catch { return null; }
  };
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const tokens = (n) => Math.round(n / 4);

function renderText(report, refLabel, baselineLabel) {
  const lines = [`ref: ${refLabel}`, `baseline: ${baselineLabel}`];
  for (const s of report.scenarios) {
    lines.push(`${s.name}${s.counted ? "" : " (reported only)"}: ${s.current} B (baseline ${s.baseline} B, ${signed(s.diff)} B), tokens~ ${tokens(s.current)}`);
    for (const f of s.files) lines.push(`  ${f.path}: ${f.current} B (baseline ${f.baseline} B)`);
    if (s.missing.length) lines.push(`  missing: ${s.missing.join(", ")}`);
  }
  lines.push(report.over.length ? `result: over baseline: ${report.over.join(", ")}` : "result: ok");
  return lines.join("\n") + "\n";
}

/** Runs the measurement. Returns the exit code. */
export function main(argv, { stdout = process.stdout, stderr = process.stderr, defaultRoot } = {}) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    stderr.write(`measure-reads: ${e.message}\n${USAGE}\n`);
    return 2;
  }
  const root = resolve(opts.root ?? defaultRoot ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const baselineRef = opts.baseline ?? DEFAULT_BASELINE;
  let readCur, readBase;
  try {
    readCur = opts.ref === undefined ? diskReader(root) : gitReader(root, resolveCommit(root, opts.ref));
    readBase = gitReader(root, resolveCommit(root, baselineRef));
  } catch (e) {
    stderr.write(`measure-reads: ${e.message}\n`);
    return 2;
  }
  const report = compare(measure(readCur), measure(readBase));
  const refLabel = opts.ref ?? WORKING_TREE;
  if (opts.json) {
    stdout.write(JSON.stringify({ ref: refLabel, baseline: baselineRef, scenarios: report.scenarios, over: report.over }, null, 2) + "\n");
  } else {
    stdout.write(renderText(report, refLabel, baselineRef));
  }
  return report.over.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

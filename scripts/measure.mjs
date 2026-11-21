#!/usr/bin/env node
// Measures runs, interventions, fallbacks and models of a period and writes docs/metrics.md (fully regenerated each run).
// Tests: node scripts/test-measure.mjs
//
//   node scripts/measure.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--root <dir>] [--results <dir>] [--strict]
//
// Defaults: root = current directory, results = <root>/tools/delegate/tasks, period = last 7 days.
// Reads only project files (docs/milestones, docs/fixpacks, docs/agent-reports, worker result files). No network, no env.
// Exit 0 normally; 1 with --strict when gaps exist (the file is still written); 2 for an invalid date, since after until,
// an unknown option or a missing option value (stderr starts with "measure:", nothing is written).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collect, render } from "./lib/measure.mjs";

const USAGE = "usage: node scripts/measure.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--root <dir>] [--results <dir>] [--strict]";
const VALUE_OPTIONS = { "--since": "since", "--until": "until", "--root": "root", "--results": "results" };

/** A real calendar day in the form YYYY-MM-DD (2026-02-30 is not one). */
function isDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseArgs(argv) {
  const opts = { strict: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") { opts.strict = true; continue; }
    const key = VALUE_OPTIONS[arg];
    if (!key) throw new Error(`unknown option or argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
    opts[key] = value;
    i++;
  }
  for (const key of ["since", "until"]) {
    if (opts[key] !== undefined && !isDay(opts[key])) throw new Error(`invalid date for ${key}: ${opts[key]} (use YYYY-MM-DD)`);
  }
  return opts;
}

/** Runs the measurement. Returns the exit code; writes the summary line to stdout and errors to stderr. */
export function main(argv, { cwd = process.cwd(), now = new Date(), stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    stderr.write(`measure: ${e.message}\n${USAGE}\n`);
    return 2;
  }
  const root = resolve(cwd, opts.root ?? ".");
  const resultsDir = opts.results === undefined ? join(root, "tools", "delegate", "tasks") : resolve(cwd, opts.results);

  let data;
  try {
    data = collect({ root, resultsDir, since: opts.since, until: opts.until ?? now });
  } catch (e) {
    stderr.write(`measure: ${e.message}\n`);
    return 2;
  }

  const markdown = render(data, { generatedAt: now });
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "metrics.md"), markdown);
  } catch (e) {
    stderr.write(`measure: cannot write docs/metrics.md: ${e.message}\n`);
    return 2;
  }

  const interventionCount = Object.values(data.interventionsByCause).reduce((s, n) => s + n, 0) + data.interventionsWithoutCause;
  stdout.write(`metrics: ${data.units.length} units, ${interventionCount} interventions, ${data.fallbacks} fallbacks, ${data.gaps.length} gaps -> docs/metrics.md\n`);
  return opts.strict && data.gaps.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), { cwd: process.cwd(), now: new Date() });
}

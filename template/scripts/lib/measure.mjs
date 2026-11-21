// Measurement of runs, interventions, fallbacks and models from files. Pure reading, no network, no writes.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stamp, parseState } from "./state.mjs";
import { interventions } from "./intervention.mjs";

/** Suffix the delegate wrapper (tools/delegate/run_task.py) puts into the heading of a fallback attempt. */
export const FALLBACK_TAG = "fallback after provider outage";

const DAY = 86400000;
const ATTEMPT = /^## Attempt \d+: (\S+) \((.+?)\) - (ok|failed)/;

/** Milliseconds of a Date or an ISO UTC string (a bare date means its start, or its last millisecond when `endOfDay`). */
function toMs(value, name, endOfDay) {
  let t = null;
  if (value instanceof Date) t = value.getTime();
  else if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      t = Date.parse(`${value}T00:00:00Z`);
      if (Number.isFinite(t) && endOfDay) t += DAY - 1;
    } else t = stamp(value);
  }
  if (!Number.isFinite(t)) throw new Error(`invalid date for ${name}: ${String(value)}`);
  return t;
}

function readText(file) {
  try { return readFileSync(file, "utf8"); } catch { return null; }
}

function listDir(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** Valid lines of the "## Log" section; `invalid` is true when a "- " line has no valid stamp. */
function logEntries(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "## Log");
  const entries = [];
  let invalid = false;
  if (start < 0) return { entries, invalid };
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (!/^-\s/.test(lines[i])) continue;
    const m = lines[i].match(/^-\s+(\S+)\s*·\s*(.*)$/);
    const t = m ? stamp(m[1]) : null;
    if (t === null) { invalid = true; continue; }
    entries.push({ t, text: m[2] });
  }
  return { entries, invalid };
}

/** Whole minutes between first and last stamp and the part spent waiting on a human. */
function durations(entries) {
  const ts = entries.map((e) => e.t);
  const total = Math.max(...ts) - Math.min(...ts);
  let waited = 0;
  let open = false;
  entries.forEach((e, i) => {
    if (!e.text.includes("needs-input")) return;
    if (i === entries.length - 1) open = true;
    else waited += Math.max(0, entries[i + 1].t - e.t);
  });
  const toMin = (ms) => Math.round(ms / 60000);
  return { totalMinutes: toMin(total), waitedMinutes: toMin(waited), open };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countReports(root, id) {
  const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRe(id)}(?![A-Za-z0-9]).*\\.md$`, "i");
  return listDir(join(root, "docs", "agent-reports")).filter((d) => d.isFile() && re.test(d.name)).length;
}

function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/**
 * Collect measurements for the period [since, until] (inclusive, UTC).
 * Throws only for an invalid since/until ("invalid date ...") or since > until ("since is after until").
 */
export function collect(opts = {}) {
  const root = opts.root ?? ".";
  const resultsDir = opts.resultsDir ?? join(root, "tools", "delegate", "tasks");
  const until = opts.until === undefined ? Date.now() : toMs(opts.until, "until", true);
  const since = opts.since === undefined ? until - 7 * DAY : toMs(opts.since, "since", false);
  if (since > until) throw new Error("since is after until");
  const inPeriod = (t) => t >= since && t <= until;

  const gaps = [];
  const units = [];
  const byCause = {};
  let withoutCause = 0;

  const found = [];
  for (const [kind, folder] of [["milestone", "milestones"], ["fixpack", "fixpacks"]]) {
    for (const d of listDir(join(root, "docs", folder))) {
      if (d.isDirectory() && !d.name.startsWith("_")) found.push({ kind, id: d.name, file: join(root, "docs", folder, d.name, "STATE.md") });
    }
  }
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const u of found) {
    const text = readText(u.file);
    if (text === null) { if (existsSync(u.file)) gaps.push(`${u.id}: STATE.md not readable`); continue; }
    const { entries, invalid } = logEntries(text);
    if (!entries.length) {
      gaps.push(`${u.id}: no valid log time`);
      if (invalid) gaps.push(`${u.id}: log line without valid time`);
      continue;
    }
    const last = Math.max(...entries.map((e) => e.t));
    if (!inPeriod(last)) continue;
    if (invalid) gaps.push(`${u.id}: log line without valid time`);
    const { totalMinutes, waitedMinutes, open } = durations(entries);
    if (open) gaps.push(`${u.id}: open needs-input wait not subtracted`);
    const ints = interventions(text).map((i) => ({ category: i.cause?.category ?? null, problem: i.problem }));
    for (const i of ints) {
      if (i.problem === null) byCause[i.category] = (byCause[i.category] ?? 0) + 1;
      else { withoutCause++; gaps.push(`${u.id}: intervention without valid cause (${i.problem})`); }
    }
    units.push({
      id: u.id,
      kind: u.kind,
      title: parseState(text).title,
      minutes: Math.max(0, totalMinutes - waitedMinutes),
      waitedMinutes,
      reports: countReports(root, u.id),
      interventions: ints,
    });
  }

  let attempts = 0;
  let fallbacks = 0;
  const models = {};
  if (!existsSync(resultsDir)) gaps.push(`worker result files not found (${resultsDir})`);
  else {
    const files = listDir(resultsDir).filter((d) => d.isFile() && d.name.endsWith(".result.md")).map((d) => d.name).sort();
    const tag = `, ${FALLBACK_TAG}`;
    for (const name of files) {
      const file = join(resultsDir, name);
      let mtime;
      try { mtime = statSync(file).mtimeMs; } catch { continue; }
      if (!inPeriod(mtime)) continue;
      const text = readText(file);
      let count = 0;
      for (const line of text === null ? [] : text.split(/\r?\n/)) {
        const m = line.match(ATTEMPT);
        if (!m) continue;
        count++;
        attempts++;
        let model = m[2];
        if (model.endsWith(tag)) { fallbacks++; model = model.slice(0, -tag.length); }
        const role = (models[m[1]] ??= {});
        role[model] = (role[model] ?? 0) + 1;
      }
      if (!count) gaps.push(`${name}: no attempt found`);
    }
  }

  const modelsByRole = {};
  for (const r of Object.keys(models).sort()) modelsByRole[r] = sortKeys(models[r]);
  return {
    period: { since: new Date(since).toISOString(), until: new Date(until).toISOString() },
    units,
    interventionsByCause: sortKeys(byCause),
    interventionsWithoutCause: withoutCause,
    attempts,
    fallbacks,
    modelsByRole,
    gaps,
  };
}

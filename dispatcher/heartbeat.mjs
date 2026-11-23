#!/usr/bin/env node
// foreman heartbeat: one JSON beat file per module, written atomically, judged against age limits.
//   heartbeat.mjs beat <module> ok|error [note words...] [--max-age <min>] [--dir <d>] [--config <file>]
//   heartbeat.mjs status [--dir <d>] [--config <file>]
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const RESULTS = ["ok", "error"];

export const validModule = (name) => typeof name === "string" && MODULE_RE.test(name);

const fileName = (module) => `${module.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

const expandHome = (p, env = process.env) => {
  if (p === "~") return env.HOME || homedir();
  if (p.startsWith("~/")) return join(env.HOME || homedir(), p.slice(2));
  return p;
};

export function statusDir(config = {}, env = process.env) {
  if (env.FOREMAN_STATUS_DIR) return env.FOREMAN_STATUS_DIR;
  const workdir = expandHome(config?.workdir || "~/.local/share/foreman-dispatcher", env);
  return join(workdir, "status");
}

export function writeBeat(dir, module, { result = "ok", note = "", maxAgeMin = null, now = Date.now() } = {}) {
  if (!validModule(module)) throw new Error(`invalid module name: ${String(module)}`);
  if (!RESULTS.includes(result)) throw new Error(`invalid result: ${String(result)} (use ok or error)`);
  mkdirSync(dir, { recursive: true });
  const beat = {
    module,
    last_run: new Date(now).toISOString(),
    result,
    note: String(note ?? "").split(/\r?\n/)[0].slice(0, 300),
    max_age_min: typeof maxAgeMin === "number" && Number.isFinite(maxAgeMin) ? maxAgeMin : null,
  };
  const target = join(dir, fileName(module));
  const tmp = join(dir, `.${fileName(module)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(beat) + "\n");
    renameSync(tmp, target);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw e;
  }
  return beat;
}

export function readBeats(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const beats = [];
  for (const name of names.filter((n) => n.endsWith(".json") && !n.startsWith("."))) {
    try {
      const b = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (!b || typeof b !== "object" || !validModule(b.module) || !RESULTS.includes(b.result) || Number.isNaN(Date.parse(b.last_run))) throw new Error("invalid");
      beats.push({
        module: b.module,
        last_run: b.last_run,
        result: b.result,
        note: String(b.note ?? "").split(/\r?\n/)[0].slice(0, 300),
        max_age_min: typeof b.max_age_min === "number" ? b.max_age_min : null,
      });
    } catch {
      beats.push({ module: name.slice(0, -".json".length), last_run: null, result: "error", note: `unreadable status file ${name}`, max_age_min: null });
    }
  }
  return beats.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function judge(beats, { now = Date.now(), limits = {}, defaultLimitMin = null } = {}) {
  const out = [];
  const seen = new Set();
  for (const b of beats) {
    seen.add(b.module);
    const limitMin = (has(limits, b.module) ? num(limits[b.module]) : null) ?? num(b.max_age_min) ?? num(defaultLimitMin);
    const t = b.last_run ? Date.parse(b.last_run) : NaN;
    const ageMin = Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 60000));
    let state = "ok";
    if (b.result === "error") state = "error";
    else if (limitMin !== null && ageMin !== null && ageMin > limitMin) state = "stale";
    out.push({ module: b.module, state, ageMin, limitMin, lastRun: b.last_run ?? null, result: b.result, note: b.note ?? "" });
  }
  for (const m of Object.keys(limits)) {
    if (seen.has(m)) continue;
    out.push({ module: m, state: "never", ageMin: null, limitMin: num(limits[m]), lastRun: null, result: null, note: "" });
  }
  return out.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
}

export function formatStatus(judged, now = Date.now()) {
  if (!judged.length) return "no module has reported yet";
  const w = Math.max(...judged.map((j) => j.module.length));
  return judged.map((j) => {
    let when = "never reported";
    if (j.lastRun) {
      const t = Date.parse(j.lastRun);
      if (!Number.isNaN(t)) {
        const m = Math.max(0, Math.floor((now - t) / 60000));
        when = m < 120 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
      }
    }
    return `${j.module.padEnd(w)}  ${j.state.padEnd(5)}  ${when}${j.note ? `  ${j.note}` : ""}`;
  }).join("\n");
}

function parseArgs(argv) {
  const opts = { dir: null, config: null, maxAge: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--config" || a === "--max-age") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === "--dir") opts.dir = v;
      else if (a === "--config") opts.config = v;
      else opts.maxAge = v;
    } else rest.push(a);
  }
  return { opts, rest };
}

function main(argv) {
  let parsed;
  try { parsed = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
  const { opts, rest } = parsed;
  const [cmd, ...args] = rest;
  let config = {};
  if (opts.config) {
    try { config = JSON.parse(readFileSync(opts.config, "utf8")); } catch (e) { console.error(`cannot read config ${opts.config}: ${e.message}`); return 2; }
  }
  const dir = opts.dir ?? statusDir(opts.config ? config : {});
  if (cmd === "beat") {
    const [module, result, ...words] = args;
    let maxAgeMin = null;
    if (opts.maxAge !== null) {
      maxAgeMin = Number(opts.maxAge);
      if (!Number.isFinite(maxAgeMin) || maxAgeMin < 0) { console.error(`invalid --max-age: ${opts.maxAge}`); return 2; }
    }
    try { writeBeat(dir, module, { result, note: words.join(" "), maxAgeMin }); } catch (e) { console.error(e.message); return 2; }
    return 0;
  }
  if (cmd === "status") {
    const hb = (opts.config && config.heartbeat) || {};
    const now = Date.now();
    const judged = judge(readBeats(dir), {
      now,
      limits: hb.limits_minutes && typeof hb.limits_minutes === "object" ? hb.limits_minutes : {},
      defaultLimitMin: num(hb.default_limit_minutes),
    });
    console.log(formatStatus(judged, now));
    return judged.some((j) => j.state !== "ok") ? 1 : 0;
  }
  console.error(`usage: ${basename(process.argv[1] ?? "heartbeat.mjs")} beat <module> ok|error [note...] [--max-age <min>] | status [--dir <d>] [--config <file>]`);
  return 2;
}

let direct = false;
try { direct = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* not direct */ }
if (direct) process.exitCode = main(process.argv.slice(2));

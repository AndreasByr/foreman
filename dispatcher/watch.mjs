#!/usr/bin/env node
// foreman watcher: judges the heartbeat files, sends one alarm per new problem (repeat after a while,
// recovery when the module is ok again) through webhook, push and/or tracker channels.
//   watch.mjs [--config <file>]
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, itsaplanApi, notify, redact } from "./dispatch.mjs";
import { judge, readBeats, statusDir, writeBeat } from "./heartbeat.mjs";

const HOUR = 3600 * 1000;
const WATCHER = "watcher";
const MAX_TRIES = 5;

const iso = (ms) => new Date(ms).toISOString();
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Pure: decides which alarms to send. Returns { alarms, recovered, next }. Never mutates its inputs. */
export function decide(judged, alertState, now, { repeatMs = 6 * HOUR } = {}) {
  const known = isObj(alertState) ? alertState : {};
  const next = {};
  const alarms = [];
  const recovered = [];
  const problems = new Map();
  for (const j of judged ?? []) if (j.state !== "ok") problems.set(j.module, j);
  for (const [module, j] of problems) {
    // a recovery that was already announced does not count as a known problem; its open ticket is carried over
    const wasRecovered = isObj(known[module]) && known[module].recoveredNotified;
    const old = wasRecovered ? undefined : known[module];
    const carried = wasRecovered && known[module].ticket ? { ticket: known[module].ticket } : {};
    const base = { module, state: j.state, ageMin: j.ageMin, limitMin: j.limitMin, lastRun: j.lastRun, note: j.note };
    if (!isObj(old)) {
      alarms.push({ ...base, kind: "new", since: iso(now) });
      next[module] = { since: iso(now), lastSent: iso(now), state: j.state, ...carried };
      continue;
    }
    const last = Date.parse(old.lastSent);
    if (Number.isNaN(last) || now - last >= repeatMs) {
      const since = old.since ?? iso(now);
      alarms.push({ ...base, kind: "repeat", since });
      next[module] = { ...old, since, lastSent: iso(now), state: j.state };
    } else next[module] = { ...old };
  }
  for (const [module, old] of Object.entries(known)) {
    if (problems.has(module)) continue;
    recovered.push({ module, since: isObj(old) ? old.since : undefined, ticket: isObj(old) ? old.ticket : undefined });
  }
  return { alarms, recovered, next };
}

const ago = (min) => (min < 120 ? `${min} min` : `${Math.floor(min / 60)} h`);

/** One short English line for an alarm ({kind: new|repeat|recovered, ...}). */
export function alarmText(a) {
  if (a.kind === "recovered") return `foreman: ${a.module} recovered (was down since ${a.since})`;
  const still = a.kind === "repeat" ? "still " : "";
  const head = `foreman alarm: ${still}`;
  if (a.state === "never") return `${head}${a.module} has never reported (limit ${a.limitMin} min)`;
  if (a.state === "error") return `${head}${a.module} failed: ${a.note || "no details"} (last run ${a.lastRun ?? "unknown"})`;
  const when = a.ageMin === null || a.ageMin === undefined ? "unknown" : `${ago(a.ageMin)} ago`;
  return `${head}${a.module} is not running: last run ${when} (limit ${a.limitMin} min)`;
}

const ticketTitle = (a) => (a.state === "error" ? `Alarm: ${a.module} failed` : `Alarm: ${a.module} is not running`);
const firstLine = (e) => String(e?.message ?? e).split("\n")[0];

async function pushChannel(config, env, text, fetchImpl, log) {
  const name = config.alarm?.push_url_env ?? "ALARM_PUSH_URL";
  const url = env[name];
  if (!url) return { status: "none" };
  if (!/^https:\/\//i.test(url)) { log("push not used: only https URLs are accepted"); return { status: "none" }; }
  try {
    const res = await fetchImpl(url, {
      method: "POST", headers: { "Content-Type": "text/plain", Title: "foreman" }, body: text,
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (res && res.ok === false) { log(`push failed: answered ${res.status}`); return { status: "failed" }; }
    return { status: "sent" };
  } catch (e) { log(`push failed: ${redact(firstLine(e), [url])}`); return { status: "failed" }; }
}

// Tracker channel: columns are looked up once per run (lazy), the api is created on first use.
function makeTracker(config, env, workdir, fetchImpl, log) {
  let ctx; // null = unusable
  const setup = () => {
    const t = config.alarm?.tracker ?? {};
    let pk = t.project_key;
    if (!pk && t.project) {
      try { pk = JSON.parse(readFileSync(join(workdir, "repos", String(t.project), ".foreman.json"), "utf8"))?.mirror?.itsaplan?.projectKey; } catch { /* reported below */ }
    }
    const url = env[t.url_env ?? "ITSAPLAN_URL"], key = env[t.key_env ?? "ITSAPLAN_API_KEY"];
    if (!pk) { log("tracker not used: project_key missing (set alarm.tracker.project_key or project)"); return null; }
    if (!url || !key) { log("tracker not used: itsaplan URL or API key missing in the environment"); return null; }
    return { pk, key, url, api: itsaplanApi(url, key, fetchImpl), columns: null };
  };
  const columnId = async (c, label, aliases = []) => {
    c.columns ??= (await c.api.project(c.pk)).columns ?? [];
    const want = [label, ...aliases].map((n) => n.toLowerCase());
    return c.columns.find((x) => want.includes(String(x.name).toLowerCase()))?.id;
  };
  return async (text, a, ticket) => {
    if (ctx === undefined) ctx = setup();
    if (!ctx) return { status: "none" };
    const c = ctx;
    try {
      if (a.kind === "recovered") {
        if (!ticket) { log(`tracker: no ticket recorded for ${a.module}, nothing to close`); return { status: "sent" }; }
        const done = await columnId(c, "Done");
        if (!done) throw new Error('no column "Done"');
        await c.api.comment(ticket, text);
        await c.api.move(ticket, done);
        return { status: "sent" };
      }
      if (a.kind === "new" && ticket) {
        const column = await columnId(c, "Action Required", ["Intervention needed"]);
        if (!column) throw new Error('no column "Action Required"');
        await c.api.comment(ticket, text);
        await c.api.move(ticket, column);
        return { status: "sent", ticket };
      }
      if (a.kind === "repeat" && ticket) {
        await c.api.comment(ticket, text);
        return { status: "sent", ticket };
      }
      const column = await columnId(c, "Action Required", ["Intervention needed"]);
      if (!column) throw new Error('no column "Action Required"');
      const done = await columnId(c, "Done");
      const title = ticketTitle(a);
      const found = (await c.api.list(c.pk)).find((i) => i.title === title && !i.archived && (!done || i.columnId !== done));
      if (found) {
        if (a.kind === "repeat") await c.api.comment(found.id, text);
        return { status: "sent", ticket: found.id };
      }
      const created = await c.api.create(c.pk, { title, description: text, columnId: column });
      return { status: "sent", ticket: created.id };
    } catch (e) {
      log(`tracker failed: ${redact(firstLine(e), [c.key, c.url])}`);
      return { status: "failed" };
    }
  };
}

function loadAlerts(path) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return isObj(data) ? data : {};
  } catch { return {}; }
}

function saveAlerts(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    renameSync(tmp, path);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw e;
  }
}

export async function watch({ config, env = process.env, now = Date.now(), fetch: fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const hb = config.heartbeat ?? {};
  const limits = { dispatcher: 30, ...(isObj(hb.limits_minutes) ? hb.limits_minutes : {}) };
  const defaultLimitMin = hb.default_limit_minutes ?? null;
  const dir = statusDir(config, env);
  const workdir = expandHome(config.workdir || "~/.local/share/foreman-dispatcher");
  const alertsPath = join(workdir, "alerts.json");
  const repeatMs = (config.alarm?.repeat_hours ?? 6) * HOUR;
  const channels = Array.isArray(config.alarm?.channels) ? config.alarm.channels : ["webhook"];

  const secrets = [env[config.webhook_url_env ?? "DISPATCHER_ERROR_WEBHOOK_URL"], env[config.alarm?.push_url_env ?? "ALARM_PUSH_URL"]];
  const say = (m) => log(redact(m, secrets));

  const judged = judge(readBeats(dir), { now, limits, defaultLimitMin }).filter((j) => j.module !== WATCHER);
  const before = loadAlerts(alertsPath);
  const { alarms, recovered, next } = decide(judged, before, now, { repeatMs });
  const tracker = makeTracker(config, env, workdir, fetchImpl, say);

  const send = async (a, text, ticket) => {
    const results = [];
    for (const ch of channels) {
      let r;
      try {
        if (ch === "webhook") r = { status: await notify(config, env, text, fetchImpl, say) };
        else if (ch === "push") r = await pushChannel(config, env, text, fetchImpl, say);
        else if (ch === "tracker") r = await tracker(text, a, ticket);
        else { say(`unknown alarm channel: ${ch}`); r = { status: "none" }; }
      } catch (e) { say(`${ch} failed: ${firstLine(e)}`); r = { status: "failed" }; }
      results.push(r);
    }
    return results;
  };

  const trackerOnly = async (a, ticket) => {
    try { return await tracker(alarmText(a), a, ticket); } catch (e) { say(`tracker failed: ${firstLine(e)}`); return { status: "failed" }; }
  };
  const hasTracker = channels.includes("tracker");
  const trackerIdx = channels.indexOf("tracker");
  const messages = [...alarms], retryRecovery = [];
  for (const r of recovered) {
    const o = before[r.module];
    if (isObj(o) && o.recoveredNotified) retryRecovery.push({ ...r, kind: "recovered" });
    else messages.push({ ...r, kind: "recovered" });
  }
  let delivered = 0, anyUsable = false;
  for (const a of messages) {
    const old = before[a.module];
    const results = await send(a, alarmText(a), isObj(old) ? old.ticket : undefined);
    if (results.some((r) => r.status !== "none")) anyUsable = true;
    const ok = results.some((r) => r.status === "sent");
    if (ok) delivered++;
    const ticket = results.find((r) => r.status === "sent" && r.ticket)?.ticket;
    const trackerOk = hasTracker && results[trackerIdx]?.status === "sent";
    if (a.kind === "recovered") {
      if (!ok) next[a.module] = old; // keep the entry, retry next run
      else if (hasTracker && !trackerOk && isObj(old) && old.ticket) next[a.module] = { ...old, recoveredNotified: true, closeTries: 1 }; // retry only the tracker part (this attempt counts)
    } else if (ok) {
      if (ticket) {
        const { ticketPending, ticketTries, ...rest } = next[a.module];
        next[a.module] = { ...rest, ticket };
      } else if (hasTracker && !(isObj(old) && old.ticket)) next[a.module] = { ...next[a.module], ticketPending: true, ticketTries: 1 };
    } else if (a.kind === "new") {
      if (isObj(old) && old.recoveredNotified) next[a.module] = old; // keep the old ticket, retried next run
      else delete next[a.module]; // stays unknown, retried next run
    }
    else next[a.module] = old; // repeat: keep the old lastSent
  }

  // Tracker-only retries: recovery tickets not yet closed, problem tickets not yet opened.
  for (const a of retryRecovery) {
    if (!hasTracker) continue; // channel removed: drop the entry
    const old = before[a.module];
    const r = await trackerOnly(a, old.ticket);
    if (r.status === "sent") continue;
    const tries = (Number(old.closeTries) || 0) + 1;
    if (tries >= MAX_TRIES) say(`tracker gave up for ${a.module} after ${MAX_TRIES} tries`);
    else next[a.module] = { ...old, closeTries: tries };
  }
  const judgedBy = new Map(judged.map((j) => [j.module, j]));
  for (const [module, entry] of Object.entries(next)) {
    if (!hasTracker || !isObj(entry) || !entry.ticketPending || entry.ticket) continue;
    if (alarms.some((a) => a.module === module) || !judgedBy.has(module) || judgedBy.get(module).state === "ok") continue;
    const j = judgedBy.get(module);
    const a = { module, state: j.state, ageMin: j.ageMin, limitMin: j.limitMin, lastRun: j.lastRun, note: j.note, kind: "new", since: entry.since };
    const r = await trackerOnly(a, undefined);
    if (r.status === "sent" && r.ticket) {
      const { ticketPending, ticketTries, ...rest } = entry;
      next[module] = { ...rest, ticket: r.ticket };
    } else {
      const tries = (Number(entry.ticketTries) || 0) + 1;
      if (tries >= MAX_TRIES) {
        say(`tracker gave up for ${module} after ${MAX_TRIES} tries`);
        const { ticketPending, ticketTries, ...rest } = entry;
        next[module] = rest;
      } else next[module] = { ...entry, ticketTries: tries };
    }
  }

  const undelivered = messages.length - delivered;
  let deliveryNote = "";
  if (undelivered > 0) {
    deliveryNote = delivered === 0 && !anyUsable ? "no alarm channel configured or usable" : "no alarm channel delivered";
    say(delivered === 0 ? deliveryNote : `${undelivered} of ${messages.length} messages not delivered`);
  }

  if (JSON.stringify(next) !== JSON.stringify(before)) {
    try { saveAlerts(alertsPath, next); } catch (e) { say(`cannot write ${alertsPath}: ${firstLine(e)}`); deliveryNote ||= "cannot write alert state"; }
  }

  try {
    if (deliveryNote) writeBeat(dir, WATCHER, { result: "error", note: deliveryNote, maxAgeMin: limits.watcher ?? 45, now });
    else writeBeat(dir, WATCHER, { result: "ok", note: `${judged.length} modules checked`, maxAgeMin: limits.watcher ?? 45, now });
  } catch (e) { say(`cannot write watcher beat: ${firstLine(e)}`); }

  return judged.some((j) => j.state !== "ok") || deliveryNote ? 1 : 0;
}

export function parseArgs(argv, env = process.env) {
  const o = { config: env.FOREMAN_DISPATCHER_CONFIG || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") {
      if (!argv[i + 1]) throw new Error("--config needs a value");
      o.config = argv[++i];
    } else throw new Error(`unknown option ${argv[i]}`);
  }
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let config;
  try {
    const o = parseArgs(process.argv.slice(2));
    const path = o.config ?? join(fileURLToPath(new URL(".", import.meta.url)), "config.json");
    if (!existsSync(path)) throw new Error(`config not found: ${path} (copy config.example.json to config.json)`);
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`watcher: ${e.message}`);
    process.exitCode = 2;
  }
  if (config) {
    try { process.exitCode = await watch({ config }); } catch (e) { console.error(`watcher: ${firstLine(e)}`); process.exitCode = 2; }
  }
}

#!/usr/bin/env node
// foreman dispatcher: central, model-free. For each enabled project it updates a read-only clone, runs the project's
// check script (scripts/autopilot-check.sh), parses TASK lines and PROMPT blocks and starts one work run per task:
// an HTTP POST to a Claude Code routine fire URL, or a command of your choice (`fire_command`, order on stdin).
// Costs no model tokens. Node 20+ and git only, no dependencies.
//
//   dispatch.sh [--config <file>] [--dry-run] [--project <name>] [--no-update]
//
// --dry-run: update and check as usual, print what would be started, start nothing and write no state.
// Config: see config.example.json. Secrets come from the environment (dispatcher.env), never from the config file.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { judge, readBeats, statusDir, writeBeat } from "./heartbeat.mjs";

const HARD_MAX_TASKS = 3;

export function expandHome(p) {
  return p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/** Parses the check output: TASK lines, PROMPT blocks, NOTHING. Returns { nothing, tasks: [{ n, kind, unit, info, prompt }] }. */
export function parseCheckOutput(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (lines.some((l) => l.startsWith("NOTHING|")) && !lines.some((l) => l.startsWith("TASK|"))) return { nothing: true, tasks: [] };
  const tasks = lines.filter((l) => l.startsWith("TASK|")).map((l, i) => {
    const [, kind, unit, ...info] = l.split("|");
    return { n: i + 1, kind, unit, info: info.join("|"), prompt: null };
  });
  const blocks = new Map();
  let cur = null;
  for (const l of lines) {
    const start = /^=== PROMPT (\d+) (\S+) (\S+) ===$/.exec(l);
    const end = /^=== (?:END|ENDE) (\d+) ===$/.exec(l);
    if (start) cur = { n: Number(start[1]), kind: start[2], unit: start[3], body: [] };
    else if (end && cur && cur.n === Number(end[1])) { blocks.set(cur.n, cur); cur = null; }
    else if (cur) cur.body.push(l);
  }
  for (const t of tasks) {
    const b = blocks.get(t.n);
    if (b && b.kind === t.kind && b.unit === t.unit) t.prompt = b.body.join("\n").trim();
  }
  return { nothing: false, tasks };
}

// Minimal child environment: PATH, HOME, LANG plus the pass_env pairs (name -> source variable).
// A project's script must not see another project's tokens, so nothing else is copied.
const SAFE_BASE_VARS = ["PATH", "HOME", "LANG"];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function safeEnv(env, passEnv = {}) {
  const out = {};
  for (const name of SAFE_BASE_VARS) if (env[name] !== undefined) out[name] = env[name];
  for (const [name, source] of Object.entries(passEnv ?? {})) {
    if (SAFE_BASE_VARS.includes(name) || !name || !ENV_NAME.test(name)) continue;
    if (typeof env[source] === "string" && env[source] !== "") out[name] = env[source];
  }
  return out;
}

export function redact(text, secrets) {
  return [...secrets].filter((s) => s && s.length >= 6).sort((a, b) => b.length - a.length)
    .reduce((t, s) => String(t).split(s).join("***"), String(text));
}

function loadState(path) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : { fired: {} };
  } catch { return { fired: {} }; }
}

/** Picks the tasks to start: at most `max` (never above 3), one per unit, none fired within the cooldown. */
export function selectTasks(tasks, state, now, { max = HARD_MAX_TASKS, cooldownMs = 45 * 60 * 1000 } = {}) {
  const chosen = [], skipped = [], units = new Set();
  for (const t of tasks) {
    if (!t.prompt) { skipped.push({ ...t, why: "no PROMPT block" }); continue; }
    const last = Date.parse(state.fired?.[t.unit] ?? ""); // cooldown per unit, whatever the kind
    if (units.has(t.unit) && t.unit !== "-") { skipped.push({ ...t, why: "unit already has a task" }); continue; }
    if (Number.isFinite(last) && now - last < cooldownMs) { skipped.push({ ...t, why: "fired recently" }); continue; }
    if (chosen.length >= Math.min(max, HARD_MAX_TASKS)) { skipped.push({ ...t, why: "limit reached" }); continue; }
    chosen.push(t);
    units.add(t.unit);
  }
  return { chosen, skipped };
}

async function fireHttp(project, task, env, fetchImpl) {
  const url = env[project.fire_url_env];
  const token = env[project.fire_token_env];
  if (!url || !token) throw new Error(`${project.fire_url_env} or ${project.fire_token_env} is not set`);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: task.prompt }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`fire URL answered ${res.status}: ${redact(body, [token]).slice(0, 200)}`);
  let session = null;
  try { session = JSON.parse(body).claude_code_session_url ?? null; } catch { /* not JSON */ }
  return session ? `session ${session}` : "started (no session URL in the answer)";
}

function fireCommand(project, task, repoDir, logDir, env) {
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${project.name}-${task.unit.replace(/[^\w.-]/g, "_")}.log`);
  const fd = openSync(logFile, "a");
  const child = spawn(project.fire_command, {
    shell: true, cwd: expandHome(project.fire_cwd) || repoDir, detached: true, stdio: ["pipe", fd, fd],
    // only this project's pass_env values reach the command, not other projects' tokens
    env: { ...safeEnv(env, project.pass_env), FOREMAN_PROJECT: project.name, FOREMAN_KIND: task.kind, FOREMAN_UNIT: task.unit },
  });
  child.stdin.on("error", () => {});
  child.stdin.end(task.prompt);
  child.unref();
  closeSync(fd);
  return `command started (pid ${child.pid}, log ${logFile})`;
}

/**
 * The environment for git: the dispatcher's environment (SSH agent, proxy, GIT_* settings), no credential prompts,
 * and GIT_SSH_COMMAND with the deploy key when a key is given.
 */
export function gitEnv(env, key) {
  const e = { ...env, GIT_TERMINAL_PROMPT: "0" };
  if (key) e.GIT_SSH_COMMAND = `ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes`;
  return e;
}

function git(args, cwd, env) {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8", timeout: 120000 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function updateRepo(project, workdir, env, log) {
  const dir = join(workdir, "repos", project.name);
  const key = project.deploy_key_env ? env[project.deploy_key_env] : expandHome(project.deploy_key);
  // git is not a project script: it gets the dispatcher environment (see gitEnv)
  const e = gitEnv(env, key);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(join(workdir, "repos"), { recursive: true });
    const r = git(["clone", "-q", project.repo, dir], workdir, e);
    if (r.status !== 0) throw new Error(`git clone failed: ${r.out.split("\n")[0]}`);
    log(`${project.name}: cloned`);
  }
  const f = git(["fetch", "-q", "--prune", "origin"], dir, e);
  if (f.status !== 0) throw new Error(`git fetch failed: ${f.out.split("\n")[0]}`);
  const branch = project.branch || "dev";
  const c = git(["checkout", "-q", "-B", branch, `origin/${branch}`], dir, e);
  if (c.status !== 0) throw new Error(`git checkout ${branch} failed: ${c.out.split("\n")[0]}`);
  return dir;
}

function runCheck(project, dir, env) {
  const cmd = project.check || "scripts/autopilot-check.sh";
  // the check script of one project must not see another project's tokens
  const passEnv = safeEnv(env, project.pass_env);
  const r = spawnSync(cmd, ["--no-fetch"], { cwd: dir, env: passEnv, encoding: "utf8", timeout: 180000, shell: true });
  if (r.status !== 0) throw new Error(`check exited with ${r.status ?? "a signal"}: ${String(r.stderr ?? "").trim().split("\n")[0] || "no message"}`);
  return { stdout: r.stdout ?? "", stderr: String(r.stderr ?? "").trim() };
}

function acquireLock(path) {
  try {
    writeFileSync(path, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const pid = Number(readFileSync(path, "utf8"));
      try { process.kill(pid, 0); return false; } catch { rmSync(path, { force: true }); writeFileSync(path, String(process.pid), { flag: "wx" }); return true; }
    } catch { return false; }
  }
}

const WEBHOOK_FORMATS = ["auto", "discord", "slack"];
const DISCORD_DOMAINS = ["discord.com", "discordapp.com"];

/** The webhook host of an https URL. Throws without showing the URL. */
function webhookHost(url) {
  let u = null;
  try { u = new URL(url); } catch { /* not a URL */ }
  if (!u || u.protocol !== "https:") throw new Error("invalid webhook URL: only https URLs are accepted");
  return u.hostname;
}

/**
 * The request for a failure webhook: { url, body } with body as a JSON string, or null when no URL is set.
 * Format `discord` sends {"content"}, `slack` sends {"text"}; `auto` picks by host. Throws (without the URL) when the
 * URL or the format is unusable.
 */
export function webhookRequest(config, env, message) {
  const url = env[config.webhook_url_env ?? "DISPATCHER_ERROR_WEBHOOK_URL"];
  if (!url) return null;
  const host = webhookHost(url);
  const format = config.webhook_format ?? "auto";
  if (!WEBHOOK_FORMATS.includes(format)) throw new Error("unknown webhook_format: use discord, slack or auto");
  let kind = format;
  if (format === "auto") {
    if (DISCORD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) kind = "discord";
    else if (host === "hooks.slack.com") kind = "slack";
    else throw new Error("unknown webhook host: set webhook_format to discord or slack");
  }
  return { url, body: JSON.stringify(kind === "discord" ? { content: message } : { text: message }) };
}

/** Sends a webhook. Returns "sent", "none" (no URL set, or URL/format unusable) or "failed". */
export async function notify(config, env, message, fetchImpl, log) {
  let req;
  try { req = webhookRequest(config, env, message); } catch (e) { log(`webhook not used: ${e.message}`); return "none"; }
  if (!req) return "none";
  try {
    // redirect: "error" keeps the request on the host that was checked
    const res = await fetchImpl(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: req.body, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (res && res.ok === false) { log(`webhook failed: answered ${res.status}`); return "failed"; }
    return "sent";
  } catch (e) { log(`webhook failed: ${redact(e.message, [req.url])}`); return "failed"; }
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_VERSION_FILE = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "VERSION");
const stripV = (s) => (s.startsWith("v") ? s.slice(1) : s);

/** Parses MAJOR.MINOR.PATCH[-pre] with one optional leading v (at most 40 characters). Returns null when invalid. */
export function parseSemver(s) {
  if (typeof s !== "string") return null;
  const v = stripV(s);
  const m = v.length <= 40 ? SEMVER.exec(v) : null;
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split(".") : [] };
}

/** SemVer 2.0 precedence: -1, 0 or 1. Null when either version is invalid. */
export function compareVersions(a, b) {
  const x = parseSemver(a), y = parseSemver(b);
  if (!x || !y) return null;
  for (const k of ["major", "minor", "patch"]) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(p) < Number(q) ? -1 : 1; }
    else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** True only when both versions are valid and the project's version is older. */
export function isOutdated(projectVersion, currentVersion) {
  return compareVersions(projectVersion, currentVersion) === -1;
}

/** The current foreman version: `{ version }` (no v) or `{ error }`. Never throws. */
export async function foremanVersion(config, { fetch: fetchImpl = fetch, versionFile = DEFAULT_VERSION_FILE } = {}) {
  const source = config.foreman_version_source ?? "release";
  if (source === "local") {
    try {
      const v = readFileSync(versionFile, "utf8").trim();
      return parseSemver(v) ? { version: stripV(v) } : { error: `${versionFile} has no valid version` };
    } catch (e) { return { error: `cannot read ${versionFile}: ${e.code ?? "error"}` }; }
  }
  if (source !== "release") return { error: `unknown foreman_version_source: ${source}` };
  const repo = config.foreman_repo ?? "AndreasByr/foreman";
  if (!REPO_NAME.test(repo)) return { error: "invalid foreman_repo: use owner/name" };
  let res;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "foreman-dispatcher" },
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch (e) { return { error: `release lookup failed: ${String(e?.message ?? e).split("\n")[0]}` }; }
  if (!res.ok) return { error: `release lookup answered ${res.status}` };
  try {
    const tag = (await res.json())?.tag_name;
    return parseSemver(tag) ? { version: stripV(tag) } : { error: "latest release has no valid tag_name" };
  } catch { return { error: "release lookup answered invalid JSON" }; }
}

/** The project's foreman version from .foreman.json: `{ version }` (no v) or `{ error }`. Never throws. */
export async function projectVersion(dir) {
  let json;
  try { json = JSON.parse(readFileSync(join(dir, ".foreman.json"), "utf8")); } catch { return { error: "no readable .foreman.json" }; }
  const v = json?.foreman;
  return parseSemver(v) ? { version: stripV(v) } : { error: "no valid foreman version in .foreman.json" };
}

/** Logs one line when the project is behind the foreman release; the release is looked up once per run. Never throws.
 *  Returns { old, current } when both versions are usable, otherwise nothing. */
async function checkForemanVersion(project, config, dir, cache, { fetch, versionFile, say }) {
  try {
    if (!cache.done) {
      cache.done = true;
      cache.current = await foremanVersion(config, { fetch, versionFile });
      if (cache.current.error) say(`foreman version unknown: ${cache.current.error}`);
    }
    if (cache.current.error) return;
    const p = await projectVersion(dir);
    if (p.error) say(`${project.name}: foreman version not usable: ${p.error}`);
    else {
      if (isOutdated(p.version, cache.current.version)) say(`${project.name}: foreman update available: ${p.version} -> ${cache.current.version}`);
      return { old: p.version, current: cache.current.version };
    }
  } catch (e) { say(`${project.name}: foreman version check failed: ${String(e?.message ?? e).split("\n")[0]}`); }
}

/** Small itsaplan REST client (same calls and errors as scripts/lib/itsaplan-api.mjs). */
export function itsaplanApi(url, key, fetchImpl) {
  const base = url.replace(/\/$/, ""), id = encodeURIComponent;
  async function request(path, method = "GET", body) {
    const res = await fetchImpl(`${base}${path}`, {
      method, headers: { "content-type": "application/json", "x-api-key": key },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (res.status >= 400) {
      const error = new Error(`itsaplan API ${res.status}: ${String(data.error ?? res.statusText).split(key).join("[redacted]")}`);
      error.status = res.status;
      throw error;
    }
    return data;
  }
  return {
    project: (k) => request(`/projects/${id(k)}`),
    async list(k) {
      const list = [];
      let cursor;
      do {
        const q = new URLSearchParams({ limit: "500", includeArchived: "true" });
        if (cursor) q.set("cursor", cursor);
        const data = await request(`/projects/${id(k)}/issues?${q}`);
        const page = data.items ?? data.issues ?? data;
        list.push(...page);
        cursor = data.nextCursor;
        if (!cursor && page.length === 500) throw new Error("More than 500 issues and no cursor, cannot page");
      } while (cursor);
      return list;
    },
    create: (k, body) => request(`/projects/${id(k)}/issues`, "POST", body),
    move: (issueId, columnId) => request(`/issues/${id(issueId)}`, "PATCH", { columnId }),
    comment: (issueId, body) => request(`/issues/${id(issueId)}/comments`, "POST", { body }),
  };
}

/**
 * Reports "foreman update available" once per version: an itsaplan ticket (only with module tracker-itsaplan) and a
 * webhook, remembered in state.update. Closes tickets of versions the project has reached. Never throws.
 * Returns true when a part failed. Writes the state itself (not on a dry run).
 */
async function updateStep(project, config, env, dir, state, statePath, { old, current }, { fetch: fetchImpl, say: log, dryRun, now, secrets, notify: sendNotify = notify }) {
  const name = project.name, u = state.update, outdated = isOutdated(old, current), before = JSON.stringify(state);
  const hookEnv = config.webhook_url_env ?? "DISPATCHER_ERROR_WEBHOOK_URL";
  const say = (m) => log(redact(m, [env[hookEnv]]));
  let failed = false;
  const fail = (part, e) => { failed = true; say(`${name}: update ${part} failed: ${redact(String(e?.message ?? e).split("\n")[0], secrets)}`); };
  let fj = {};
  try { fj = JSON.parse(readFileSync(join(dir, ".foreman.json"), "utf8")) ?? {}; } catch { /* projectVersion found it before */ }
  const pass = safeEnv(env, project.pass_env), url = pass.ITSAPLAN_URL, key = pass.ITSAPLAN_API_KEY, pk = fj.mirror?.itsaplan?.projectKey;
  const tracker = Array.isArray(fj.modules) && fj.modules.includes("tracker-itsaplan");
  const repo = REPO_NAME.test(config.foreman_repo ?? "") ? config.foreman_repo : "AndreasByr/foreman";
  const changelog = `https://github.com/${repo}/blob/main/CHANGELOG.md`;
  try {
    if (dryRun) {
      const ticket = tracker && pk && url && key && !u.ticket[current];
      if (tracker) {
        for (const [v, issueId] of Object.entries(u.ticket)) {
          if (compareVersions(old, v) >= 0) say(`${name}: would close update ticket ${issueId} (the project is on foreman ${old})`);
          else if (outdated && v !== current) say(`${name}: would close update ticket ${issueId} (superseded by foreman ${current})`);
        }
      }
      if (outdated) say(`${name}: would report update ${old} → ${current} (ticket: ${ticket ? "yes" : "no"}, webhook: ${!u.webhook[current] && env[hookEnv] ? "yes" : "no"})`);
      return false;
    }
    if (tracker && (outdated || Object.keys(u.ticket).length)) {
      if (!pk) { if (outdated) say(`${name}: update ticket skipped: mirror.itsaplan.projectKey missing`); }
      else if (!url || !key) { if (outdated) say(`${name}: update ticket skipped: ITSAPLAN_URL or ITSAPLAN_API_KEY missing in pass_env`); }
      else {
        try {
          const api = itsaplanApi(url, key, fetchImpl);
          let columns;
          const columnId = async (label, names) => {
            columns ??= (await api.project(pk)).columns ?? [];
            const aliases = fj.tracker?.columnAliases?.[label];
            const want = [label, ...names, ...(Array.isArray(aliases) ? aliases : [])].map((n) => String(n).toLowerCase());
            const c = columns.find((x) => want.includes(String(x.name).toLowerCase()));
            if (!c) throw new Error(`no column "${label}"`);
            return c.id;
          };
          // moves a recorded ticket to Done with a comment; a missing issue (404) is dropped from the state
          const retire = async (v, issueId, text) => {
            const done = await columnId("Done", []);
            try { await api.move(issueId, done); } catch (e) {
              if (e.status !== 404) throw e;
              say(`${name}: update ticket ${issueId} not found, dropped from the state`);
              delete u.ticket[v];
              return;
            }
            delete u.ticket[v];
            try { await api.comment(issueId, text); } catch (e) {
              say(`${name}: update ticket comment failed: ${redact(String(e?.message ?? e).split("\n")[0], secrets)}`);
            }
          };
          for (const [v, issueId] of Object.entries(u.ticket)) {
            if (compareVersions(old, v) >= 0) await retire(v, issueId, `Closed by the dispatcher: the project is on foreman ${old}.`);
          }
          if (outdated) {
            if (!u.ticket[current]) {
              const title = `foreman update available: ${old} → ${current}`;
              const column = await columnId("Action Required", ["Intervention needed"]);
              const found = (await api.list(pk)).find((i) => i.title === title);
              const description = [
                `The project is on foreman ${old}; the current version is ${current}.`, "",
                "1. Open the project chat and run `foreman-update`. It compares the versions and lists the changes.",
                `2. Read the Upgrade section for ${current}: ${changelog}`,
                "3. Run the order it writes in the project (`install.sh --update`, dry run first).", "",
                `This ticket closes itself once .foreman.json shows ${current}. Created by the dispatcher.`,
              ].join("\n");
              u.ticket[current] = found?.id ?? (await api.create(pk, { title, description, columnId: column })).id;
            }
            for (const [v, issueId] of Object.entries(u.ticket)) if (v !== current) await retire(v, issueId, `Superseded by foreman ${current}.`);
          }
        } catch (e) { fail("ticket", e); }
      }
    }
    if (outdated) {
      for (const v of Object.keys(u.webhook)) if (v !== current) delete u.webhook[v];
      if (!u.webhook[current]) {
        const msg = `foreman update available for ${name}: ${old} → ${current}. Run foreman-update in the project chat. Upgrade notes: ${changelog}`;
        const r = await sendNotify(config, env, msg, fetchImpl, say);
        if (r === "sent") u.webhook[current] = new Date(now).toISOString();
        else if (r === "failed") fail("webhook", new Error("delivery failed, see the webhook line above"));
      }
    }
    if (JSON.stringify(state) !== before) writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (e) { fail("state", e); }
  return failed;
}

/** Alarms through the webhook when the watcher beat exists and is not ok, at most once per alarm.repeat_hours. Never throws. */
async function watcherCheck(config, env, { workdir, statusPath, now, fetchImpl, say }) {
  try {
    const w = readBeats(statusPath).find((b) => b.module === "watcher");
    if (!w) return;
    const limit = config.heartbeat?.limits_minutes?.watcher ?? 45;
    const j = judge([w], { now, limits: { watcher: limit } })[0];
    if (j.state === "ok") return;
    const peerPath = join(workdir, "peer.json");
    let peer = {};
    try { const p = JSON.parse(readFileSync(peerPath, "utf8")); if (p && typeof p === "object" && !Array.isArray(p)) peer = p; } catch { /* none yet */ }
    const last = Date.parse(peer.watcher ?? "");
    const repeatMs = (config.alarm?.repeat_hours ?? 6) * 3600 * 1000;
    if (Number.isFinite(last) && now - last < repeatMs) return;
    let msg = `foreman watcher is not reporting: last run ${w.last_run ?? "never"}, limit ${limit} min`;
    if (w.result === "error" && w.note) msg += ` (error: ${w.note})`;
    const r = await notify(config, env, msg, fetchImpl, say);
    if (r === "sent") {
      peer.watcher = new Date(now).toISOString();
      writeFileSync(peerPath, `${JSON.stringify(peer, null, 2)}\n`);
    }
  } catch (e) { say(`watcher check failed: ${String(e?.message ?? e).split("\n")[0]}`); }
}

/** Runs the dispatcher for all projects. Returns the exit code (1 when any project failed). */
export async function run({ config, env = process.env, dryRun = false, only = null, update = true, now = Date.now(), fetch: fetchImpl = fetch, log = (m) => console.log(m), versionFile = undefined } = {}) {
  const workdir = expandHome(config.workdir || "~/.local/share/foreman-dispatcher");
  const stateDir = join(workdir, "state");
  mkdirSync(stateDir, { recursive: true });
  const lock = join(workdir, "dispatch.lock");
  if (!dryRun && !acquireLock(lock)) { log("another dispatcher run is active; skipping"); return 0; }
  const cooldownMs = (config.cooldown_minutes ?? 45) * 60 * 1000;
  let failed = false, notifyFailed = false;
  const failedProjects = [];
  const versionCache = { done: false, current: null };
  const stamp = (m) => log(`[${new Date(now).toISOString()}] ${m}`);
  const sendNotify = async (...a) => { const r = await notify(...a); if (r === "failed") notifyFailed = true; return r; };
  const statusPath = statusDir(config, env);
  const beat = (module, result, note, maxAgeMin = null, redactWith = []) => {
    try { writeBeat(statusPath, module, { result, note: redact(String(note ?? "").split("\n")[0], redactWith), maxAgeMin, now }); }
    catch (e) { stamp(`heartbeat not written: ${String(e?.message ?? e).split("\n")[0]}`); }
  };
  try {
    for (const project of config.projects ?? []) {
      if (project.enabled === false || (only && project.name !== only)) continue;
      const secrets = [env[project.fire_token_env], project.deploy_key_env ? env[project.deploy_key_env] : null, ...Object.values(project.pass_env ?? {}).map((n) => env[n])];
      const say = (m) => log(`[${new Date(now).toISOString()}] ${redact(m, secrets)}`);
      let pErr = null, pNote = null, started = 0;
      try {
        let dir = join(workdir, "repos", project.name);
        if (update) dir = updateRepo(project, workdir, env, say);
        else if (!existsSync(join(dir, ".git"))) throw new Error("no clone yet (run without --no-update first)");
        const statePath = join(stateDir, `${project.name}.json`);
        const state = loadState(statePath);
        state.fired ??= {};
        state.update = { ...state.update, webhook: state.update?.webhook ?? {}, ticket: state.update?.ticket ?? {} };
        if (project.update_notice !== false && config.update_notice !== false) {
          const versions = await checkForemanVersion(project, config, dir, versionCache, { fetch: fetchImpl, versionFile, say });
          if (versions) {
            const upFailed = await updateStep(project, config, env, dir, state, statePath, versions, { fetch: fetchImpl, say, dryRun, now, secrets, notify: sendNotify });
            if (upFailed) { failed = true; pErr ??= "update step failed"; }
          }
        }
        const { stdout, stderr } = runCheck(project, dir, env);
        for (const l of stderr.split("\n").filter(Boolean)) say(`${project.name}: check note: ${l}`);
        const parsed = parseCheckOutput(stdout);
        if (parsed.nothing || !parsed.tasks.length) { say(`${project.name}: nothing to do`); pNote = "nothing to do"; continue; }
        const { chosen, skipped } = selectTasks(parsed.tasks, state, now, { max: project.max_tasks ?? HARD_MAX_TASKS, cooldownMs });
        for (const s of skipped) say(`${project.name}: skip ${s.kind} ${s.unit} (${s.why})`);
        for (const task of chosen) {
          if (dryRun) { say(`${project.name}: would start ${task.kind} ${task.unit} (${task.info}) via ${project.fire_command ? "command" : "fire URL"}`); continue; }
          try {
            const result = project.fire_command ? fireCommand(project, task, dir, join(workdir, "logs"), env) : await fireHttp(project, task, env, fetchImpl);
            say(`${project.name}: started ${task.kind} ${task.unit}: ${result}`);
            state.fired[task.unit] = new Date(now).toISOString();
            started++;
          } catch (e) {
            failed = true;
            const msg = `Dispatcher ${project.name}: could not start ${task.kind} ${task.unit}: ${redact(e.message, secrets)}`;
            pErr ??= msg;
            say(msg);
            await sendNotify(config, env, msg, fetchImpl, say);
          }
        }
        if (!dryRun) {
          for (const [k, v] of Object.entries(state.fired)) if (now - Date.parse(v) > 24 * 3600 * 1000) delete state.fired[k];
          writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
        }
      } catch (e) {
        failed = true;
        const msg = `Dispatcher ${project.name}: ${redact(e.message, secrets)}. Nothing was started.`;
        pErr = msg;
        say(msg);
        await sendNotify(config, env, msg, fetchImpl, say);
      } finally {
        if (!dryRun) {
          if (pErr) failedProjects.push(project.name);
          beat(`project:${project.name}`, pErr ? "error" : "ok", pErr ?? pNote ?? `started ${started}`, null, secrets);
        }
      }
    }
  } finally {
    if (!dryRun) rmSync(lock, { force: true });
  }
  if (!dryRun) {
    const dispatcherLimit = config.heartbeat?.limits_minutes?.dispatcher ?? 30;
    if (failed) beat("dispatcher", "error", `failed: ${failedProjects.join(", ")}${notifyFailed ? ", notification failed" : ""}`, dispatcherLimit);
    else beat("dispatcher", "ok", `${(config.projects ?? []).filter((p) => p.enabled !== false && (!only || p.name === only)).length} projects`, dispatcherLimit);
    await watcherCheck(config, env, { workdir, statusPath, now, fetchImpl, say: stamp });
  }
  return failed ? 1 : 0;
}

export function parseArgs(argv, env = process.env) {
  const o = { config: env.FOREMAN_DISPATCHER_CONFIG || null, dryRun: false, only: null, update: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-update") o.update = false;
    else if (a === "--config" || a === "--project") {
      if (!argv[i + 1]) throw new Error(`${a} needs a value`);
      o[a === "--config" ? "config" : "only"] = argv[++i];
    } else throw new Error(`unknown option ${a}`);
  }
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const here = fileURLToPath(new URL(".", import.meta.url));
    const path = o.config ?? join(here, "config.json");
    if (!existsSync(path)) throw new Error(`config not found: ${path} (copy config.example.json to config.json)`);
    const config = JSON.parse(readFileSync(path, "utf8"));
    run({ config, dryRun: o.dryRun, only: o.only, update: o.update }).then((c) => { process.exitCode = c; });
  } catch (e) {
    console.error(`dispatcher: ${e.message}`);
    process.exitCode = 2;
  }
}

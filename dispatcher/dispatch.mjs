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
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { fired: {} }; }
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

function git(args, cwd, env) {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8", timeout: 120000 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function updateRepo(project, workdir, env, log) {
  const dir = join(workdir, "repos", project.name);
  const key = project.deploy_key_env ? env[project.deploy_key_env] : expandHome(project.deploy_key);
  // git gets only the base variables, so no other project's tokens leak into git's environment
  const e = { ...safeEnv(env, {}), GIT_TERMINAL_PROMPT: "0" };
  if (key) e.GIT_SSH_COMMAND = `ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes`;
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

async function notify(config, env, message, fetchImpl, log) {
  const url = env[config.webhook_url_env ?? "DISPATCHER_ERROR_WEBHOOK_URL"];
  if (!url) return;
  try {
    await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message, content: message }), signal: AbortSignal.timeout(15000) });
  } catch (e) { log(`webhook failed: ${e.message}`); }
}

/** Runs the dispatcher for all projects. Returns the exit code (1 when any project failed). */
export async function run({ config, env = process.env, dryRun = false, only = null, update = true, now = Date.now(), fetch: fetchImpl = fetch, log = (m) => console.log(m) } = {}) {
  const workdir = expandHome(config.workdir || "~/.local/share/foreman-dispatcher");
  const stateDir = join(workdir, "state");
  mkdirSync(stateDir, { recursive: true });
  const lock = join(workdir, "dispatch.lock");
  if (!dryRun && !acquireLock(lock)) { log("another dispatcher run is active; skipping"); return 0; }
  const cooldownMs = (config.cooldown_minutes ?? 45) * 60 * 1000;
  let failed = false;
  try {
    for (const project of config.projects ?? []) {
      if (project.enabled === false || (only && project.name !== only)) continue;
      const secrets = [env[project.fire_token_env], project.deploy_key_env ? env[project.deploy_key_env] : null, ...Object.values(project.pass_env ?? {}).map((n) => env[n])];
      const say = (m) => log(`[${new Date(now).toISOString()}] ${redact(m, secrets)}`);
      try {
        let dir = join(workdir, "repos", project.name);
        if (update) dir = updateRepo(project, workdir, env, say);
        else if (!existsSync(join(dir, ".git"))) throw new Error("no clone yet (run without --no-update first)");
        const { stdout, stderr } = runCheck(project, dir, env);
        for (const l of stderr.split("\n").filter(Boolean)) say(`${project.name}: check note: ${l}`);
        const parsed = parseCheckOutput(stdout);
        if (parsed.nothing || !parsed.tasks.length) { say(`${project.name}: nothing to do`); continue; }
        const statePath = join(stateDir, `${project.name}.json`);
        const state = loadState(statePath);
        const { chosen, skipped } = selectTasks(parsed.tasks, state, now, { max: project.max_tasks ?? HARD_MAX_TASKS, cooldownMs });
        for (const s of skipped) say(`${project.name}: skip ${s.kind} ${s.unit} (${s.why})`);
        for (const task of chosen) {
          if (dryRun) { say(`${project.name}: would start ${task.kind} ${task.unit} (${task.info}) via ${project.fire_command ? "command" : "fire URL"}`); continue; }
          try {
            const result = project.fire_command ? fireCommand(project, task, dir, join(workdir, "logs"), env) : await fireHttp(project, task, env, fetchImpl);
            say(`${project.name}: started ${task.kind} ${task.unit}: ${result}`);
            state.fired[task.unit] = new Date(now).toISOString();
          } catch (e) {
            failed = true;
            const msg = `Dispatcher ${project.name}: could not start ${task.kind} ${task.unit}: ${redact(e.message, secrets)}`;
            say(msg);
            await notify(config, env, msg, fetchImpl, say);
          }
        }
        if (!dryRun) {
          for (const [k, v] of Object.entries(state.fired)) if (now - Date.parse(v) > 24 * 3600 * 1000) delete state.fired[k];
          writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
        }
      } catch (e) {
        failed = true;
        const msg = `Dispatcher ${project.name}: ${redact(e.message, secrets)}. Nothing was started.`;
        say(msg);
        await notify(config, env, msg, fetchImpl, say);
      }
    }
  } finally {
    if (!dryRun) rmSync(lock, { force: true });
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

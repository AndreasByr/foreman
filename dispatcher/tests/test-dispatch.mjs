#!/usr/bin/env node
// Tests for the dispatcher. Run: node dispatcher/tests/test-dispatch.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCheckOutput, selectTasks, run, redact, parseArgs } from "../dispatch.mjs";

const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const SAMPLE = [
  "TASK|pretest-run|u1|round 1 on dev",
  "TASK|coding|u2|slice since 2026-01-01T00:00:00Z",
  "TASK|coding|u1|slice",
  "TASK|batch|batch:dev|window",
  "",
  "=== PROMPT 1 pretest-run u1 ===",
  "Foreman task: pretest-run | unit: u1",
  "line two",
  "=== END 1 ===",
  "=== PROMPT 2 coding u2 ===",
  "Foreman task: coding | unit: u2",
  "=== ENDE 2 ===",
  "=== PROMPT 3 coding u1 ===",
  "x",
  "=== END 3 ===",
].join("\n");

t("parse: tasks, prompt blocks (END and ENDE), missing block, NOTHING", () => {
  const p = parseCheckOutput(SAMPLE);
  assert.equal(p.tasks.length, 4);
  assert.equal(p.tasks[0].prompt, "Foreman task: pretest-run | unit: u1\nline two");
  assert.equal(p.tasks[1].prompt, "Foreman task: coding | unit: u2");
  assert.equal(p.tasks[3].prompt, null);
  assert.deepEqual(parseCheckOutput("NOTHING|Nothing to do."), { nothing: true, tasks: [] });
  assert.equal(parseCheckOutput("TASK|coding|u|a|b with pipe\n").tasks[0].info, "a|b with pipe");
});

t("select: one per unit, limit 3 even when configured higher, cooldown, no block", () => {
  const p = parseCheckOutput(SAMPLE);
  const now = Date.parse("2026-01-01T10:00:00Z");
  const { chosen, skipped } = selectTasks(p.tasks, { fired: {} }, now, { max: 9 });
  assert.deepEqual(chosen.map((x) => x.unit), ["u1", "u2"]);
  assert.deepEqual(skipped.map((x) => x.why), ["unit already has a task", "no PROMPT block"]);
  const recent = selectTasks(p.tasks, { fired: { u1: "2026-01-01T09:40:00Z" } }, now);
  assert.deepEqual(recent.chosen.map((x) => x.unit), ["u2"], "u1 was fired 20 minutes ago");
  const old = selectTasks(p.tasks, { fired: { u1: "2026-01-01T08:00:00Z" } }, now);
  assert.equal(old.chosen[0].unit, "u1");
  const many = Array.from({ length: 6 }, (_, i) => ({ n: i, kind: "coding", unit: `x${i}`, info: "", prompt: "p" }));
  assert.equal(selectTasks(many, { fired: {} }, now, { max: 10 }).chosen.length, 3);
  assert.equal(selectTasks(many, { fired: {} }, now, { max: 1 }).chosen.length, 1);
});

t("redact and args", () => {
  assert.equal(redact("a SECRETTOKEN b", ["SECRETTOKEN", "x"]), "a *** b");
  assert.deepEqual(parseArgs(["--dry-run", "--project", "p", "--no-update"], {}), { config: null, dryRun: true, only: "p", update: false });
  assert.throws(() => parseArgs(["--nope"], {}), /unknown option/);
  assert.throws(() => parseArgs(["--config"], {}), /needs a value/);
});

function sh(cwd, ...args) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

/** A local "remote" repository whose scripts/autopilot-check.sh prints `output` and exits with `code`. */
function makeRemote(dir, output, code = 0) {
  const origin = join(dir, "origin");
  mkdirSync(join(origin, "scripts"), { recursive: true });
  sh(origin, "init", "-q", "-b", "dev");
  sh(origin, "config", "user.email", "t@example.com"); sh(origin, "config", "user.name", "t");
  writeFileSync(join(origin, "out.txt"), output);
  writeFileSync(join(origin, "scripts/autopilot-check.sh"), `#!/usr/bin/env bash\ncat "$(dirname "$0")/../out.txt"\n[ ${code} = 0 ] || { echo "boom" >&2; exit ${code}; }\n`);
  chmodSync(join(origin, "scripts/autopilot-check.sh"), 0o755);
  sh(origin, "add", "."); sh(origin, "commit", "-qm", "init");
  return origin;
}

const TOKEN = "tok_SECRET_1234567890";
function setup(output, { code = 0, project = {}, config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-disp-"));
  const origin = makeRemote(dir, output, code);
  const cfg = {
    workdir: join(dir, "work"), ...config,
    projects: [{ name: "p", repo: origin, branch: "dev", fire_url_env: "P_URL", fire_token_env: "P_TOKEN", ...project }],
  };
  const env = { P_URL: "https://fire.example/api", P_TOKEN: TOKEN, PATH: process.env.PATH, HOME: process.env.HOME };
  return { dir, cfg, env };
}

t("run: fires one POST per task with the documented headers and body, never logs the token, remembers the fire", async () => {
  const { dir, cfg, env } = setup(SAMPLE);
  try {
    const calls = [], logs = [];
    const fetch = async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200, text: async () => JSON.stringify({ claude_code_session_url: "https://claude.ai/code/session_x" }) }; };
    const code = await run({ config: cfg, env, fetch, log: (m) => logs.push(m), now: Date.parse("2026-01-01T10:00:00Z") });
    assert.equal(code, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://fire.example/api");
    assert.equal(calls[0].o.method, "POST");
    assert.equal(calls[0].o.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(calls[0].o.headers["anthropic-beta"], "experimental-cc-routine-2026-04-01");
    assert.equal(calls[0].o.headers["anthropic-version"], "2023-06-01");
    assert.deepEqual(JSON.parse(calls[0].o.body), { text: "Foreman task: pretest-run | unit: u1\nline two" });
    assert.ok(logs.some((l) => l.includes("session https://claude.ai/code/session_x")));
    assert.ok(!logs.join("\n").includes(TOKEN));
    // second run right away: cooldown prevents a double start
    calls.length = 0;
    await run({ config: cfg, env, fetch, log: () => {}, update: false, now: Date.parse("2026-01-01T10:10:00Z") });
    assert.equal(calls.length, 0);
    await run({ config: cfg, env, fetch, log: () => {}, update: false, now: Date.parse("2026-01-01T11:00:00Z") });
    assert.equal(calls.length, 2, "cooldown over");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run --dry-run: starts nothing, writes no state, says what it would do", async () => {
  const { dir, cfg, env } = setup(SAMPLE);
  try {
    const logs = [];
    const fetch = async () => { throw new Error("must not be called"); };
    assert.equal(await run({ config: cfg, env, fetch, dryRun: true, log: (m) => logs.push(m) }), 0);
    assert.ok(logs.some((l) => l.includes("would start pretest-run u1")));
    assert.ok(!existsSync(join(cfg.workdir, "state", "p.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: check exit code not 0 starts nothing, exits 1 and calls the webhook without secrets", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { code: 3 });
  try {
    const posts = [];
    const fetch = async (url, o) => { posts.push({ url, body: o.body }); return { ok: true, status: 200, text: async () => "" }; };
    const logs = [];
    const code = await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: "https://hook.example/x" }, fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1);
    assert.deepEqual(posts.map((p) => p.url), ["https://hook.example/x"], "only the webhook was called");
    assert.ok(posts[0].body.includes("check exited with 3") && posts[0].body.includes("Nothing was started"));
    assert.ok(!posts[0].body.includes(TOKEN));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: failing fire URL is reported, other tasks go on, token redacted", async () => {
  const { dir, cfg, env } = setup(SAMPLE);
  try {
    let n = 0;
    const fetch = async (url, o) => {
      if (url.includes("hook")) return { ok: true, status: 200, text: async () => "" };
      n++;
      return n === 1 ? { ok: false, status: 401, text: async () => `bad token ${TOKEN}` } : { ok: true, status: 200, text: async () => "{}" };
    };
    const logs = [];
    const code = await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: "https://hook.example/x" }, fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1);
    assert.equal(n, 2, "second task still started");
    assert.ok(!logs.join("\n").includes(TOKEN));
    assert.ok(logs.some((l) => l.includes("401")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: NOTHING and disabled projects", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    const logs = [];
    assert.equal(await run({ config: cfg, env, fetch: async () => { throw new Error("no"); }, log: (m) => logs.push(m) }), 0);
    assert.ok(logs.some((l) => l.includes("nothing to do")));
    logs.length = 0;
    cfg.projects[0].enabled = false;
    await run({ config: cfg, env, log: (m) => logs.push(m) });
    assert.equal(logs.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: fire_command gets the order on stdin and the unit in the environment", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { project: { fire_command: `cat > "$FOREMAN_UNIT.order"; echo "$FOREMAN_KIND" > "$FOREMAN_UNIT.kind"`, fire_url_env: undefined, fire_token_env: undefined, fire_cwd: undefined } });
  try {
    const logs = [];
    assert.equal(await run({ config: cfg, env, log: (m) => logs.push(m) }), 0);
    const repo = join(cfg.workdir, "repos", "p");
    for (let i = 0; i < 50 && !existsSync(join(repo, "u2.kind")); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(readFileSync(join(repo, "u1.order"), "utf8"), "Foreman task: pretest-run | unit: u1\nline two");
    assert.equal(readFileSync(join(repo, "u2.kind"), "utf8").trim(), "coding");
    assert.ok(logs.some((l) => l.includes("command started")));
  } finally { await new Promise((r) => setTimeout(r, 200)); rmSync(dir, { recursive: true, force: true }); }
});

t("run: a second dispatcher run at the same time skips; a stale lock is taken over", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    mkdirSync(cfg.workdir, { recursive: true });
    writeFileSync(join(cfg.workdir, "dispatch.lock"), String(process.pid));
    const logs = [];
    await run({ config: cfg, env, log: (m) => logs.push(m) });
    assert.ok(logs[0].includes("another dispatcher run is active"));
    writeFileSync(join(cfg.workdir, "dispatch.lock"), "999999");
    logs.length = 0;
    await run({ config: cfg, env, log: (m) => logs.push(m) });
    assert.ok(logs.some((l) => l.includes("nothing to do")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("dispatch.sh --dry-run end to end", () => {
  const { dir, cfg } = setup(SAMPLE);
  try {
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify(cfg));
    const script = new URL("../dispatch.sh", import.meta.url).pathname;
    const out = execFileSync("bash", [script, "--config", cfgPath, "--dry-run"], { encoding: "utf8", env: { ...process.env, FOREMAN_DISPATCHER_ENV: join(dir, "none.env"), P_URL: "https://fire.example", P_TOKEN: TOKEN } });
    assert.ok(out.includes("would start pretest-run u1") && out.includes("would start coding u2"));
    assert.ok(!out.includes(TOKEN));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

let n = 0;
for (const [name, fn] of queue) { await fn(); n++; console.log(`ok ${name}`); }
console.log(`${n} tests passed`);

#!/usr/bin/env node
// Tests for the dispatcher. Run: node dispatcher/tests/test-dispatch.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCheckOutput, selectTasks, run, redact, parseArgs, safeEnv } from "../dispatch.mjs";
import * as dispatchModule from "../dispatch.mjs";

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
function makeRemote(dir, output, code = 0, checkScript = null) {
  const origin = join(dir, "origin");
  mkdirSync(join(origin, "scripts"), { recursive: true });
  sh(origin, "init", "-q", "-b", "dev");
  sh(origin, "config", "user.email", "t@example.com"); sh(origin, "config", "user.name", "t");
  writeFileSync(join(origin, "out.txt"), output);
  writeFileSync(join(origin, "scripts/autopilot-check.sh"), checkScript ?? `#!/usr/bin/env bash\ncat "$(dirname "$0")/../out.txt"\n[ ${code} = 0 ] || { echo "boom" >&2; exit ${code}; }\n`);
  chmodSync(join(origin, "scripts/autopilot-check.sh"), 0o755);
  sh(origin, "add", "."); sh(origin, "commit", "-qm", "init");
  return origin;
}

const TOKEN = "tok_SECRET_1234567890";
function setup(output, { code = 0, project = {}, config = {}, checkScript = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-disp-"));
  const origin = makeRemote(dir, output, code, checkScript);
  const cfg = {
    workdir: join(dir, "work"), update_notice: false, ...config,
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
  const { dir, cfg, env } = setup(SAMPLE, { code: 3, config: { webhook_format: "discord" } });
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
  const { dir, cfg, env } = setup(SAMPLE, { config: { webhook_format: "discord" } });
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

const OTHER_SECRET = "other-secret-token-123";

/** Variable names from `env` output (NAME=value lines only). */
function envNames(dump) {
  return dump.split("\n").map((l) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(l)?.[1]).filter(Boolean);
}

t("safeEnv: keeps only PATH, HOME, LANG and the pass_env pairs", () => {
  const env = { PATH: "/usr/bin", HOME: "/home/u", LANG: "C.UTF-8", OTHER_FIRE_TOKEN: OTHER_SECRET, OTHER_PROJECT_KEY: "other-key-456", P_TOKEN: TOKEN, SRC_TOKEN: "pass-me-123" };
  assert.deepEqual(safeEnv(env, { DEPLOY_TOKEN: "SRC_TOKEN" }), { PATH: "/usr/bin", HOME: "/home/u", LANG: "C.UTF-8", DEPLOY_TOKEN: "pass-me-123" });
});

t("safeEnv: PATH, HOME, LANG only when set", () => {
  assert.deepEqual(safeEnv({ HOME: "/h" }, {}), { HOME: "/h" });
  assert.deepEqual(safeEnv({}, {}), {});
});

t("safeEnv: pass_env names PATH, HOME, LANG, empty or invalid are ignored", () => {
  const env = { PATH: "/usr/bin", HOME: "/home/u", LANG: "C.UTF-8", EVIL: "evil-value", SRC: "src-value" };
  const out = safeEnv(env, { PATH: "EVIL", HOME: "EVIL", LANG: "EVIL", "": "SRC", "1BAD": "SRC", "BAD-NAME": "SRC", "A B": "SRC", GOOD_NAME: "SRC" });
  assert.deepEqual(out, { PATH: "/usr/bin", HOME: "/home/u", LANG: "C.UTF-8", GOOD_NAME: "src-value" });
});

t("safeEnv: missing or empty source variable adds nothing", () => {
  assert.deepEqual(safeEnv({ PATH: "/p", EMPTY: "" }, { A: "MISSING", B: "EMPTY" }), { PATH: "/p" });
});

t("safeEnv: other projects' secrets never pass", () => {
  const out = safeEnv({ PATH: "/usr/bin", OTHER_FIRE_TOKEN: OTHER_SECRET, OTHER_PROJECT_KEY: "other-key-456" }, {});
  assert.ok(!("OTHER_FIRE_TOKEN" in out) && !("OTHER_PROJECT_KEY" in out));
  assert.ok(!JSON.stringify(out).includes(OTHER_SECRET));
});

t("run: the check script gets only PATH, HOME, LANG and pass_env, never other secrets", async () => {
  const { dir, cfg, env } = setup("", {
    checkScript: `#!/usr/bin/env bash\nenv > envdump.txt\necho "NOTHING|Nothing to do."\n`,
    project: { pass_env: { DEPLOY_KEY_VALUE: "SOURCE_DEPLOY_KEY" } },
  });
  try {
    const testEnv = { ...env, LANG: "C.UTF-8", OTHER_FIRE_TOKEN: OTHER_SECRET, OTHER_PROJECT_KEY: "other-key-456", SOURCE_DEPLOY_KEY: "pass-value-42" };
    const logs = [];
    const code = await run({ config: cfg, env: testEnv, fetch: async () => { throw new Error("must not be called"); }, log: (m) => logs.push(m) });
    assert.equal(code, 0);
    assert.ok(!logs.join("\n").includes(OTHER_SECRET), "other project's token in the dispatcher log");
    const dump = readFileSync(join(cfg.workdir, "repos", "p", "envdump.txt"), "utf8");
    assert.ok(!dump.includes(OTHER_SECRET), "other project's token leaked to the check");
    assert.ok(!dump.includes("other-key-456"), "other project's key leaked to the check");
    assert.ok(!dump.includes(TOKEN), "project fire token leaked to the check");
    assert.ok(dump.split("\n").includes("DEPLOY_KEY_VALUE=pass-value-42"), "pass_env variable missing under its new name");
    const allowed = new Set(["PATH", "HOME", "LANG", "DEPLOY_KEY_VALUE", "PWD", "SHLVL", "_", "OLDPWD"]);
    for (const name of envNames(dump)) assert.ok(allowed.has(name), `unexpected variable ${name} in the check environment`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: fire_command gets FOREMAN_* plus PATH, HOME, LANG and pass_env, never other secrets", async () => {
  const { dir, cfg, env } = setup(SAMPLE, {
    project: {
      fire_command: `env > "$FOREMAN_UNIT.tmp" && mv "$FOREMAN_UNIT.tmp" "$FOREMAN_UNIT.env"`,
      pass_env: { DEPLOY_KEY_VALUE: "SOURCE_DEPLOY_KEY" },
      fire_url_env: undefined, fire_token_env: undefined, fire_cwd: undefined,
    },
  });
  // The dispatcher runs under dispatch.sh, which exports the other project's secrets into the process environment.
  const saved = { OTHER_FIRE_TOKEN: process.env.OTHER_FIRE_TOKEN, P_TOKEN: process.env.P_TOKEN };
  process.env.OTHER_FIRE_TOKEN = OTHER_SECRET;
  process.env.P_TOKEN = TOKEN;
  try {
    const testEnv = { ...env, LANG: "C.UTF-8", OTHER_FIRE_TOKEN: OTHER_SECRET, SOURCE_DEPLOY_KEY: "pass-value-42" };
    const logs = [];
    assert.equal(await run({ config: cfg, env: testEnv, log: (m) => logs.push(m) }), 0);
    const repo = join(cfg.workdir, "repos", "p");
    for (let i = 0; i < 50 && !(existsSync(join(repo, "u1.env")) && existsSync(join(repo, "u2.env"))); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(!logs.join("\n").includes(OTHER_SECRET), "other project's token in the dispatcher log");
    const logDir = join(cfg.workdir, "logs");
    const logFiles = readdirSync(logDir);
    assert.ok(logFiles.length >= 2, "the command's log files exist");
    for (const f of logFiles) {
      const text = readFileSync(join(logDir, f), "utf8");
      assert.ok(!text.includes(OTHER_SECRET), `${f}: other project's token in the command log`);
      assert.ok(!text.includes(TOKEN), `${f}: project fire token in the command log`);
    }
    const allowed = new Set(["FOREMAN_PROJECT", "FOREMAN_KIND", "FOREMAN_UNIT", "PATH", "HOME", "LANG", "DEPLOY_KEY_VALUE", "PWD", "SHLVL", "_", "OLDPWD"]);
    for (const [file, kind] of [["u1.env", "pretest-run"], ["u2.env", "coding"]]) {
      const unit = file.slice(0, -4);
      const dump = readFileSync(join(repo, file), "utf8");
      assert.ok(!dump.includes(OTHER_SECRET), `${file}: other project's token leaked to the command`);
      assert.ok(!dump.includes(TOKEN), `${file}: project fire token leaked to the command`);
      const lines = dump.split("\n");
      assert.ok(lines.includes("FOREMAN_PROJECT=p") && lines.includes(`FOREMAN_KIND=${kind}`) && lines.includes(`FOREMAN_UNIT=${unit}`), `${file}: FOREMAN_* missing`);
      assert.ok(lines.includes("DEPLOY_KEY_VALUE=pass-value-42"), `${file}: pass_env variable missing under its new name`);
      for (const name of envNames(dump)) assert.ok(allowed.has(name), `${file}: unexpected variable ${name}`);
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await new Promise((r) => setTimeout(r, 200));
    rmSync(dir, { recursive: true, force: true });
  }
});

t("run --dry-run and webhook bodies never contain another project's secret", async () => {
  const ok = setup(SAMPLE);
  const bad = setup(SAMPLE, { code: 3, config: { webhook_format: "discord" } });
  try {
    const logs = [];
    const dryEnv = { ...ok.env, OTHER_FIRE_TOKEN: OTHER_SECRET };
    assert.equal(await run({ config: ok.cfg, env: dryEnv, dryRun: true, fetch: async () => { throw new Error("must not be called"); }, log: (m) => logs.push(m) }), 0);
    assert.ok(logs.some((l) => l.includes("would start pretest-run u1")));
    assert.ok(!logs.join("\n").includes(OTHER_SECRET), "dry-run output");
    const posts = [];
    const fetch = async (url, o) => { posts.push(o.body); return { ok: true, status: 200, text: async () => "" }; };
    await run({ config: bad.cfg, env: { ...bad.env, OTHER_FIRE_TOKEN: OTHER_SECRET, DISPATCHER_ERROR_WEBHOOK_URL: "https://hook.example/x" }, fetch, log: () => {} });
    assert.equal(posts.length, 1, "one webhook for the failed check");
    assert.ok(posts[0].includes("check exited with 3"));
    assert.ok(!posts[0].includes(OTHER_SECRET), "webhook body");
  } finally {
    rmSync(ok.dir, { recursive: true, force: true });
    rmSync(bad.dir, { recursive: true, force: true });
  }
});

// ---- webhook formats ----
const HOOK_DISCORD = "https://discord.com/api/webhooks/1/abc";
const HOOK_DISCORD_APP = "https://discordapp.com/api/webhooks/1/abc";
const HOOK_DISCORD_SUB = "https://canary.discord.com/api/webhooks/1/abc";
const HOOK_SLACK = "https://hooks.slack.com/services/T/B/x";

/** The Error thrown by fn, or null when it returns. */
function thrownBy(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** fn must throw an Error whose message matches every pattern and contains none of the secrets. */
function expectWebhookError(fn, patterns, secrets) {
  const e = thrownBy(fn);
  assert.ok(e instanceof Error, `expected an Error matching ${patterns}`);
  for (const p of patterns) assert.match(e.message, p);
  for (const s of secrets) assert.ok(!e.message.includes(s), `error message contains "${s}"`);
}

/** Runs a dispatcher whose check fails, with the webhook URL in DISPATCHER_ERROR_WEBHOOK_URL; returns exit code, posts and logs. */
async function failedCheckRun(config, webhookUrl) {
  const { dir, cfg, env } = setup(SAMPLE, { code: 3, config });
  try {
    const posts = [], logs = [];
    const fetch = async (url, o) => { posts.push({ url, body: o.body }); return { ok: true, status: 200, text: async () => "" }; };
    const code = await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: webhookUrl }, fetch, log: (m) => logs.push(m) });
    return { code, posts, logs };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The posted body must be a JSON object with exactly one key, which carries the check failure message. */
function assertPostedBody(body, key) {
  const parsed = JSON.parse(body);
  assert.deepEqual(Object.keys(parsed), [key]);
  assert.ok(parsed[key].includes("check exited with 3"), `${key} carries the failure message`);
}

t("webhookRequest: discord and slack bodies are exactly the JSON each service expects", () => {
  const wr = (config, url) => dispatchModule.webhookRequest(config, { DISPATCHER_ERROR_WEBHOOK_URL: url }, "hello");
  const discord = JSON.stringify({ content: "hello" });
  const slack = JSON.stringify({ text: "hello" });
  assert.deepEqual(wr({ webhook_format: "discord" }, HOOK_SLACK), { url: HOOK_SLACK, body: discord });
  assert.deepEqual(wr({ webhook_format: "slack" }, HOOK_DISCORD), { url: HOOK_DISCORD, body: slack });
  assert.deepEqual(wr({ webhook_format: "auto" }, HOOK_DISCORD), { url: HOOK_DISCORD, body: discord });
  assert.deepEqual(wr({ webhook_format: "auto" }, HOOK_DISCORD_APP), { url: HOOK_DISCORD_APP, body: discord });
  assert.deepEqual(wr({ webhook_format: "auto" }, HOOK_DISCORD_SUB), { url: HOOK_DISCORD_SUB, body: discord });
  assert.deepEqual(wr({ webhook_format: "auto" }, HOOK_SLACK), { url: HOOK_SLACK, body: slack });
  assert.deepEqual(wr({}, HOOK_DISCORD), { url: HOOK_DISCORD, body: discord }, "auto is the default");
});

t("webhookRequest: auto with an unknown host, invalid URL or unknown format throws, never showing the URL", () => {
  const wr = (config, url) => dispatchModule.webhookRequest(config, { DISPATCHER_ERROR_WEBHOOK_URL: url }, "hello");
  expectWebhookError(() => wr({ webhook_format: "auto" }, "https://hook.example/abc-secret"), [/unknown webhook host/, /webhook_format/], ["abc-secret", "hook.example"]);
  expectWebhookError(() => wr({}, "https://hook.example/abc-secret"), [/unknown webhook host/, /webhook_format/], ["abc-secret", "hook.example"]);
  expectWebhookError(() => wr({ webhook_format: "auto" }, "not a url"), [/invalid webhook URL/], ["not a url"]);
  expectWebhookError(() => wr({ webhook_format: "auto" }, "http://discord.com/x"), [/invalid webhook URL/], ["discord.com/x"]);
  expectWebhookError(() => wr({ webhook_format: "discord" }, "http://discord.com/x"), [/invalid webhook URL/], ["discord.com/x"]);
  expectWebhookError(() => wr({ webhook_format: "teams" }, HOOK_DISCORD), [/unknown webhook_format/], ["abc"]);
});

t("webhookRequest: no URL set gives null", () => {
  assert.equal(dispatchModule.webhookRequest({}, {}, "hello"), null);
  assert.equal(dispatchModule.webhookRequest({ webhook_format: "slack" }, { OTHER_VAR: HOOK_SLACK }, "hello"), null);
  assert.equal(dispatchModule.webhookRequest({ webhook_url_env: "MY_HOOK" }, { DISPATCHER_ERROR_WEBHOOK_URL: HOOK_DISCORD }, "hello"), null, "webhook_url_env replaces the default variable");
  assert.equal(dispatchModule.webhookRequest({ webhook_url_env: "MY_HOOK" }, { MY_HOOK: HOOK_SLACK }, "hello").url, HOOK_SLACK);
});

t("run: webhook_format decides the body of a failed-check webhook", async () => {
  let r = await failedCheckRun({ webhook_format: "slack" }, HOOK_DISCORD);
  assert.equal(r.code, 1);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, HOOK_DISCORD);
  assertPostedBody(r.posts[0].body, "text");

  r = await failedCheckRun({ webhook_format: "discord" }, HOOK_SLACK);
  assert.equal(r.code, 1);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, HOOK_SLACK);
  assertPostedBody(r.posts[0].body, "content");
});

t("run: default format (auto) posts the discord body to a discord URL", async () => {
  const r = await failedCheckRun({}, HOOK_DISCORD);
  assert.equal(r.code, 1);
  assert.equal(r.posts.length, 1);
  assertPostedBody(r.posts[0].body, "content");
});

t("run: auto with an unknown webhook host sends nothing, still exits 1, logs without the URL", async () => {
  const r = await failedCheckRun({ webhook_format: "auto" }, "https://hook.example/x");
  assert.equal(r.code, 1);
  assert.equal(r.posts.length, 0, "no fetch call for an unknown host");
  assert.ok(r.logs.some((l) => l.includes("unknown webhook host")), "log names the problem");
  assert.ok(!r.logs.join("\n").includes("https://hook.example/x"), "log must not contain the URL");
});

t("run --dry-run with fire_command says 'would start ... via command' and leaks no secret", async () => {
  const PASS_SECRET = "pass-secret-value-xyz";
  const OTHER_SECRET = "other-secret-token-123";
  const { dir, cfg, env } = setup(SAMPLE, {
    project: { fire_command: "cat > /dev/null", fire_url_env: undefined, fire_token_env: undefined, pass_env: { MY_PASS: "MY_PASS_SRC" } },
  });
  try {
    const logs = [];
    const dryEnv = { ...env, OTHER_FIRE_TOKEN: OTHER_SECRET, MY_PASS_SRC: PASS_SECRET };
    const code = await run({ config: cfg, env: dryEnv, dryRun: true, fetch: async () => { throw new Error("must not be called"); }, log: (m) => logs.push(m) });
    assert.equal(code, 0);
    assert.ok(logs.some((l) => l.includes("would start pretest-run u1") && l.includes("via command")), "dry-run line names the command fire");
    const all = logs.join("\n");
    assert.ok(!all.includes(OTHER_SECRET), "other project's token is not logged");
    assert.ok(!all.includes(PASS_SECRET), "pass_env value is not logged");
    assert.ok(!existsSync(join(dir, "work", "logs")), "dry-run creates no logs directory");
    assert.ok(!existsSync(join(dir, "work", "state", "p.json")), "dry-run writes no state file");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- git environment and webhook redirects ----
t("gitEnv: keeps the dispatcher environment, sets GIT_TERMINAL_PROMPT, GIT_SSH_COMMAND only when a key is given", () => {
  const env = { PATH: "/usr/bin", HOME: "/home/u", SSH_AUTH_SOCK: "/tmp/agent.sock", HTTPS_PROXY: "http://proxy.example:3128", GIT_CONFIG_GLOBAL: "/etc/gitconfig-x", OTHER_FIRE_TOKEN: OTHER_SECRET };
  const noKey = dispatchModule.gitEnv(env, null);
  assert.equal(noKey.SSH_AUTH_SOCK, "/tmp/agent.sock", "ssh agent socket kept");
  assert.equal(noKey.HTTPS_PROXY, "http://proxy.example:3128", "proxy kept");
  assert.equal(noKey.GIT_CONFIG_GLOBAL, "/etc/gitconfig-x", "GIT_* settings kept");
  assert.equal(noKey.PATH, "/usr/bin");
  assert.equal(noKey.GIT_TERMINAL_PROMPT, "0");
  assert.ok(!("GIT_SSH_COMMAND" in noKey), "no key, no GIT_SSH_COMMAND");
  const withKey = dispatchModule.gitEnv(env, "/keys/p_ed25519");
  assert.match(withKey.GIT_SSH_COMMAND, /^ssh -i \/keys\/p_ed25519 /);
  assert.equal(withKey.GIT_TERMINAL_PROMPT, "0");
  assert.equal(withKey.SSH_AUTH_SOCK, "/tmp/agent.sock");
  assert.equal(env.GIT_TERMINAL_PROMPT, undefined, "the input env is not mutated");
});

t("run: update true runs git with the dispatcher environment (SSH agent, marker, no prompts)", async () => {
  const { dir, cfg, env } = setup(SAMPLE);
  try {
    // a git wrapper in front of the real git records the environment git gets, then runs the real git
    const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
    const bin = join(dir, "bin");
    const envDump = join(dir, "git-env.txt");
    mkdirSync(bin, { recursive: true });
    const q = (p) => `'${p.replace(/'/g, "'\\''")}'`;
    writeFileSync(join(bin, "git"), `#!/bin/sh\nenv >> ${q(envDump)}\nexec ${q(realGit)} "$@"\n`);
    chmodSync(join(bin, "git"), 0o755);
    const gitEnvIn = { ...env, PATH: `${bin}:${process.env.PATH}`, SSH_AUTH_SOCK: "/tmp/agent.sock", FOREMAN_TEST_MARKER: "1", OTHER_FIRE_TOKEN: OTHER_SECRET };
    const fetch = async () => ({ ok: true, status: 200, text: async () => "{}" });
    const code = await run({ config: cfg, env: gitEnvIn, fetch, log: () => {} });
    assert.equal(code, 0);
    assert.ok(existsSync(join(cfg.workdir, "repos", "p", ".git")), "clone exists");
    const lines = readFileSync(envDump, "utf8").split("\n");
    assert.ok(lines.includes("SSH_AUTH_SOCK=/tmp/agent.sock"), "git got the ssh agent socket");
    assert.ok(lines.includes("FOREMAN_TEST_MARKER=1"), "git got the dispatcher environment");
    assert.ok(lines.includes("GIT_TERMINAL_PROMPT=0"), "git got GIT_TERMINAL_PROMPT=0");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: the failure webhook fetch refuses redirects (redirect: error)", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { code: 3, config: { webhook_format: "discord" } });
  try {
    const opts = [];
    const fetch = async (url, o) => { opts.push({ url, o }); return { ok: true, status: 200, text: async () => "" }; };
    await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: HOOK_DISCORD }, fetch, log: () => {} });
    assert.equal(opts.length, 1, "one webhook call");
    assert.equal(opts[0].url, HOOK_DISCORD);
    assert.equal(opts[0].o.redirect, "error", "a redirect would leave the checked host");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: a failed webhook request is logged without the webhook URL", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { code: 3, config: { webhook_format: "discord" } });
  try {
    const logs = [];
    const fetch = async (url) => { throw new Error(`redirect mode is set to error: ${url}`); };
    const code = await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: HOOK_DISCORD }, fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1);
    assert.ok(logs.some((l) => l.includes("webhook failed:")), "failure is logged");
    assert.ok(!logs.join("\n").includes(HOOK_DISCORD), "log must not contain the URL");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: a webhook that answers an error status is logged with the status only", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { code: 3, config: { webhook_format: "discord" } });
  try {
    const logs = [];
    const fetch = async () => ({ ok: false, status: 404, text: async () => "" });
    const code = await run({ config: cfg, env: { ...env, DISPATCHER_ERROR_WEBHOOK_URL: HOOK_DISCORD }, fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1);
    assert.ok(logs.some((l) => l.includes("answered 404")), "the webhook's status is logged");
    assert.ok(!logs.join("\n").includes("abc"), "log must not contain the webhook URL");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- foreman version check (M007 slice S1): these tests fail until the functions exist ----
// Every new export is reached through dispatchModule.<name>: a missing one fails only the tests that use it,
// because the runner at the end catches each failure and goes on.
const RELEASE_URL = "https://api.github.com/repos/AndreasByr/foreman/releases/latest";
const FIRE = "https://fire.example/api";

/** A fetch response with text() and json(), as the dispatcher may read them. */
function jsonResponse(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

/** Header names in lower case, so the test does not depend on how the dispatcher spells them. */
function lowerKeys(h) {
  return Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
}

t("compareVersions: numeric and SemVer pre-release precedence, a leading v is ignored", () => {
  const cmp = dispatchModule.compareVersions;
  assert.equal(cmp("0.2.1", "0.2.4"), -1);
  assert.equal(cmp("0.2.4", "0.2.1"), 1);
  assert.equal(cmp("0.2.9", "0.2.10"), -1, "numeric, not text");
  assert.equal(cmp("0.2.2-rc.1", "0.2.2"), -1, "a pre-release is older than its release");
  assert.equal(cmp("0.2.2-rc.1", "0.2.2-rc.2"), -1);
  assert.equal(cmp("0.2.4", "0.2.4"), 0);
  assert.equal(cmp("v0.2.4", "0.2.4"), 0);
});

t("parseSemver: MAJOR.MINOR.PATCH with optional pre-release, one leading v, up to 40 characters", () => {
  const ps = dispatchModule.parseSemver;
  assert.deepEqual(ps("0.2.2-rc.1"), { major: 0, minor: 2, patch: 2, pre: ["rc", "1"] });
  assert.deepEqual(ps("v0.2.4"), { major: 0, minor: 2, patch: 4, pre: [] });
  const fortyChars = `1.2.3-${"a".repeat(34)}`;
  assert.equal(fortyChars.length, 40);
  assert.ok(ps(fortyChars), "40 characters are accepted");
});

const INVALID_VERSIONS = ["", "abc", "1.2", "0.2.1\n# x", "1.2.3+build", `1.2.3-${"a".repeat(35)}`, "1.2.3 ", "**1.2.3**", "vv0.2.4"];
t("parseSemver and compareVersions: invalid input gives null, on either side", () => {
  for (const v of INVALID_VERSIONS) {
    assert.equal(dispatchModule.parseSemver(v), null, JSON.stringify(v));
    assert.equal(dispatchModule.compareVersions(v, "0.2.4"), null, JSON.stringify(v));
    assert.equal(dispatchModule.compareVersions("0.2.4", v), null, JSON.stringify(v));
  }
});

t("isOutdated: true only when both are valid and the project is older", () => {
  const io = dispatchModule.isOutdated;
  assert.equal(io("0.2.1", "0.2.4"), true);
  assert.equal(io("0.2.4", "0.2.4"), false);
  assert.equal(io("0.3.0", "0.2.4"), false);
  assert.equal(io("abc", "0.2.4"), false);
  assert.equal(io("0.2.1", "abc"), false);
});

t("foremanVersion release: tag v0.2.4 gives version 0.2.4, default URL, GitHub headers, redirects refused", async () => {
  const calls = [];
  const fetch = async (url, o) => { calls.push({ url, o }); return jsonResponse(200, { tag_name: "v0.2.4" }); };
  assert.deepEqual(await dispatchModule.foremanVersion({ foreman_version_source: "release" }, { fetch }), { version: "0.2.4" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RELEASE_URL);
  const h = lowerKeys(calls[0].o.headers);
  assert.equal(h.accept, "application/vnd.github+json");
  assert.equal(h["user-agent"], "foreman-dispatcher");
  assert.equal(calls[0].o.redirect, "error");
  assert.ok(calls[0].o.signal, "the request has a timeout");
});

t("foremanVersion release: default source is release; foreman_repo selects the repository; invalid repo makes no call", async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(url); return jsonResponse(200, { tag_name: "0.2.4" }); };
  assert.deepEqual(await dispatchModule.foremanVersion({}, { fetch }), { version: "0.2.4" });
  assert.deepEqual(await dispatchModule.foremanVersion({ foreman_repo: "someone/fork" }, { fetch }), { version: "0.2.4" });
  assert.deepEqual(urls, [RELEASE_URL, "https://api.github.com/repos/someone/fork/releases/latest"]);
  for (const bad of ["a/b/c", "x y", "owner", "a/b;c", "https://evil.example/x"]) {
    const calls = [];
    const r = await dispatchModule.foremanVersion({ foreman_version_source: "release", foreman_repo: bad }, { fetch: async (u) => { calls.push(u); return jsonResponse(200, { tag_name: "0.2.4" }); } });
    assert.equal(typeof r.error, "string", JSON.stringify(bad));
    assert.equal(calls.length, 0, `no call for ${JSON.stringify(bad)}`);
  }
});

t("foremanVersion release: HTTP errors, network errors, bad JSON and bad tags give { error }, never throw", async () => {
  const cases = [
    ["404", async () => jsonResponse(404, { message: "Not Found" }), /404/],
    ["403", async () => jsonResponse(403, { message: "rate limit" }), /403/],
    ["429", async () => jsonResponse(429, { message: "slow down" }), /429/],
    ["500", async () => jsonResponse(500, {}), /500/],
    ["network throw", async () => { throw new Error("getaddrinfo ENOTFOUND api.github.com"); }, null],
    ["non-JSON body", async () => ({ ok: true, status: 200, text: async () => "<html>", json: async () => { throw new SyntaxError("Unexpected token <"); } }), null],
    ["JSON without tag_name", async () => jsonResponse(200, { name: "x" }), null],
    ["tag latest", async () => jsonResponse(200, { tag_name: "latest" }), null],
  ];
  for (const [name, fetch, status] of cases) {
    const r = await dispatchModule.foremanVersion({ foreman_version_source: "release" }, { fetch });
    assert.equal(r.version, undefined, name);
    assert.equal(typeof r.error, "string", name);
    assert.ok(r.error.length > 0 && !r.error.includes("\n"), `${name}: one-line reason`);
    if (status) assert.match(r.error, status, name);
  }
});

t("foremanVersion local: reads the version file, makes no network call; bad content, missing file and unknown source give { error }", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-ver-"));
  try {
    const versionFile = join(dir, "VERSION");
    let calls = 0;
    const fetch = async () => { calls++; throw new Error("must not be called"); };
    writeFileSync(versionFile, "0.3.0\n");
    assert.deepEqual(await dispatchModule.foremanVersion({ foreman_version_source: "local" }, { fetch, versionFile }), { version: "0.3.0" });
    assert.equal(calls, 0, "local reads no network");

    writeFileSync(versionFile, "not a version\n");
    const bad = await dispatchModule.foremanVersion({ foreman_version_source: "local" }, { fetch, versionFile });
    assert.equal(bad.version, undefined);
    assert.equal(typeof bad.error, "string");

    const missing = await dispatchModule.foremanVersion({ foreman_version_source: "local" }, { fetch, versionFile: join(dir, "nope") });
    assert.equal(typeof missing.error, "string");

    writeFileSync(versionFile, "0.3.0\n");
    const unknown = await dispatchModule.foremanVersion({ foreman_version_source: "nightly" }, { fetch, versionFile });
    assert.equal(unknown.version, undefined);
    assert.equal(typeof unknown.error, "string");
    assert.equal(calls, 0, "no network call for any local or unknown source");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** A temp dir holding .foreman.json with `content` (written as is), or no file when content is null. */
function dirWithForemanJson(content) {
  const d = mkdtempSync(join(tmpdir(), "foreman-pv-"));
  if (content !== null) writeFileSync(join(d, ".foreman.json"), content);
  return d;
}

t("projectVersion: the foreman field, normalized; a missing file, bad JSON, no field or bad version gives { error }", async () => {
  const dirs = [];
  try {
    const plain = dirWithForemanJson('{ "foreman": "0.2.1" }'); dirs.push(plain);
    const prefixed = dirWithForemanJson('{ "foreman": "v0.2.1" }'); dirs.push(prefixed);
    assert.deepEqual(await dispatchModule.projectVersion(plain), { version: "0.2.1" });
    assert.deepEqual(await dispatchModule.projectVersion(prefixed), { version: "0.2.1" });
    const bad = [
      ["missing file", null],
      ["invalid JSON", "{ foreman: "],
      ["no foreman field", '{ "name": "x" }'],
      ["invalid version", JSON.stringify({ foreman: "0.2.1\n# x" })],
    ];
    for (const [name, content] of bad) {
      const d = dirWithForemanJson(content); dirs.push(d);
      const r = await dispatchModule.projectVersion(d);
      assert.equal(r.version, undefined, name);
      assert.equal(typeof r.error, "string", name);
    }
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
});

// ---- run(): the release check, one line per project, never a change of the exit code ----
/** setup() with the update notice on (setup turns it off, so the older tests make no release call). */
function setupNotice(output, opts = {}) {
  return setup(output, { ...opts, config: { update_notice: true, ...opts.config } });
}

/** Commits `text` as .foreman.json into the origin of a setup() dispatch; call before run(). */
function commitForemanJson(dir, text) {
  const origin = join(dir, "origin");
  writeFileSync(join(origin, ".foreman.json"), text);
  sh(origin, "add", ".foreman.json");
  sh(origin, "commit", "-qm", "foreman version");
}

/** A fetch for run(): the GitHub call answers with release(), every other URL is a fire call. */
function routedFetch(calls, release) {
  return async (url, o) => {
    calls.push({ url, o });
    if (url.startsWith("https://api.github.com/")) return release();
    return jsonResponse(200, {});
  };
}
const releaseAt = (tag) => async () => jsonResponse(200, { tag_name: tag });
const releaseDown = async () => { throw new Error("network down"); };
const fireCalls = (calls) => calls.filter((c) => c.url === FIRE).length;
const releaseCalls = (calls) => calls.filter((c) => c.url.startsWith("https://api.github.com/")).length;
const versionLines = (logs) => logs.filter((l) => l.includes("foreman update available") || l.includes("foreman version"));

t("run: project behind the release logs one update line, exit 0, the check runs and tasks start", async () => {
  const { dir, cfg, env } = setupNotice(SAMPLE);
  try {
    commitForemanJson(dir, '{ "foreman": "0.2.1" }');
    const calls = [], logs = [];
    const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseAt("v0.2.4")), log: (m) => logs.push(m), now: Date.parse("2026-01-01T10:00:00Z") });
    assert.equal(code, 0);
    assert.equal(logs.filter((l) => l.includes("p: foreman update available: 0.2.1 -> 0.2.4")).length, 1);
    assert.equal(releaseCalls(calls), 1);
    assert.equal(fireCalls(calls), 2, "the check ran and its tasks started");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: project at the release or newer logs no version line", async () => {
  for (const v of ["0.2.4", "0.3.0"]) {
    const { dir, cfg, env } = setupNotice(SAMPLE);
    try {
      commitForemanJson(dir, JSON.stringify({ foreman: v }));
      const calls = [], logs = [];
      const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseAt("v0.2.4")), log: (m) => logs.push(m) });
      assert.equal(code, 0, v);
      assert.deepEqual(versionLines(logs), [], `project ${v}`);
      assert.equal(fireCalls(calls), 2, `project ${v}: tasks start`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

t("run: release lookup fails -> 'foreman version unknown', exit 0, tasks still start", async () => {
  const { dir, cfg, env } = setupNotice(SAMPLE);
  try {
    commitForemanJson(dir, '{ "foreman": "0.2.1" }');
    const calls = [], logs = [];
    const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseDown), log: (m) => logs.push(m) });
    assert.equal(code, 0);
    assert.ok(logs.some((l) => l.includes("foreman version unknown")), "the failure is logged");
    assert.ok(!logs.some((l) => l.includes("foreman update available")));
    assert.equal(fireCalls(calls), 2, "tasks still start");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: two projects make one release call per run and one line each; a failing lookup is logged once", async () => {
  for (const [release, expectUnknown] of [[releaseAt("v0.2.4"), false], [releaseDown, true]]) {
    const { dir, cfg, env } = setupNotice(SAMPLE);
    try {
      commitForemanJson(dir, '{ "foreman": "0.2.1" }');
      cfg.projects.push({ name: "q", repo: join(dir, "origin"), branch: "dev", fire_url_env: "P_URL", fire_token_env: "P_TOKEN" });
      const calls = [], logs = [];
      const code = await run({ config: cfg, env, fetch: routedFetch(calls, release), log: (m) => logs.push(m) });
      assert.equal(code, 0);
      assert.equal(releaseCalls(calls), 1, "release asked once per run");
      assert.equal(fireCalls(calls), 4, "both projects start their tasks");
      if (expectUnknown) {
        assert.equal(logs.filter((l) => l.includes("foreman version unknown")).length, 1, "logged once");
      } else {
        assert.ok(logs.some((l) => l.includes("p: foreman update available: 0.2.1 -> 0.2.4")));
        assert.ok(logs.some((l) => l.includes("q: foreman update available: 0.2.1 -> 0.2.4")));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

t("run: update_notice false on the project or on the config makes no release call and no version line", async () => {
  for (const opts of [{ project: { update_notice: false } }, { config: { update_notice: false } }]) {
    const { dir, cfg, env } = setupNotice(SAMPLE, opts);
    try {
      commitForemanJson(dir, '{ "foreman": "0.2.1" }');
      const calls = [], logs = [];
      const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseAt("v0.2.4")), log: (m) => logs.push(m) });
      assert.equal(code, 0);
      assert.equal(releaseCalls(calls), 0, JSON.stringify(opts));
      assert.deepEqual(versionLines(logs), [], JSON.stringify(opts));
      assert.equal(fireCalls(calls), 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

t("run: project without a usable .foreman.json logs 'foreman version not usable', tasks still start", async () => {
  for (const text of [null, JSON.stringify({ foreman: "0.2.1\n# x" })]) {
    const { dir, cfg, env } = setupNotice(SAMPLE);
    try {
      if (text !== null) commitForemanJson(dir, text);
      const calls = [], logs = [];
      const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseAt("v0.2.4")), log: (m) => logs.push(m) });
      assert.equal(code, 0, String(text));
      assert.ok(logs.some((l) => l.includes("p: foreman version not usable")), String(text));
      assert.equal(fireCalls(calls), 2, "tasks still start");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

t("run: foreman_version_source local reads versionFile and makes no GitHub call", async () => {
  const { dir, cfg, env } = setupNotice(SAMPLE, { config: { foreman_version_source: "local" } });
  try {
    commitForemanJson(dir, '{ "foreman": "0.2.1" }');
    const versionFile = join(dir, "VERSION");
    writeFileSync(versionFile, "0.2.4\n");
    const calls = [], logs = [];
    const code = await run({ config: cfg, env, fetch: routedFetch(calls, releaseDown), versionFile, log: (m) => logs.push(m) });
    assert.equal(code, 0);
    assert.ok(logs.some((l) => l.includes("p: foreman update available: 0.2.1 -> 0.2.4")));
    assert.equal(releaseCalls(calls), 0, "local reads no network");
    assert.equal(fireCalls(calls), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- update ticket (M007 slice S2) and update webhook (slice S3): these tests fail until the code exists ----
// One injected fetch answers the GitHub release, the itsaplan fake and the webhook hosts.
const ITS_URL = "https://itsaplan.example/api";
const ITS_KEY = "itsa-key-SECRET-987654";
const ITS_URL_B = "https://itsaplan-b.example/api";
const ITS_KEY_B = "itsa-key-B-SECRET-456789";
const FIRE_B = "https://fire-b.example/api";
const TOKEN_B = "tok_B_SECRET_0987654321";
const HOOK_URL = "https://discord.com/api/webhooks/abc-secret-token";
const HOOK_UNKNOWN = "https://hook.example/abc-secret";
const CHANGELOG = "https://github.com/AndreasByr/foreman/blob/main/CHANGELOG.md";
const NOW = Date.parse("2026-11-21T10:00:00Z");
const TITLE_024 = "foreman update available: 0.2.1 → 0.2.4";
const TITLE_025 = "foreman update available: 0.2.1 → 0.2.5";

/** In-memory itsaplan: routes by method and path as scripts/lib/itsaplan-api.mjs calls them; records every request. */
function makeItsaplan(columnNames = ["Backlog", "In Progress", "Action Required", "Done"], base = ITS_URL) {
  const columns = columnNames.map((name, i) => ({ id: `col-${i}`, name }));
  const issues = [], requests = [];
  let seq = 0;
  const issueOf = (id) => issues.find((i) => i.id === decodeURIComponent(id));
  const fake = {
    base, columns, issues, requests, failCreate: false, failComment: false,
    columnId(name) {
      const c = columns.find((x) => x.name === name);
      if (!c) throw new Error(`fake has no column ${name}`);
      return c.id;
    },
    create({ title, description = "", columnId }) {
      seq++;
      const issue = { id: `iss-${seq}`, identifier: `TST-${seq}`, title, description, columnId, comments: [] };
      issues.push(issue);
      return issue;
    },
    /** Seeds an issue in a column (by name). */
    add({ title, column = "Backlog", description = "" }) {
      return fake.create({ title, description, columnId: fake.columnId(column) }).id;
    },
    async handle(url, o = {}) {
      const method = o.method ?? "GET";
      const path = url.slice(base.length);
      requests.push({ method, url, path, headers: lowerKeys(o.headers), body: o.body });
      const data = o.body ? JSON.parse(o.body) : {};
      let m;
      if (method === "GET" && path === "/projects/TST") return jsonResponse(200, { key: "TST", columns });
      if (method === "GET" && path.startsWith("/projects/TST/issues?")) {
        return jsonResponse(200, { items: issues.map(({ id, identifier, title }) => ({ id, identifier, title })) });
      }
      if (method === "GET" && (m = /^\/issues\/([^/?]+)$/.exec(path))) {
        const i = issueOf(m[1]);
        return i ? jsonResponse(200, { ...i }) : jsonResponse(404, { error: "issue not found" });
      }
      if (method === "POST" && path === "/projects/TST/issues") {
        // the error text carries the key on purpose: the client must redact it
        if (fake.failCreate) return jsonResponse(500, { error: `database unavailable, key ${ITS_KEY}` });
        const i = fake.create({ title: data.title, description: data.description, columnId: data.columnId });
        return jsonResponse(201, { id: i.id, identifier: i.identifier, title: i.title, columnId: i.columnId });
      }
      if (method === "PATCH" && (m = /^\/issues\/([^/?]+)$/.exec(path))) {
        const i = issueOf(m[1]);
        if (!i) return jsonResponse(404, { error: "issue not found" });
        if (data.columnId) i.columnId = data.columnId;
        return jsonResponse(200, { ...i });
      }
      if (method === "POST" && (m = /^\/issues\/([^/?]+)\/comments$/.exec(path))) {
        if (fake.failComment) return jsonResponse(403, { error: "comments are closed for this project" });
        const i = issueOf(m[1]);
        if (!i) return jsonResponse(404, { error: "issue not found" });
        i.comments.push(data.body);
        return jsonResponse(201, { id: `c-${i.comments.length}` });
      }
      return jsonResponse(404, { error: `no route ${method} ${path}` });
    },
  };
  return fake;
}

/** One fetch for run(): GitHub release (tag and failure set per test), itsaplan fake, webhook hosts; anything else answers 200. */
function makeWorld(itsaplan, extraFakes = []) {
  const world = { calls: [], itsaplan, tag: "v0.2.4", releaseDown: false, releaseReply: null, webhookStatus: 204 };
  const fakes = [itsaplan, ...extraFakes];
  world.fetch = async (url, o = {}) => {
    world.calls.push({ url, o });
    if (url.startsWith("https://api.github.com/")) {
      if (world.releaseDown) throw new Error("network down");
      if (world.releaseReply) return world.releaseReply();
      return jsonResponse(200, { tag_name: world.tag });
    }
    const fake = fakes.find((f) => url.startsWith(`${f.base}/`));
    if (fake) return fake.handle(url, o);
    if (["https://discord.com/", "https://hooks.slack.com/", "https://hook.example/"].some((h) => url.startsWith(h))) {
      return jsonResponse(world.webhookStatus, "");
    }
    return jsonResponse(200, {});
  };
  return world;
}

/** A project at `version` (its .foreman.json committed to the origin), update check on, the itsaplan fake and the webhook. */
function updateScenario({
  version = "0.2.1", modules = ["tracker-itsaplan"], mirror = { itsaplan: { projectKey: "TST" } },
  passEnv = { ITSAPLAN_URL: "SRC_URL", ITSAPLAN_API_KEY: "SRC_KEY" }, tracker = null, columns = undefined,
  output = "NOTHING|Nothing to do.\n", webhookUrl = HOOK_URL, extraEnv = {},
} = {}) {
  const base = setupNotice(output, { project: { pass_env: passEnv } });
  commitForemanJson(base.dir, JSON.stringify({ foreman: version, modules, mirror, ...(tracker ? { tracker } : {}) }));
  const itsaplan = makeItsaplan(columns);
  const env = {
    ...base.env, SRC_URL: ITS_URL, SRC_KEY: ITS_KEY, OTHER_PROJECT_TOKEN: OTHER_SECRET,
    DISPATCHER_ERROR_WEBHOOK_URL: webhookUrl, ...extraEnv,
  };
  return { ...base, env, itsaplan, world: makeWorld(itsaplan), statePath: join(base.cfg.workdir, "state", "p.json") };
}

async function runUpdate(s, extra = {}) {
  const logs = [];
  const code = await run({ config: s.cfg, env: s.env, fetch: s.world.fetch, log: (m) => logs.push(m), now: NOW, ...extra });
  return { code, logs };
}
const resetCalls = (s) => { s.world.calls.length = 0; s.itsaplan.requests.length = 0; };
const trackerUrl = (u) => [ITS_URL, ITS_URL_B].some((b) => u.startsWith(`${b}/`));
const hookPosts = (s) => s.world.calls.filter((c) => c.o.method === "POST" && !trackerUrl(c.url) && c.url !== FIRE && c.url !== FIRE_B);
const writesOf = (s) => s.itsaplan.requests.filter((q) => q.method !== "GET");
const createsOf = (s) => s.itsaplan.requests.filter((q) => q.method === "POST" && q.path === "/projects/TST/issues");
const readState = (s) => (existsSync(s.statePath) ? JSON.parse(readFileSync(s.statePath, "utf8")) : null);
const stateTicket = (s, v) => readState(s)?.update?.ticket?.[v];
const stateWebhook = (s, v) => readState(s)?.update?.webhook?.[v];
const cleanup = (s) => rmSync(s.dir, { recursive: true, force: true });

t("update ticket + webhook: first run creates one ticket in Action Required and one webhook, the second run does nothing", async () => {
  const s = updateScenario();
  try {
    const r1 = await runUpdate(s);
    assert.equal(r1.code, 0);
    const creates = createsOf(s);
    assert.equal(creates.length, 1, "one issue created");
    const body = JSON.parse(creates[0].body);
    assert.equal(body.title, TITLE_024);
    assert.equal(body.columnId, s.itsaplan.columnId("Action Required"));
    assert.ok(body.description.includes(CHANGELOG) && body.description.includes("foreman-update"), "description names the changelog and the order");
    assert.equal(creates[0].headers["x-api-key"], ITS_KEY, "API key header");
    const posts = hookPosts(s);
    assert.equal(posts.length, 1, "one webhook post");
    const msg = JSON.parse(posts[0].o.body);
    assert.deepEqual(Object.keys(msg), ["content"], "discord body");
    assert.ok(msg.content.includes("foreman update available for p: 0.2.1 → 0.2.4"), msg.content);
    assert.equal(stateTicket(s, "0.2.4"), s.itsaplan.issues[0].id, "state remembers the ticket id");
    assert.match(stateWebhook(s, "0.2.4"), /^\d{4}-\d\d-\d\dT/, "state remembers the webhook time");

    resetCalls(s);
    const r2 = await runUpdate(s, { update: false });
    assert.equal(r2.code, 0);
    assert.deepEqual(writesOf(s), [], "no new issue and no comment on the second run");
    assert.equal(hookPosts(s).length, 0, "no second webhook");
    assert.equal(s.itsaplan.issues.length, 1);
  } finally { cleanup(s); }
});

t("update ticket closed by hand: not created again, its id is remembered, the webhook still goes out once", async () => {
  const s = updateScenario();
  try {
    const id = s.itsaplan.add({ title: TITLE_024, column: "Done" });
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    assert.equal(createsOf(s).length, 0, "no new ticket");
    assert.equal(s.itsaplan.issues.length, 1);
    assert.equal(stateTicket(s, "0.2.4"), id);
    assert.equal(hookPosts(s).length, 1);
  } finally { cleanup(s); }
});

t("update ticket: a newer release moves the open ticket to Done with a comment, exactly one open update ticket remains", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);
    const old = s.itsaplan.issues[0];
    resetCalls(s);
    s.world.tag = "v0.2.5";
    const r = await runUpdate(s, { update: false });
    assert.equal(r.code, 0);
    const creates = createsOf(s);
    assert.equal(creates.length, 1, "one new ticket");
    assert.equal(JSON.parse(creates[0].body).title, TITLE_025);
    const moved = s.itsaplan.requests.filter((q) => q.method === "PATCH" && q.path === `/issues/${old.id}`);
    assert.equal(moved.length, 1, "the 0.2.4 ticket is patched");
    assert.equal(JSON.parse(moved[0].body).columnId, s.itsaplan.columnId("Done"));
    const notes = s.itsaplan.requests.filter((q) => q.method === "POST" && q.path === `/issues/${old.id}/comments`);
    assert.deepEqual(notes.map((q) => JSON.parse(q.body).body), ["Superseded by foreman 0.2.5."]);
    const doneId = s.itsaplan.columnId("Done");
    const open = s.itsaplan.issues.filter((i) => i.title.startsWith("foreman update available") && i.columnId !== doneId);
    assert.deepEqual(open.map((i) => i.title), [TITLE_025], "exactly one open update ticket");
    assert.deepEqual(Object.keys(readState(s).update.ticket), ["0.2.5"], "state keeps only the new ticket");
    assert.deepEqual(Object.keys(readState(s).update.webhook), ["0.2.5"], "state keeps only the current webhook entry");
    assert.equal(hookPosts(s).length, 1, "webhook for 0.2.5");
  } finally { cleanup(s); }
});

t("update ticket: project reaches the release, its ticket is closed (Done, comment), no webhook, then no tracker request at all", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);
    const ticket = s.itsaplan.issues[0];
    commitForemanJson(s.dir, JSON.stringify({ foreman: "0.2.4", modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "TST" } } }));
    resetCalls(s);
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    const moved = s.itsaplan.requests.filter((q) => q.method === "PATCH" && q.path === `/issues/${ticket.id}`);
    assert.equal(moved.length, 1, "ticket patched");
    assert.equal(JSON.parse(moved[0].body).columnId, s.itsaplan.columnId("Done"));
    const notes = s.itsaplan.requests.filter((q) => q.method === "POST" && q.path === `/issues/${ticket.id}/comments`);
    assert.deepEqual(notes.map((q) => JSON.parse(q.body).body), ["Closed by the dispatcher: the project is on foreman 0.2.4."]);
    assert.equal(hookPosts(s).length, 0, "no webhook for a current project");
    assert.equal(stateTicket(s, "0.2.4"), undefined, "state entry gone");

    resetCalls(s);
    const r2 = await runUpdate(s, { update: false });
    assert.equal(r2.code, 0);
    assert.deepEqual(s.itsaplan.requests, [], "no tracker request without open entries");
    assert.equal(hookPosts(s).length, 0);
  } finally { cleanup(s); }

  const current = updateScenario({ version: "0.2.4" });
  try {
    const r = await runUpdate(current);
    assert.equal(r.code, 0);
    assert.deepEqual(current.itsaplan.requests, [], "project already current on the first run: no tracker request");
    assert.equal(hookPosts(current).length, 0, "and no webhook");
  } finally { cleanup(current); }
});

t("update ticket creation fails: exit 1, webhook still sent, no ticket in state; the next run creates it without a second webhook", async () => {
  const s = updateScenario();
  try {
    s.itsaplan.failCreate = true;
    const r1 = await runUpdate(s);
    assert.equal(r1.code, 1);
    assert.ok(r1.logs.some((l) => l.includes("update ticket failed")), "log names the failed ticket");
    assert.equal(hookPosts(s).length, 1, "the webhook went out");
    assert.equal(stateTicket(s, "0.2.4"), undefined, "no ticket entry");
    assert.equal(s.itsaplan.issues.length, 0);

    s.itsaplan.failCreate = false;
    resetCalls(s);
    const r2 = await runUpdate(s, { update: false });
    assert.equal(r2.code, 0);
    assert.equal(s.itsaplan.issues.length, 1, "created on the next run");
    assert.equal(s.itsaplan.issues[0].title, TITLE_024);
    assert.equal(stateTicket(s, "0.2.4"), s.itsaplan.issues[0].id);
    assert.equal(hookPosts(s).length, 0, "no second webhook");
  } finally { cleanup(s); }
});

t("update webhook fails: exit 1, logged, nothing recorded; the next run sends it once and does not create the ticket twice", async () => {
  const s = updateScenario();
  try {
    s.world.webhookStatus = 500;
    const r1 = await runUpdate(s);
    assert.equal(r1.code, 1);
    assert.ok(r1.logs.some((l) => l.includes("update webhook failed")), "log names the failed webhook");
    assert.equal(stateWebhook(s, "0.2.4"), undefined, "nothing recorded for the webhook");
    assert.equal(s.itsaplan.issues.length, 1, "the ticket was created");

    s.world.webhookStatus = 204;
    resetCalls(s);
    const r2 = await runUpdate(s, { update: false });
    assert.equal(r2.code, 0);
    assert.equal(hookPosts(s).length, 1, "webhook sent once on the next run");
    assert.equal(createsOf(s).length, 0, "ticket not created twice");
    assert.equal(s.itsaplan.issues.length, 1);
    assert.match(stateWebhook(s, "0.2.4"), /^\d{4}-/);
  } finally { cleanup(s); }
});

t("update without tracker-itsaplan (modules none or linear): only the webhook, no tracker request, once per version", async () => {
  for (const modules of [[], ["tracker-linear"]]) {
    const s = updateScenario({ modules });
    try {
      const r1 = await runUpdate(s);
      assert.equal(r1.code, 0, JSON.stringify(modules));
      assert.equal(s.itsaplan.requests.length, 0, `${JSON.stringify(modules)}: no tracker request`);
      assert.equal(hookPosts(s).length, 1, `${JSON.stringify(modules)}: one webhook`);
      resetCalls(s);
      const r2 = await runUpdate(s, { update: false });
      assert.equal(r2.code, 0);
      assert.equal(hookPosts(s).length, 0, `${JSON.stringify(modules)}: second run sends nothing`);
      assert.equal(s.itsaplan.requests.length, 0);
    } finally { cleanup(s); }
  }
});

t("update webhook: a Slack URL gets a {text} body; an unknown host sends nothing, fails nothing, records nothing and logs no URL", async () => {
  const slack = updateScenario({ modules: [], webhookUrl: HOOK_SLACK });
  try {
    const r = await runUpdate(slack);
    assert.equal(r.code, 0);
    const posts = hookPosts(slack);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, HOOK_SLACK);
    assert.deepEqual(Object.keys(JSON.parse(posts[0].o.body)), ["text"], "slack body");
  } finally { cleanup(slack); }

  const unknown = updateScenario({ modules: [], webhookUrl: HOOK_UNKNOWN });
  try {
    const r = await runUpdate(unknown);
    assert.equal(r.code, 0, "no failure");
    assert.equal(hookPosts(unknown).length, 0, "nothing sent");
    assert.equal(stateWebhook(unknown, "0.2.4"), undefined, "nothing recorded");
    const text = r.logs.join("\n");
    assert.ok(!text.includes(HOOK_UNKNOWN) && !text.includes("abc-secret"), "log has no URL");
  } finally { cleanup(unknown); }
});

t("update ticket skipped without ITSAPLAN_API_KEY in pass_env or without projectKey: the webhook still goes out, exit 0", async () => {
  // the key sits in the dispatcher environment under its own name: it must not be used
  const noKey = updateScenario({ passEnv: { ITSAPLAN_URL: "SRC_URL" }, extraEnv: { ITSAPLAN_API_KEY: ITS_KEY } });
  try {
    const r = await runUpdate(noKey);
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("update ticket skipped")), "log says skipped");
    assert.equal(noKey.itsaplan.requests.length, 0, "no tracker request");
    assert.equal(hookPosts(noKey).length, 1, "webhook still sent");
  } finally { cleanup(noKey); }

  const noKeyProject = updateScenario({ mirror: {} });
  try {
    const r = await runUpdate(noKeyProject);
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("projectKey missing")), "log names projectKey");
    assert.equal(noKeyProject.itsaplan.requests.length, 0, "no tracker request");
    assert.equal(hookPosts(noKeyProject).length, 1, "webhook still sent");
  } finally { cleanup(noKeyProject); }
});

t("update --dry-run: no POST or PATCH, no webhook, no state file, says what it would report", async () => {
  const s = updateScenario();
  try {
    const r = await runUpdate(s, { dryRun: true });
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => /p: would report update 0\.2\.1 → 0\.2\.4 \(ticket: yes, webhook: yes\)/.test(l)), r.logs.join(" | "));
    assert.deepEqual(writesOf(s), [], "no write request");
    assert.equal(hookPosts(s).length, 0, "no webhook");
    assert.equal(existsSync(s.statePath), false, "no state file");
  } finally { cleanup(s); }
});

t("update: the API key, the webhook URL and another project's secret appear in no log line, ticket text, comment or webhook body", async () => {
  const s = updateScenario();
  try {
    const logs = [];
    const go = async (extra = {}) => { const r = await runUpdate(s, extra); logs.push(...r.logs); return r; };
    s.itsaplan.failCreate = true;
    const failed = await go();
    assert.equal(failed.code, 1);
    assert.ok(logs.some((l) => l.includes("update ticket failed")), "the error path ran");
    s.itsaplan.failCreate = false;
    await go({ update: false });              // ticket and webhook for 0.2.4
    s.world.tag = "v0.2.5";
    await go({ update: false });              // 0.2.4 superseded, ticket and webhook for 0.2.5
    commitForemanJson(s.dir, JSON.stringify({ foreman: "0.2.5", modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "TST" } } }));
    await go();                               // ticket for 0.2.5 closed

    const writeBodies = [
      ...writesOf(s).map((q) => q.body ?? ""),
      ...hookPosts(s).map((c) => c.o.body),
    ].join("\n");
    const logText = logs.join("\n");
    for (const secret of [ITS_KEY, HOOK_URL, "abc-secret-token", OTHER_SECRET]) {
      assert.ok(!logText.includes(secret), `log line contains ${secret}`);
      assert.ok(!writeBodies.includes(secret), `ticket text, comment or webhook body contains ${secret}`);
    }
    assert.ok(!JSON.stringify(s.world.calls).includes(OTHER_SECRET), "another project's secret reached a request");
  } finally { cleanup(s); }
});

t("update ticket column: tracker.columnAliases and the Intervention needed alias are accepted; no such column is exit 1", async () => {
  const aliased = updateScenario({ tracker: { columnAliases: { "Action Required": ["Needs you"] } }, columns: ["Backlog", "In Progress", "Needs you", "Done"] });
  try {
    const r = await runUpdate(aliased);
    assert.equal(r.code, 0);
    const creates = createsOf(aliased);
    assert.equal(creates.length, 1);
    assert.equal(JSON.parse(creates[0].body).columnId, aliased.itsaplan.columnId("Needs you"));
  } finally { cleanup(aliased); }

  const intervention = updateScenario({ columns: ["Backlog", "Intervention needed", "Done"] });
  try {
    const r = await runUpdate(intervention);
    assert.equal(r.code, 0);
    const creates = createsOf(intervention);
    assert.equal(creates.length, 1);
    assert.equal(JSON.parse(creates[0].body).columnId, intervention.itsaplan.columnId("Intervention needed"));
  } finally { cleanup(intervention); }

  const missing = updateScenario({ columns: ["Backlog", "In Progress", "Done"] });
  try {
    const r = await runUpdate(missing);
    assert.equal(r.code, 1);
    assert.ok(r.logs.some((l) => l.includes('no column "Action Required"')), "log names the column");
    assert.equal(createsOf(missing).length, 0, "no ticket");
    assert.equal(stateTicket(missing, "0.2.4"), undefined);
    assert.equal(hookPosts(missing).length, 1, "the webhook still goes out");
  } finally { cleanup(missing); }
});

t("update state survives a project whose check says NOTHING: the webhook is not repeated on the next run", async () => {
  const s = updateScenario({ output: "NOTHING|Nothing to do.\n" });
  try {
    const r1 = await runUpdate(s);
    assert.equal(r1.code, 0);
    assert.ok(r1.logs.some((l) => l.includes("nothing to do")));
    assert.equal(existsSync(s.statePath), true, "state written although the check had nothing to do");
    assert.match(stateWebhook(s, "0.2.4") ?? "", /^\d{4}-/);
    assert.equal(hookPosts(s).length, 1);
    resetCalls(s);
    const r2 = await runUpdate(s, { update: false });
    assert.equal(r2.code, 0);
    assert.equal(hookPosts(s).length, 0, "webhook not repeated");
  } finally { cleanup(s); }
});

t("update with an invalid .foreman.json version: no ticket, no webhook, log 'foreman version not usable'", async () => {
  const s = updateScenario({ version: "0.2.1\n# x" });
  try {
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("foreman version not usable")));
    assert.equal(s.itsaplan.requests.length, 0, "no ticket request");
    assert.equal(hookPosts(s).length, 0, "no webhook");
  } finally { cleanup(s); }
});

// ---- review round 1 of M007: release answers, two projects, secrets, retire, dry run, state file, ticket lookup ----
/** Appends `text` as .foreman.json to the origin at `origin` (a path, not a project name). */
function commitJsonTo(origin, text) {
  writeFileSync(join(origin, ".foreman.json"), text);
  sh(origin, "add", ".foreman.json");
  sh(origin, "commit", "-qm", "foreman version");
}

/**
 * Two projects: "p" (tracker when trackerP, keys from SRC_*) and "q" (own origin, own fire URL, own keys from SRC_*_B,
 * tracker when trackerQ). Both at foreman 0.2.1, so both are outdated against the release 0.2.4.
 */
function twoProjects({ trackerP = true, trackerQ = false, outputB = SAMPLE, webhookUrl = HOOK_URL, columnsA = undefined } = {}) {
  const base = setupNotice(SAMPLE, { project: { pass_env: { ITSAPLAN_URL: "SRC_URL", ITSAPLAN_API_KEY: "SRC_KEY" } } });
  const originB = makeRemote(join(base.dir, "b"), outputB);
  const json = (tracker) => JSON.stringify({ foreman: "0.2.1", modules: tracker ? ["tracker-itsaplan"] : [], mirror: { itsaplan: { projectKey: "TST" } } });
  commitForemanJson(base.dir, json(trackerP));
  commitJsonTo(originB, json(trackerQ));
  base.cfg.projects.push({
    name: "q", repo: originB, branch: "dev", fire_url_env: "Q_URL", fire_token_env: "Q_TOKEN",
    pass_env: { ITSAPLAN_URL: "SRC_URL_B", ITSAPLAN_API_KEY: "SRC_KEY_B" },
  });
  const env = {
    ...base.env, SRC_URL: ITS_URL, SRC_KEY: ITS_KEY, SRC_URL_B: ITS_URL_B, SRC_KEY_B: ITS_KEY_B,
    Q_URL: FIRE_B, Q_TOKEN: TOKEN_B, OTHER_PROJECT_TOKEN: OTHER_SECRET, DISPATCHER_ERROR_WEBHOOK_URL: webhookUrl,
  };
  const itsaplan = makeItsaplan(columnsA), itsaplanB = makeItsaplan(undefined, ITS_URL_B);
  return {
    ...base, env, itsaplan, itsaplanB, world: makeWorld(itsaplan, [itsaplanB]),
    statePath: join(base.cfg.workdir, "state", "p.json"),
  };
}

/**
 * Requests that carry a secret where it does not belong: an API key outside its own project's x-api-key header
 * (keyOf maps each tracker base URL to its key), the webhook URL or token outside the webhook request, or
 * the other project's dispatcher token. Only URLs and header values are looked at.
 */
function requestLeaks(calls, keyOf, hookUrl) {
  const leaks = [];
  for (const { url, o } of calls) {
    const h = lowerKeys(o?.headers);
    const base = Object.keys(keyOf).find((b) => url.startsWith(`${b}/`));
    const visible = [url, ...Object.entries(h).filter(([k]) => k !== "x-api-key").map(([, v]) => String(v))];
    if ("x-api-key" in h && h["x-api-key"] !== keyOf[base]) leaks.push(`${url}: x-api-key is not this project's key`);
    for (const [b, key] of Object.entries(keyOf)) if (visible.some((v) => v.includes(key))) leaks.push(`${url}: carries the key of ${b}`);
    if (url !== hookUrl && visible.some((v) => v.includes(hookUrl) || v.includes("abc-secret-token"))) leaks.push(`${url}: carries the webhook URL`);
    if (visible.some((v) => v.includes(OTHER_SECRET))) leaks.push(`${url}: carries another secret`);
  }
  return leaks;
}

const fireTo = (s, url) => s.world.calls.filter((c) => c.url === url).length;
const getIssueCalls = (s) => s.itsaplan.requests.filter((q) => q.method === "GET" && /^\/issues\//.test(q.path));

t("release answers 404, 403, 429, a bad body or a bad tag at run level: exit 0, no webhook, no tracker request, tasks start", async () => {
  const replies = [
    ["404", () => jsonResponse(404, { message: "Not Found" })],
    ["403", () => jsonResponse(403, { message: "API rate limit exceeded" })],
    ["429", () => jsonResponse(429, { message: "slow down" })],
    ["bad body", async () => ({ ok: true, status: 200, text: async () => "<html>", json: async () => { throw new SyntaxError("Unexpected token <"); } })],
    ["bad tag", () => jsonResponse(200, { tag_name: "latest" })],
  ];
  const cases = [["release down", (w) => { w.releaseDown = true; }], ...replies.map(([name, reply]) => [name, (w) => { w.releaseReply = reply; }])];
  for (const [name, setRelease] of cases) {
    const s = updateScenario({ output: SAMPLE });
    try {
      setRelease(s.world);
      const r = await runUpdate(s);
      assert.equal(r.code, 0, name);
      assert.equal(r.logs.filter((l) => l.includes("foreman version unknown")).length, 1, `${name}: one 'foreman version unknown' line`);
      assert.equal(hookPosts(s).length, 0, `${name}: no webhook`);
      assert.equal(s.itsaplan.requests.length, 0, `${name}: no tracker request`);
      assert.equal(fireTo(s, FIRE), 2, `${name}: tasks still start`);
    } finally { cleanup(s); }
  }
});

t("two projects: p's ticket fails (500): both webhooks go out, both projects' tasks start, exit 1", async () => {
  const s = twoProjects();
  try {
    s.itsaplan.failCreate = true;
    const r = await runUpdate(s);
    assert.equal(r.code, 1);
    assert.ok(r.logs.some((l) => l.includes("p: update ticket failed")), r.logs.join(" | "));
    const contents = hookPosts(s).map((c) => JSON.parse(c.o.body).content);
    assert.equal(contents.length, 2, "one webhook per project");
    assert.ok(contents.some((c) => c.includes("for p:")) && contents.some((c) => c.includes("for q:")));
    assert.equal(fireTo(s, FIRE), 2, "p's tasks start despite the failed ticket");
    assert.equal(fireTo(s, FIRE_B), 2, "q's tasks start");
    assert.equal(s.itsaplan.issues.length, 0, "no ticket created");
    assert.equal(stateTicket(s, "0.2.4"), undefined);
  } finally { cleanup(s); }
});

t("two projects with different ITSAPLAN_* sources: every ticket request carries its own project's key and URL", async () => {
  const s = twoProjects({ trackerQ: true });
  try {
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    assert.ok(s.itsaplan.requests.length > 0 && s.itsaplanB.requests.length > 0, "both trackers were used");
    for (const q of s.itsaplan.requests) {
      assert.ok(q.url.startsWith(`${ITS_URL}/`), q.url);
      assert.equal(q.headers["x-api-key"], ITS_KEY, `${q.method} ${q.path}: p's key`);
    }
    for (const q of s.itsaplanB.requests) {
      assert.ok(q.url.startsWith(`${ITS_URL_B}/`), q.url);
      assert.equal(q.headers["x-api-key"], ITS_KEY_B, `${q.method} ${q.path}: q's key`);
    }
    assert.equal(createsOf(s).length, 1, "p's ticket");
    assert.equal(s.itsaplanB.requests.filter((q) => q.method === "POST" && q.path === "/projects/TST/issues").length, 1, "q's ticket");
  } finally { cleanup(s); }
});

t("update ticket skipped without ITSAPLAN_URL (key present): 'update ticket skipped', webhook sent, exit 0", async () => {
  const s = updateScenario({ passEnv: { ITSAPLAN_API_KEY: "SRC_KEY" } });
  try {
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("update ticket skipped")), r.logs.join(" | "));
    assert.equal(s.itsaplan.requests.length, 0, "no tracker request");
    assert.equal(hookPosts(s).length, 1, "webhook sent");
  } finally { cleanup(s); }
});

t("secrets: no request carries the other project's key or the webhook URL, no log line carries a key or the webhook URL (failure paths and dry run)", async () => {
  const cases = [
    ["webhook answers 500", { trackerQ: true }, (s) => { s.world.webhookStatus = 500; }, {}, "update webhook failed"],
    ["ticket creation answers 500", { trackerQ: true }, (s) => { s.itsaplan.failCreate = true; }, {}, "update ticket failed"],
    ["missing column", { trackerQ: true, columnsA: ["Backlog", "In Progress", "Done"] }, () => {}, {}, 'no column "Action Required"'],
    ["dry run", { trackerQ: true }, () => {}, { dryRun: true }, "would report update"],
  ];
  for (const [name, opts, prepare, extra, expectLog] of cases) {
    const s = twoProjects(opts);
    try {
      prepare(s);
      const { logs } = await runUpdate(s, extra);
      const text = logs.join("\n");
      assert.ok(text.includes(expectLog), `${name}: the path ran (expected "${expectLog}")`);
      for (const secret of [ITS_KEY, ITS_KEY_B, HOOK_URL, "abc-secret-token", OTHER_SECRET]) {
        assert.ok(!text.includes(secret), `${name}: a log line contains a secret`);
      }
      assert.deepEqual(requestLeaks(s.world.calls, { [ITS_URL]: ITS_KEY, [ITS_URL_B]: ITS_KEY_B }, HOOK_URL), [], `${name}: request leaks`);
    } finally { cleanup(s); }
  }
});

t("retire: a ticket the tracker no longer has (404 on move) is dropped from the state with a note, exit 0, no request on the next run", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);
    s.itsaplan.issues.length = 0;   // the ticket is gone from the tracker
    commitForemanJson(s.dir, JSON.stringify({ foreman: "0.2.4", modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "TST" } } }));
    resetCalls(s);
    const r = await runUpdate(s);
    assert.equal(r.code, 0, "no exit failure");
    assert.ok(r.logs.some((l) => l.includes("not found, dropped from the state")), r.logs.join(" | "));
    assert.equal(stateTicket(s, "0.2.4"), undefined, "state entry removed");
    resetCalls(s);
    const r2 = await runUpdate(s);
    assert.equal(r2.code, 0);
    assert.deepEqual(s.itsaplan.requests, [], "next run makes no itsaplan request");
  } finally { cleanup(s); }
});

t("retire: the comment answers 403 after a successful move: the ticket stays in Done, the state entry goes, exit 0, no endless exit 1", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);
    const ticket = s.itsaplan.issues[0];
    s.itsaplan.failComment = true;
    commitForemanJson(s.dir, JSON.stringify({ foreman: "0.2.4", modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "TST" } } }));
    const r = await runUpdate(s);
    assert.equal(r.code, 0, "exit 0");
    assert.equal(ticket.columnId, s.itsaplan.columnId("Done"), "ticket moved to Done");
    assert.equal(stateTicket(s, "0.2.4"), undefined, "state entry removed");
    resetCalls(s);
    const r2 = await runUpdate(s);
    assert.equal(r2.code, 0, "the next run is green");
    assert.deepEqual(s.itsaplan.requests, [], "next run makes no itsaplan request");
  } finally { cleanup(s); }
});

t("dry run with a recorded ticket and a project at the release: 'would close update ticket', no PATCH or POST, state file unchanged", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);
    commitForemanJson(s.dir, JSON.stringify({ foreman: "0.2.4", modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "TST" } } }));
    const before = readFileSync(s.statePath, "utf8");
    resetCalls(s);
    const r = await runUpdate(s, { dryRun: true });
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("would close update ticket")), r.logs.join(" | "));
    assert.deepEqual(writesOf(s), [], "no PATCH or POST");
    assert.equal(hookPosts(s).length, 0, "no webhook");
    assert.equal(readFileSync(s.statePath, "utf8"), before, "state file unchanged");
  } finally { cleanup(s); }
});

t("dry run with an existing state file and an outdated project: the state file bytes are identical before and after", async () => {
  const s = updateScenario();
  try {
    await runUpdate(s);                       // real run: ticket and webhook recorded in the state file
    const before = readFileSync(s.statePath, "utf8");
    resetCalls(s);
    const r = await runUpdate(s, { dryRun: true });
    assert.equal(r.code, 0);
    assert.ok(r.logs.some((l) => l.includes("would report update")), r.logs.join(" | "));
    assert.deepEqual(writesOf(s), [], "no write request");
    assert.equal(readFileSync(s.statePath, "utf8"), before, "state file bytes unchanged");
  } finally { cleanup(s); }
});

t("state file holding null, an array or a string for a project is treated as empty: no throw, the check runs, tasks start, exit 0", async () => {
  for (const content of ["null\n", "[]\n", "\"text\"\n"]) {
    const { dir, cfg, env } = setup(SAMPLE);
    try {
      mkdirSync(join(cfg.workdir, "state"), { recursive: true });
      writeFileSync(join(cfg.workdir, "state", "p.json"), content);
      const calls = [], logs = [];
      const fetch = async (url, o) => { calls.push({ url, o }); return jsonResponse(200, {}); };
      const code = await run({ config: cfg, env, fetch, log: (m) => logs.push(m), now: NOW });
      const label = content.trim();
      assert.equal(code, 0, label);
      assert.ok(logs.every((l) => !l.includes("Nothing was started")), `${label}: the run threw`);
      assert.equal(calls.filter((c) => c.url === FIRE).length, 2, `${label}: tasks start`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

t("ticket lookup: 30 existing issues cost one list request and no GET per issue; a closed ticket is found in the list", async () => {
  const s = updateScenario();
  try {
    for (let i = 0; i < 30; i++) s.itsaplan.add({ title: `Other ticket ${i}` });
    const r = await runUpdate(s);
    assert.equal(r.code, 0);
    assert.equal(getIssueCalls(s).length, 0, "no GET /issues/<id>");
    const lists = s.itsaplan.requests.filter((q) => q.method === "GET" && q.path.startsWith("/projects/TST/issues?"));
    assert.equal(lists.length, 1, "one list request");
    assert.match(lists[0].path, /includeArchived=true/);
    assert.equal(createsOf(s).length, 1, "one ticket created");
    assert.equal(s.itsaplan.issues.length, 31);
  } finally { cleanup(s); }

  const closed = updateScenario();
  try {
    for (let i = 0; i < 30; i++) closed.itsaplan.add({ title: `Other ticket ${i}` });
    const id = closed.itsaplan.add({ title: TITLE_024, column: "Done" });
    const r = await runUpdate(closed);
    assert.equal(r.code, 0);
    assert.equal(createsOf(closed).length, 0, "the closed ticket is found in the list");
    assert.equal(stateTicket(closed, "0.2.4"), id);
    assert.equal(getIssueCalls(closed).length, 0, "no GET /issues/<id>");
  } finally { cleanup(closed); }
});

// ---- runner: every test runs; a failure prints FAIL with its message and the run goes on ----
// --- heartbeat (fix pack 2026-11-23-module-alarm) ---
import { readBeats, writeBeat } from "../heartbeat.mjs";
const beatOf = (cfg, module) => readBeats(join(cfg.workdir, "status")).find((b) => b.module === module);

t("heartbeat: a good run beats ok for the dispatcher (with its limit) and for the project", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    const now = Date.parse("2026-01-01T10:00:00Z");
    assert.equal(await run({ config: cfg, env, log: () => {}, now }), 0);
    const d = beatOf(cfg, "dispatcher"), p = beatOf(cfg, "project:p");
    assert.equal(d.result, "ok");
    assert.equal(d.last_run, "2026-01-01T10:00:00.000Z");
    assert.equal(d.max_age_min, 30);
    assert.equal(p.result, "ok");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("heartbeat: a failing check beats error for the project and the dispatcher, exit 1, even without a webhook", async () => {
  const { dir, cfg, env } = setup("", { code: 3 });
  try {
    assert.equal(await run({ config: cfg, env, log: () => {}, now: Date.parse("2026-01-01T10:00:00Z") }), 1);
    const p = beatOf(cfg, "project:p");
    assert.equal(p.result, "error");
    assert.match(p.note, /check exited with 3/);
    const d = beatOf(cfg, "dispatcher");
    assert.equal(d.result, "error");
    assert.match(d.note, /p/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("heartbeat: a lost failure message is named in the dispatcher beat", async () => {
  const { dir, cfg, env } = setup("", { code: 3 });
  try {
    env.DISPATCHER_ERROR_WEBHOOK_URL = "https://discord.com/api/webhooks/1/SECRETHOOK";
    const fetch = async () => ({ ok: false, status: 500, text: async () => "no" });
    assert.equal(await run({ config: cfg, env, fetch, log: () => {}, now: Date.parse("2026-01-01T10:00:00Z") }), 1);
    assert.match(beatOf(cfg, "dispatcher").note, /notification failed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("heartbeat: dry run and a skipped run (active lock) write no beat", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    await run({ config: cfg, env, dryRun: true, log: () => {} });
    assert.deepEqual(readBeats(join(cfg.workdir, "status")), []);
    mkdirSync(cfg.workdir, { recursive: true });
    writeFileSync(join(cfg.workdir, "dispatch.lock"), String(process.pid));
    await run({ config: cfg, env, log: () => {} });
    assert.deepEqual(readBeats(join(cfg.workdir, "status")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("heartbeat: the dispatcher alarms when the watcher beat is stale, once per repeat time; fresh or absent watcher is quiet", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    env.DISPATCHER_ERROR_WEBHOOK_URL = "https://discord.com/api/webhooks/1/SECRETHOOK";
    const calls = [];
    const fetch = async (url, o) => { calls.push({ url, body: o?.body ?? "" }); return { ok: true, status: 200, text: async () => "{}" }; };
    const now = Date.parse("2026-01-01T12:00:00Z");
    const status = join(cfg.workdir, "status");
    await run({ config: cfg, env, fetch, log: () => {}, now });
    assert.equal(calls.length, 0, "no watcher beat: not installed, no alarm");
    writeBeat(status, "watcher", { now: now - 60000, maxAgeMin: 45 });
    await run({ config: cfg, env, fetch, log: () => {}, now });
    assert.equal(calls.length, 0, "fresh");
    writeBeat(status, "watcher", { now: now - 5 * 3600 * 1000, maxAgeMin: 45 });
    await run({ config: cfg, env, fetch, log: () => {}, now });
    assert.equal(calls.length, 1);
    assert.match(JSON.parse(calls[0].body).content, /watcher/);
    await run({ config: cfg, env, fetch, log: () => {}, now: now + 600000 });
    assert.equal(calls.length, 1, "not again within the repeat time");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


t("heartbeat R1: peer.json forgets the watcher once it is ok again, so a later outage alarms again", async () => {
  const { dir, cfg, env } = setup("NOTHING|Nothing to do.\n");
  try {
    env.DISPATCHER_ERROR_WEBHOOK_URL = "https://discord.com/api/webhooks/1/SECRETHOOK";
    const calls = [];
    const fetch = async (url, o) => { calls.push(o?.body ?? ""); return { ok: true, status: 200, text: async () => "{}" }; };
    const now = Date.parse("2026-01-01T12:00:00Z");
    const status = join(cfg.workdir, "status");
    writeBeat(status, "watcher", { now: now - 5 * 3600 * 1000, maxAgeMin: 45 });
    await run({ config: cfg, env, fetch, log: () => {}, now });
    assert.equal(calls.length, 1);
    writeBeat(status, "watcher", { now: now + 300000, maxAgeMin: 45 });
    await run({ config: cfg, env, fetch, log: () => {}, now: now + 600000 });
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.workdir, "peer.json"), "utf8")), {});
    await run({ config: cfg, env, fetch, log: () => {}, now: now + 3 * 3600 * 1000 });
    assert.equal(calls.length, 2, "second outage within the repeat time of the first alarm still alarms");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Configurable limits: max_tasks_cap (config), max_tasks and cooldown_minutes (project, config fallback for the cooldown).
const rl = (config, project = {}) => dispatchModule.resolveLimits(config, project);

t("resolveLimits: cap is 3 by default, taken from config, clamped to 10 with a warn note, invalid values fall back to 3", () => {
  assert.equal(rl({}).cap, 3);
  assert.equal(rl({ max_tasks_cap: 5 }).cap, 5);
  const high = rl({ max_tasks_cap: 25 });
  assert.equal(high.cap, 10);
  assert.ok(high.notes.some((n) => n.level === "warn" && n.text.includes("capped")), "warn note for a cap above 10");
  for (const bad of [0, -1, 2.5, "x"]) {
    const r = rl({ max_tasks_cap: bad });
    assert.equal(r.cap, 3, `invalid cap ${JSON.stringify(bad)} falls back to 3`);
    assert.ok(r.notes.some((n) => n.level === "warn" && n.text.includes("invalid")), `warn note for cap ${JSON.stringify(bad)}`);
  }
});

t("resolveLimits: max_tasks defaults to the cap with a default note, is capped above the cap, invalid values fall back to the cap", () => {
  const none = rl({}, {});
  assert.equal(none.max, 3);
  assert.ok(none.notes.some((n) => n.level === "default" && n.text.includes("max_tasks") && n.text.includes("not set, default used")), "default note naming max_tasks");
  assert.equal(rl({ max_tasks_cap: 5 }, {}).max, 5, "default max follows the cap");
  assert.equal(rl({ max_tasks_cap: 5 }, { max_tasks: 2 }).max, 2, "a valid lower max is kept");
  const above = rl({ max_tasks_cap: 5 }, { max_tasks: 8 });
  assert.equal(above.max, 5);
  assert.ok(above.notes.some((n) => n.level === "warn" && n.text.includes("capped")), "warn note for max above cap");
  for (const bad of [0, -1, 2.5, "x"]) {
    const r = rl({ max_tasks_cap: 5 }, { max_tasks: bad });
    assert.equal(r.max, 5, `invalid max_tasks ${JSON.stringify(bad)} falls back to the cap`);
    assert.ok(r.notes.some((n) => n.level === "warn" && n.text.includes("invalid")), `warn note for max_tasks ${JSON.stringify(bad)}`);
  }
});

t("resolveLimits: cooldown is project, then config, then 45 minutes; default and invalid notes", () => {
  assert.equal(rl({}, { cooldown_minutes: 10 }).cooldownMinutes, 10, "project beats nothing");
  assert.equal(rl({ cooldown_minutes: 180 }, {}).cooldownMinutes, 180, "config used when project is unset");
  assert.equal(rl({ cooldown_minutes: 180 }, { cooldown_minutes: 10 }).cooldownMinutes, 10, "project beats config");
  const none = rl({}, {});
  assert.equal(none.cooldownMinutes, 45);
  assert.ok(none.notes.some((n) => n.level === "default" && n.text.includes("cooldown_minutes") && n.text.includes("not set, default used")), "default note naming cooldown_minutes");
  for (const bad of [0, -5, "x"]) {
    const r = rl({}, { cooldown_minutes: bad });
    assert.equal(r.cooldownMinutes, 45, `invalid cooldown ${JSON.stringify(bad)} falls back to 45`);
    assert.ok(r.notes.some((n) => n.level === "warn" && n.text.includes("invalid")), `warn note for cooldown ${JSON.stringify(bad)}`);
  }
});

t("resolveLimits R1: invalid project cooldown_minutes falls back to the config value, else 45, with a warn note", () => {
  for (const bad of ["x", 0, -5]) {
    const withConfig = rl({ cooldown_minutes: 180 }, { cooldown_minutes: bad });
    assert.equal(withConfig.cooldownMinutes, 180, `invalid project cooldown ${JSON.stringify(bad)} falls back to the config value 180`);
    assert.ok(withConfig.notes.some((n) => n.level === "warn" && n.text.includes("invalid")), `warn note with "invalid" for project cooldown ${JSON.stringify(bad)}`);
    const noConfig = rl({}, { cooldown_minutes: bad });
    assert.equal(noConfig.cooldownMinutes, 45, `invalid project cooldown ${JSON.stringify(bad)} without config falls back to 45`);
    assert.ok(noConfig.notes.some((n) => n.level === "warn" && n.text.includes("invalid")), `warn note with "invalid" for project cooldown ${JSON.stringify(bad)} without config`);
  }
});

t("resolveLimits R1: cooldown above 1440 minutes is capped to 1440 with a warn note, project or config", () => {
  const fromProject = rl({}, { cooldown_minutes: 5000 });
  assert.equal(fromProject.cooldownMinutes, 1440, "project cooldown 5000 capped to 1440");
  assert.ok(fromProject.notes.some((n) => n.level === "warn" && n.text.includes("capped")), 'warn note with "capped" for project cooldown');
  const fromConfig = rl({ cooldown_minutes: 5000 }, {});
  assert.equal(fromConfig.cooldownMinutes, 1440, "config cooldown 5000 capped to 1440");
  assert.ok(fromConfig.notes.some((n) => n.level === "warn" && n.text.includes("capped")), 'warn note with "capped" for config cooldown');
  const exact = rl({}, { cooldown_minutes: 1440 });
  assert.equal(exact.cooldownMinutes, 1440, "exactly 1440 is kept");
  assert.ok(!exact.notes.some((n) => n.text.includes("capped")), "no cap note at exactly 1440");
});

t("resolveLimits: everything set validly gives empty notes", () => {
  const r = rl({ max_tasks_cap: 5, cooldown_minutes: 60 }, { max_tasks: 4, cooldown_minutes: 10 });
  assert.deepEqual({ cap: r.cap, max: r.max, cooldownMinutes: r.cooldownMinutes }, { cap: 5, max: 4, cooldownMinutes: 10 });
  assert.deepEqual(r.notes, []);
});

t("selectTasks: a cap option raises the limit (up to 10); without it max alone stays limited to 3", () => {
  const now = Date.parse("2026-01-01T10:00:00Z");
  const six = Array.from({ length: 6 }, (_, i) => ({ n: i, kind: "coding", unit: `x${i}`, info: "", prompt: "p" }));
  assert.equal(selectTasks(six, { fired: {} }, now, { max: 6, cap: 5 }).chosen.length, 5);
  assert.equal(selectTasks(six, { fired: {} }, now, { max: 10 }).chosen.length, 3);
});

const FIVE_UNITS = Array.from({ length: 5 }, (_, i) => [
  `TASK|coding|v${i + 1}|slice`,
  `=== PROMPT ${i + 1} coding v${i + 1} ===`,
  `Foreman task: coding | unit: v${i + 1}`,
  `=== END ${i + 1} ===`,
]).flat().join("\n");

t("run: config max_tasks_cap 5 and project max_tasks 5 start five tasks on five units", async () => {
  const { dir, cfg, env } = setup(FIVE_UNITS, { config: { max_tasks_cap: 5 }, project: { max_tasks: 5 } });
  try {
    const calls = [];
    const fetch = async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200, text: async () => "{}" }; };
    assert.equal(await run({ config: cfg, env, fetch, log: () => {}, now: Date.parse("2026-01-01T10:00:00Z") }), 0);
    assert.equal(calls.length, 5);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: project cooldown_minutes 10 beats config cooldown_minutes 180: a unit fired at 10:00 starts again at 10:15", async () => {
  const { dir, cfg, env } = setup(SAMPLE, { config: { cooldown_minutes: 180 }, project: { cooldown_minutes: 10 } });
  try {
    const calls = [];
    const fetch = async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200, text: async () => "{}" }; };
    await run({ config: cfg, env, fetch, log: () => {}, now: Date.parse("2026-01-01T10:00:00Z") });
    assert.equal(calls.length, 2);
    calls.length = 0;
    await run({ config: cfg, env, fetch, log: () => {}, update: false, now: Date.parse("2026-01-01T10:15:00Z") });
    assert.equal(calls.length, 2, "10 minutes cooldown is over at 10:15");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run --dry-run: one limits line per project with max_tasks= and cooldown=; default used for unset limits", async () => {
  const set = setup(SAMPLE, { config: { max_tasks_cap: 5 }, project: { max_tasks: 5, cooldown_minutes: 10 } });
  try {
    const logs = [];
    const fetch = async () => { throw new Error("must not be called"); };
    await run({ config: set.cfg, env: set.env, fetch, dryRun: true, log: (m) => logs.push(m) });
    const lines = logs.filter((l) => l.includes("limits"));
    assert.equal(lines.length, 1, "one limits line for one project");
    assert.ok(lines[0].includes("max_tasks=") && lines[0].includes("cooldown="), lines[0]);
  } finally { rmSync(set.dir, { recursive: true, force: true }); }

  const unset = setup(SAMPLE);
  try {
    const logs = [];
    const fetch = async () => { throw new Error("must not be called"); };
    await run({ config: unset.cfg, env: unset.env, fetch, dryRun: true, log: (m) => logs.push(m) });
    assert.ok(logs.some((l) => l.includes("default used") && l.includes("max_tasks")), "a default line naming max_tasks");
  } finally { rmSync(unset.dir, { recursive: true, force: true }); }
});

t("run: valid limits log no limits line; invalid project max_tasks logs a max_tasks invalid line on a normal run", async () => {
  const ok = setup(SAMPLE, { config: { max_tasks_cap: 5 }, project: { max_tasks: 5, cooldown_minutes: 10 } });
  try {
    const logs = [];
    const fetch = async () => ({ ok: true, status: 200, text: async () => "{}" });
    await run({ config: ok.cfg, env: ok.env, fetch, log: (m) => logs.push(m), now: Date.parse("2026-01-01T10:00:00Z") });
    assert.ok(!logs.some((l) => l.includes("limits")), "no limits line when everything is valid");
  } finally { rmSync(ok.dir, { recursive: true, force: true }); }

  const bad = setup(SAMPLE, { project: { max_tasks: "x" } });
  try {
    const logs = [];
    const fetch = async () => ({ ok: true, status: 200, text: async () => "{}" });
    await run({ config: bad.cfg, env: bad.env, fetch, log: (m) => logs.push(m), now: Date.parse("2026-01-01T10:00:00Z") });
    assert.ok(logs.some((l) => l.includes("max_tasks") && l.includes("invalid")), "invalid max_tasks is logged");
  } finally { rmSync(bad.dir, { recursive: true, force: true }); }
});

let passed = 0;
const failures = [];
for (const [name, fn] of queue) {
  try {
    await fn();
    passed++;
    console.log(`ok ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}`);
    console.log(`  ${String(e?.message ?? e).split("\n").join("\n  ")}`);
  }
}
console.log(failures.length ? `${passed} tests passed, ${failures.length} failed` : `${passed} tests passed`);
if (failures.length) process.exitCode = 1;

#!/usr/bin/env node
// Tests for the dispatcher. Run: node dispatcher/tests/test-dispatch.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const code = await run({ config: cfg, env: testEnv, fetch: async () => { throw new Error("must not be called"); }, log: () => {} });
    assert.equal(code, 0);
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
    assert.equal(await run({ config: cfg, env: testEnv, log: () => {} }), 0);
    const repo = join(cfg.workdir, "repos", "p");
    for (let i = 0; i < 50 && !(existsSync(join(repo, "u1.env")) && existsSync(join(repo, "u2.env"))); i++) await new Promise((r) => setTimeout(r, 100));
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

// ---- webhook formats: dispatchModule.webhookRequest is not implemented yet, so these tests must fail ----
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

let n = 0;
for (const [name, fn] of queue) { await fn(); n++; console.log(`ok ${name}`); }
console.log(`${n} tests passed`);

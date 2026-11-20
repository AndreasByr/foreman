#!/usr/bin/env node
// Tests for the pretest runner with a fake browser. Run: node scripts/test-pretest.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePlan, baseUrl, isSafePath, scrub, summary, runPretest, requiredVariables } from "./lib/pretest-run.mjs";
import { main } from "./pretest-run.mjs";

const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const SECRET = "s".repeat(40);
const cfg = {
  targets: { dev: "https://dev.example.com", staging: "https://staging.example.com" },
  productionHosts: ["app.example.com"],
  tenants: { dev: ["test-a", "test-b"], staging: ["test-a"] },
  blocked: ["^/t/protected", "protected"],
  login: { path: "/api/test-login", secretEnv: { dev: "TEST_LOGIN_SECRET_DEV", staging: "TEST_LOGIN_SECRET_STAGING" }, roles: { owner: "TEST_USER_OWNER", member: "TEST_USER_MEMBER" } },
};
const plan = () => ({
  unit: "u1", round: 1, target: "dev", tenant: "test-a",
  pages: [{ name: "members", path: "/t/test-a/members", role: "owner" }, { name: "login", path: "/login", role: "anonymous" }],
  api: [{ name: "members-owner", path: "/api/t/test-a/members", role: "owner", expect: 200 }],
});
const env = { TEST_LOGIN_SECRET_DEV: SECRET, TEST_USER_OWNER: "user-owner-123", TEST_USER_MEMBER: "user-member-456" };

t("plan validation: allowlist, blocked tenant, paths, GET only, admin roles", () => {
  assert.doesNotThrow(() => validatePlan(cfg, plan()));
  assert.throws(() => validatePlan(cfg, { ...plan(), target: "production" }), /target must be/);
  assert.throws(() => validatePlan(cfg, { ...plan(), tenant: "live-tenant" }), /not allowed/);
  assert.throws(() => validatePlan(cfg, { ...plan(), tenant: "protected" }), /not allowed/);
  assert.throws(() => validatePlan(cfg, { ...plan(), target: "staging", tenant: "test-b" }), /not allowed/);
  const p = plan(); p.pages[0].path = "//evil.example.com"; assert.throws(() => validatePlan(cfg, p), /path must be relative/);
  const q = plan(); q.pages[0].path = "/t/%70rotected/x"; assert.throws(() => validatePlan(cfg, q), /path must be relative/);
  const r = plan(); r.api[0].method = "POST"; assert.throws(() => validatePlan(cfg, r), /only GET/);
  const s = plan(); s.pages[0].role = "admin"; assert.throws(() => validatePlan({ ...cfg, login: { ...cfg.login, roles: { ...cfg.login.roles, admin: "X" } } }, s), /admin roles/);
  const u = plan(); u.pages[0].role = "stranger"; assert.throws(() => validatePlan(cfg, u), /unknown role/);
  assert.ok(isSafePath("/a/b?x=1") && !isSafePath("a/b") && !isSafePath("/a b"));
});

t("base url: https only, never a production host, only dev and staging", () => {
  assert.equal(baseUrl(cfg, "dev"), "https://dev.example.com");
  assert.throws(() => baseUrl(cfg, "prod"), /dev or staging/);
  assert.throws(() => baseUrl({ ...cfg, targets: { dev: "http://dev.example.com" } }, "dev"), /https/);
  assert.doesNotThrow(() => baseUrl({ ...cfg, targets: { dev: "http://localhost:3000" } }, "dev"));
  assert.throws(() => baseUrl({ ...cfg, targets: { dev: "https://app.example.com" } }, "dev"), /productionHosts/);
  assert.throws(() => baseUrl({ ...cfg, targets: {} }, "dev"), /missing/);
});

t("required variables follow the roles of the plan", () => {
  assert.deepEqual(requiredVariables(cfg, plan()), ["TEST_LOGIN_SECRET_DEV", "TEST_USER_OWNER"]);
  assert.deepEqual(requiredVariables(cfg, { target: "dev", pages: [{ role: "anonymous" }], api: [] }), []);
});

t("scrub removes secrets everywhere; summary counts", () => {
  assert.deepEqual(scrub({ a: `x${SECRET}y`, [SECRET]: [SECRET] }, [SECRET]), { a: "x***y", "***": ["***"] });
  const s = summary({ pages: [{ widths: [{ axe: [{ impact: "serious" }, { impact: "minor" }], consoleErrors: ["e"], overflow: true }] }], api: [{ ok: false }], findings: ["Login owner failed (HTTP 403)"] });
  assert.ok(s.includes("| axe violations (serious) | 1 |") && s.includes("| API deviations | 1 |") && s.includes("| Login findings | 1 |") && s.includes("| Horizontal overflows | 1 |"));
});

function fakeBrowser(log, { loginStatus = 200 } = {}) {
  const page = () => ({
    on() {}, setViewportSize: async () => {}, goto: async (url) => { log.push(["goto", url]); return { status: () => 200 }; },
    evaluate: async () => ({ title: "T", lang: "en", sw: 400, cw: 400 }), screenshot: async () => {}, url: () => "https://dev.example.com/x?token=1", close: async () => {},
  });
  const context = () => ({
    request: { post: async (url, o) => { log.push(["post", url, o.data]); return { status: () => loginStatus }; }, get: async (url) => { log.push(["get", url]); return { status: () => 200 }; } },
    newPage: async () => page(), close: async () => {},
  });
  return { launch: async () => ({ newContext: async () => context(), close: async () => {} }) };
}
class FakeAxe { constructor() {} withTags() { return this; } async analyze() { return { violations: [{ id: "color-contrast", impact: "serious", help: "h", nodes: [{ target: ["a"] }] }] }; } }

t("run: logs in per role with the test-login body, checks pages and API, writes result without secrets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-pretest-"));
  try {
    const log = [];
    const res = await runPretest(cfg, plan(), { env, out: dir, chromium: fakeBrowser(log), axe: FakeAxe });
    const post = log.find((l) => l[0] === "post");
    assert.equal(post[1], "https://dev.example.com/api/test-login");
    assert.deepEqual(post[2], { secret: SECRET, userId: "user-owner-123", tenant: "test-a" });
    assert.equal(log.filter((l) => l[0] === "post").length, 1, "anonymous never logs in");
    assert.equal(res.pages[0].widths.length, 2);
    assert.equal(res.pages[0].widths[0].axe[0].impact, "serious");
    assert.equal(res.pages[0].widths[0].finalUrl, "https://dev.example.com/x", "query strings are dropped");
    assert.equal(res.api[0].ok, true);
    const text = readFileSync(join(dir, "result.json"), "utf8");
    assert.ok(!text.includes(SECRET));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: failed login skips the pages of that role and reports a finding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-pretest-"));
  try {
    const res = await runPretest(cfg, plan(), { env, out: dir, chromium: fakeBrowser([], { loginStatus: 403 }), axe: FakeAxe });
    assert.equal(res.pages[0].skipped, true);
    assert.ok(res.findings[0].startsWith("Login owner failed"));
    assert.equal(res.api[0].skipped, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("run: missing variable and short secret are refused before any browser starts", async () => {
  await assert.rejects(() => runPretest(cfg, plan(), { env: {}, chromium: fakeBrowser([]), axe: FakeAxe }), /TEST_LOGIN_SECRET_DEV/);
  await assert.rejects(() => runPretest(cfg, plan(), { env: { ...env, TEST_LOGIN_SECRET_DEV: "short" }, chromium: fakeBrowser([]), axe: FakeAxe }), /at least 32/);
});

t("cli: exit codes and secret scrubbing in messages", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-pretest-"));
  try {
    const planFile = join(dir, "p.json");
    writeFileSync(planFile, JSON.stringify(plan()));
    const errs = [];
    assert.equal(await main(["--plan", planFile], { stderr: (m) => errs.push(m) }), 2);
    assert.equal(await main(["--plan", planFile, "--out", dir], { conf: {}, stderr: (m) => errs.push(m) }), 2);
    assert.ok(errs.at(-1).includes('"pretest" is missing'));
    assert.equal(await main(["--plan", planFile, "--out", dir], { conf: { pretest: cfg }, env, chromium: fakeBrowser([]), axe: FakeAxe, stdout: () => {} }), 0);
    assert.ok(existsSync(join(dir, "result.json")));
    const bad = JSON.stringify({ ...plan(), tenant: SECRET });
    writeFileSync(planFile, bad);
    errs.length = 0;
    assert.equal(await main(["--plan", planFile, "--out", dir], { conf: { pretest: cfg }, env, stderr: (m) => errs.push(m) }), 1);
    assert.ok(!errs.join("\n").includes(SECRET));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

let n = 0;
for (const [name, fn] of queue) { await fn(); n++; console.log(`ok ${name}`); }
console.log(`${n} tests passed`);

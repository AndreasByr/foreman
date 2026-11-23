#!/usr/bin/env node
// Tests for dispatcher/watch.mjs. Run: node dispatcher/tests/test-watch.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, alarmText, watch } from "../watch.mjs";
import { writeBeat, readBeats } from "../heartbeat.mjs";

const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const NOW = Date.parse("2026-01-01T12:00:00Z");
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const bad = (module, state = "stale", extra = {}) => ({ module, state, ageMin: 840, limitMin: 30, lastRun: iso(NOW - 14 * H), result: "ok", note: "", ...extra });
const good = (module) => ({ module, state: "ok", ageMin: 1, limitMin: 30, lastRun: iso(NOW - 60000), result: "ok", note: "" });

t("decide: a new problem alarms once and is remembered with its start time", () => {
  const r = decide([bad("dispatcher"), good("watcher")], {}, NOW, { repeatMs: 6 * H });
  assert.deepEqual(r.alarms.map((a) => [a.module, a.kind]), [["dispatcher", "new"]]);
  assert.equal(r.next.dispatcher.since, iso(NOW));
  assert.equal(r.next.dispatcher.lastSent, iso(NOW));
  assert.deepEqual(r.recovered, []);
});

t("decide: the same problem stays quiet until the repeat time, then repeats and keeps its original start", () => {
  const known = { dispatcher: { since: iso(NOW - 2 * H), lastSent: iso(NOW - 2 * H), state: "stale" } };
  assert.deepEqual(decide([bad("dispatcher")], known, NOW, { repeatMs: 6 * H }).alarms, []);
  const r = decide([bad("dispatcher")], known, NOW + 5 * H, { repeatMs: 6 * H });
  assert.deepEqual(r.alarms.map((a) => a.kind), ["repeat"]);
  assert.equal(r.alarms[0].since, iso(NOW - 2 * H));
  assert.equal(r.next.dispatcher.lastSent, iso(NOW + 5 * H));
  assert.equal(r.next.dispatcher.since, iso(NOW - 2 * H));
});

t("decide: a module that is ok again is reported as recovered and forgotten; error is a problem too", () => {
  const known = { dispatcher: { since: iso(NOW - 3 * H), lastSent: iso(NOW - H), state: "stale" } };
  const r = decide([good("dispatcher"), bad("tracker-sync", "error", { note: "itsaplan API 401" })], known, NOW, { repeatMs: 6 * H });
  assert.deepEqual(r.recovered.map((x) => [x.module, x.since]), [["dispatcher", iso(NOW - 3 * H)]]);
  assert.equal(r.next.dispatcher, undefined);
  assert.deepEqual(r.alarms.map((a) => [a.module, a.state]), [["tracker-sync", "error"]]);
});

t("alarmText: names the module, the state, the last run and the limit; error carries the note", () => {
  const s = alarmText({ ...bad("dispatcher"), kind: "new", since: iso(NOW) });
  assert.match(s, /dispatcher/);
  assert.match(s, /14 h/);
  assert.match(s, /30 min/);
  const e = alarmText({ ...bad("tracker-sync", "error", { note: "itsaplan API 401" }), kind: "new", since: iso(NOW) });
  assert.match(e, /tracker-sync/);
  assert.match(e, /itsaplan API 401/);
  assert.match(alarmText({ module: "dispatcher", kind: "recovered", since: iso(NOW - 3 * H) }), /dispatcher.*(recovered|ok again)/i);
});

function setup(alarm = {}, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-watch-"));
  const cfg = { workdir: join(dir, "work"), alarm: { repeat_hours: 6, ...alarm }, ...extra };
  const status = join(cfg.workdir, "status");
  return { dir, cfg, status };
}
const recorder = (answer = () => ({ ok: true, status: 200, text: async () => "{}" })) => {
  const calls = [];
  const fetch = async (url, o = {}) => { calls.push({ url, method: o.method ?? "GET", body: o.body ?? "", headers: o.headers ?? {} }); return answer(url, o); };
  return { calls, fetch };
};
const HOOK = "https://discord.com/api/webhooks/1/SECRETHOOK";

t("watch: a stale dispatcher alarms through the webhook, writes its own beat and the alert state", async () => {
  const { dir, cfg, status } = setup({ channels: ["webhook"] });
  try {
    writeBeat(status, "dispatcher", { now: NOW - 14 * H, maxAgeMin: 30 });
    const { calls, fetch } = recorder();
    const logs = [];
    const code = await watch({ config: cfg, env: { DISPATCHER_ERROR_WEBHOOK_URL: HOOK }, now: NOW, fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1, "a problem exists");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, HOOK);
    assert.match(JSON.parse(calls[0].body).content, /dispatcher/);
    assert.ok(!logs.join("\n").includes("SECRETHOOK"));
    assert.equal(readBeats(status).find((b) => b.module === "watcher").result, "ok");
    const alerts = JSON.parse(readFileSync(join(cfg.workdir, "alerts.json"), "utf8"));
    assert.equal(alerts.dispatcher.state, "stale");
    // second run, 15 minutes later: nothing new is sent
    await watch({ config: cfg, env: { DISPATCHER_ERROR_WEBHOOK_URL: HOOK }, now: NOW + 15 * 60000, fetch, log: () => {} });
    assert.equal(calls.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch: all fine means exit 0 and no message; recovery sends one message and clears the state", async () => {
  const { dir, cfg, status } = setup({ channels: ["webhook"] });
  try {
    writeBeat(status, "dispatcher", { now: NOW - 14 * H, maxAgeMin: 30 });
    const { calls, fetch } = recorder();
    const env = { DISPATCHER_ERROR_WEBHOOK_URL: HOOK };
    await watch({ config: cfg, env, now: NOW, fetch, log: () => {} });
    writeBeat(status, "dispatcher", { now: NOW + 600000, maxAgeMin: 30 });
    const code = await watch({ config: cfg, env, now: NOW + 660000, fetch, log: () => {} });
    assert.equal(code, 0);
    assert.equal(calls.length, 2);
    assert.match(JSON.parse(calls[1].body).content, /recovered|ok again/i);
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.workdir, "alerts.json"), "utf8")), {});
    const quiet = await watch({ config: cfg, env, now: NOW + 720000, fetch, log: () => {} });
    assert.equal(quiet, 0);
    assert.equal(calls.length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch: default limits catch a dispatcher that never reported and a missing watcher is not alarmed", async () => {
  const { dir, cfg } = setup({ channels: ["webhook"] });
  try {
    const { calls, fetch } = recorder();
    const code = await watch({ config: cfg, env: { DISPATCHER_ERROR_WEBHOOK_URL: HOOK }, now: NOW, fetch, log: () => {} });
    assert.equal(code, 1);
    assert.equal(calls.length, 1);
    assert.match(JSON.parse(calls[0].body).content, /dispatcher/);
    assert.match(JSON.parse(calls[0].body).content, /never/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch: push channel posts the text to the URL from the named env variable, https only", async () => {
  const { dir, cfg, status } = setup({ channels: ["push"], push_url_env: "MY_PUSH" });
  try {
    writeBeat(status, "dispatcher", { result: "error", note: "git fetch failed", now: NOW - 60000, maxAgeMin: 30 });
    const { calls, fetch } = recorder();
    const logs = [];
    await watch({ config: cfg, env: { MY_PUSH: "https://ntfy.example/topic-secret" }, now: NOW, fetch, log: (m) => logs.push(m) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ntfy.example/topic-secret");
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].body, /dispatcher/);
    assert.match(calls[0].body, /git fetch failed/);
    assert.ok(!logs.join("\n").includes("topic-secret"));
    const none = recorder();
    await watch({ config: { ...cfg, workdir: join(dir, "w2") }, env: { MY_PUSH: "http://insecure.example/x" }, now: NOW, fetch: none.fetch, log: () => {} });
    assert.equal(none.calls.length, 0, "http is refused");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch: when every channel fails the alarm is not remembered (retried next run), exit 1, watcher beat says error", async () => {
  const { dir, cfg, status } = setup({ channels: ["webhook"] });
  try {
    writeBeat(status, "dispatcher", { now: NOW - 14 * H, maxAgeMin: 30 });
    const down = recorder(() => ({ ok: false, status: 500, text: async () => "no" }));
    const code = await watch({ config: cfg, env: { DISPATCHER_ERROR_WEBHOOK_URL: HOOK }, now: NOW, fetch: down.fetch, log: () => {} });
    assert.equal(code, 1);
    const alertsFile = join(cfg.workdir, "alerts.json");
    const alerts = existsSync(alertsFile) ? JSON.parse(readFileSync(alertsFile, "utf8")) : {};
    assert.equal(alerts.dispatcher, undefined);
    assert.equal(readBeats(status).find((b) => b.module === "watcher").result, "error");
    const up = recorder();
    await watch({ config: cfg, env: { DISPATCHER_ERROR_WEBHOOK_URL: HOOK }, now: NOW + 900000, fetch: up.fetch, log: () => {} });
    assert.equal(up.calls.length, 1, "retried");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch: no channel configured at all is an error on stderr-level log and a watcher error beat", async () => {
  const { dir, cfg, status } = setup({});
  try {
    writeBeat(status, "dispatcher", { now: NOW - 14 * H, maxAgeMin: 30 });
    const logs = [];
    const code = await watch({ config: cfg, env: {}, now: NOW, fetch: recorder().fetch, log: (m) => logs.push(m) });
    assert.equal(code, 1);
    assert.ok(logs.some((l) => /no alarm channel/i.test(l)));
    assert.equal(readBeats(status).find((b) => b.module === "watcher").result, "error");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function itsaplanFetch(tickets) {
  return recorder(async (url, o = {}) => {
    const method = o.method ?? "GET";
    const path = new URL(url).pathname;
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (method === "GET" && path === "/projects/KEY") return json({ columns: [{ id: "c1", name: "In Progress" }, { id: "c2", name: "Action Required" }, { id: "c3", name: "Done" }] });
    if (method === "GET" && path === "/projects/KEY/issues") return json({ items: tickets });
    if (method === "POST" && path === "/projects/KEY/issues") return json({ id: "T1" });
    return json({});
  });
}

t("watch: tracker channel opens one ticket in Action Required, comments on repeat, moves to Done on recovery", async () => {
  const { dir, cfg, status } = setup({ channels: ["tracker"], tracker: { project_key: "KEY", url_env: "TRK_URL", key_env: "TRK_KEY" } });
  try {
    const env = { TRK_URL: "https://plan.example", TRK_KEY: "key_SECRET_123456" };
    writeBeat(status, "dispatcher", { now: NOW - 14 * H, maxAgeMin: 30 });
    const { calls, fetch } = itsaplanFetch([]);
    await watch({ config: cfg, env, now: NOW, fetch, log: () => {} });
    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/projects/KEY/issues"));
    assert.ok(create, "ticket created");
    const body = JSON.parse(create.body);
    assert.match(body.title, /dispatcher/);
    assert.equal(body.columnId, "c2");
    assert.equal(calls[0].headers["x-api-key"], "key_SECRET_123456");
    const alerts = JSON.parse(readFileSync(join(cfg.workdir, "alerts.json"), "utf8"));
    assert.equal(alerts.dispatcher.ticket, "T1");
    // repeat after 7 hours: comment on the same ticket, no second ticket
    await watch({ config: cfg, env, now: NOW + 7 * H, fetch, log: () => {} });
    assert.equal(calls.filter((c) => c.method === "POST" && c.url.endsWith("/projects/KEY/issues")).length, 1);
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/issues/T1/comments")));
    // recovery: comment and move to Done
    writeBeat(status, "dispatcher", { now: NOW + 7 * H + 60000, maxAgeMin: 30 });
    await watch({ config: cfg, env, now: NOW + 7 * H + 120000, fetch, log: () => {} });
    const move = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/issues/T1"));
    assert.ok(move, "ticket moved");
    assert.equal(JSON.parse(move.body).columnId, "c3");
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.workdir, "alerts.json"), "utf8")), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t("watch.sh: runs the watcher with dispatcher.env and exits with its code", () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-watchsh-"));
  try {
    const workdir = join(dir, "work");
    mkdirSync(workdir, { recursive: true });
    writeFileSync(join(dir, "config.json"), JSON.stringify({ workdir, alarm: { channels: ["push"], push_url_env: "NOPE" } }));
    const sh = fileURLToPath(new URL("../watch.sh", import.meta.url));
    const r = spawnSync("bash", [sh, "--config", join(dir, "config.json")], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: dir, FOREMAN_DISPATCHER_ENV: join(dir, "none.env") } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(existsSync(join(workdir, "status", "watcher.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

let passed = 0;
const failures = [];
for (const [name, fn] of queue) {
  try { await fn(); passed++; console.log(`ok ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}\n  ${String(e?.message ?? e).split("\n").join("\n  ")}`); }
}
console.log(failures.length ? `${passed} tests passed, ${failures.length} failed` : `${passed} tests passed`);
if (failures.length) process.exitCode = 1;

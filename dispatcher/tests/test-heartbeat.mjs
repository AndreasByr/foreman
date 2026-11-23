#!/usr/bin/env node
// Tests for dispatcher/heartbeat.mjs. Run: node dispatcher/tests/test-heartbeat.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeBeat, readBeats, judge, formatStatus, statusDir, validModule } from "../heartbeat.mjs";

const HB = fileURLToPath(new URL("../heartbeat.mjs", import.meta.url));
const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const NOW = Date.parse("2026-01-01T12:00:00Z");
const min = (m) => NOW - m * 60000;
const tmp = () => mkdtempSync(join(tmpdir(), "foreman-hb-"));

t("module names: letters, digits, dot, colon, dash, underscore; no path tricks", () => {
  for (const ok of ["dispatcher", "project:my-app", "tracker-sync", "a.b_c"]) assert.equal(validModule(ok), true, ok);
  for (const bad of ["", "../x", "a/b", " x", "x y", "-x", ".x", "a".repeat(65), 5, null]) assert.equal(validModule(bad), false, String(bad));
});

t("write and read: atomic file per module, ok and error, single-line note, no temp files left", () => {
  const d = tmp();
  try {
    const dir = join(d, "status");
    writeBeat(dir, "dispatcher", { now: NOW, maxAgeMin: 30 });
    writeBeat(dir, "project:p", { result: "error", note: "git fetch failed\nsecond line", now: NOW });
    assert.deepEqual(readdirSync(dir).filter((f) => !f.endsWith(".json")), []);
    const beats = readBeats(dir);
    assert.deepEqual(beats.map((b) => b.module), ["dispatcher", "project:p"]);
    assert.equal(beats[0].result, "ok");
    assert.equal(beats[0].last_run, "2026-01-01T12:00:00.000Z");
    assert.equal(beats[0].max_age_min, 30);
    assert.equal(beats[1].result, "error");
    assert.equal(beats[1].note, "git fetch failed");
    assert.throws(() => writeBeat(dir, "../evil", { now: NOW }), /module/);
    assert.throws(() => writeBeat(dir, "x", { result: "fine", now: NOW }), /result/);
    writeBeat(dir, "dispatcher", { now: NOW + 60000 });
    assert.equal(readBeats(dir).length, 2, "same module overwrites its file");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t("read: missing directory is empty, a corrupt file is reported as an error beat", () => {
  const d = tmp();
  try {
    assert.deepEqual(readBeats(join(d, "none")), []);
    writeFileSync(join(d, "broken.json"), "{not json");
    const [b] = readBeats(d);
    assert.equal(b.result, "error");
    assert.equal(b.module, "broken");
    assert.match(b.note, /unreadable/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t("judge: ok, stale by config limit, stale by the beat's own limit, no limit means no age check, error always wins", () => {
  const beats = [
    { module: "a", last_run: new Date(min(10)).toISOString(), result: "ok", note: "", max_age_min: null },
    { module: "b", last_run: new Date(min(90)).toISOString(), result: "ok", note: "", max_age_min: null },
    { module: "c", last_run: new Date(min(50)).toISOString(), result: "ok", note: "", max_age_min: 30 },
    { module: "d", last_run: new Date(min(3000)).toISOString(), result: "ok", note: "", max_age_min: null },
    { module: "e", last_run: new Date(min(1)).toISOString(), result: "error", note: "boom", max_age_min: 30 },
    { module: "f", last_run: new Date(min(50)).toISOString(), result: "ok", note: "", max_age_min: 30 },
  ];
  const r = Object.fromEntries(judge(beats, { now: NOW, limits: { a: 30, b: 30, f: 120 } }).map((x) => [x.module, x]));
  assert.equal(r.a.state, "ok");
  assert.equal(r.b.state, "stale");
  assert.equal(r.b.ageMin, 90);
  assert.equal(r.b.limitMin, 30);
  assert.equal(r.c.state, "stale", "beat limit 30 < age 50");
  assert.equal(r.d.state, "ok", "no limit anywhere");
  assert.equal(r.e.state, "error");
  assert.equal(r.e.note, "boom");
  assert.equal(r.f.state, "ok", "config limit 120 beats the beat's 30");
  assert.equal(judge(beats, { now: NOW, defaultLimitMin: 60 }).find((x) => x.module === "d").state, "stale");
});

t("judge: a module with a configured limit and no beat is `never`", () => {
  const r = judge([], { now: NOW, limits: { dispatcher: 30 } });
  assert.deepEqual(r.map((x) => [x.module, x.state, x.limitMin]), [["dispatcher", "never", 30]]);
});

t("format: one line per module with state, last run and note; header when empty", () => {
  const r = judge([{ module: "dispatcher", last_run: new Date(min(5)).toISOString(), result: "ok", note: "2 projects", max_age_min: 30 },
    { module: "tracker-sync", last_run: new Date(min(600)).toISOString(), result: "error", note: "itsaplan API 401", max_age_min: null }], { now: NOW });
  const text = formatStatus(r, NOW);
  assert.match(text, /dispatcher\s+ok\s+5 min ago/);
  assert.match(text, /tracker-sync\s+error\s+10 h ago.*itsaplan API 401/);
  assert.match(formatStatus([], NOW), /no module has reported/i);
});

t("statusDir: FOREMAN_STATUS_DIR wins, else <workdir>/status", () => {
  assert.equal(statusDir({ workdir: "/w" }, {}), "/w/status");
  assert.equal(statusDir({ workdir: "/w" }, { FOREMAN_STATUS_DIR: "/s" }), "/s");
  assert.match(statusDir({}, {}), /foreman-dispatcher\/status$/);
});

t("cli: beat writes a file, status prints and exits 1 on error or stale, 0 when all ok", () => {
  const d = tmp();
  try {
    const run = (...a) => spawnSync("node", [HB, ...a], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: d } });
    let r = run("beat", "tracker-sync", "ok", "mirrored 3", "--dir", d);
    assert.equal(r.status, 0, r.stderr);
    r = run("status", "--dir", d);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /tracker-sync\s+ok/);
    r = run("beat", "tracker-sync", "error", "itsaplan API 401", "--dir", d);
    assert.equal(r.status, 0);
    r = run("status", "--dir", d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /error.*itsaplan API 401/);
    assert.equal(run("beat", "../x", "ok", "--dir", d).status, 2);
    assert.equal(run("beat", "x", "maybe", "--dir", d).status, 2);
    assert.equal(run("status", "--dir", join(d, "empty")).status, 0, "nothing reported is not an error by itself");
    assert.ok(existsSync(d));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

let passed = 0;
const failures = [];
for (const [name, fn] of queue) {
  try { await fn(); passed++; console.log(`ok ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}\n  ${String(e?.message ?? e).split("\n").join("\n  ")}`); }
}
console.log(failures.length ? `${passed} tests passed, ${failures.length} failed` : `${passed} tests passed`);
if (failures.length) process.exitCode = 1;

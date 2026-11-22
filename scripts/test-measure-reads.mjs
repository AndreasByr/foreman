#!/usr/bin/env node
// Tests for measure-reads.mjs. Run: node scripts/test-measure-reads.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, measure } from "./measure-reads.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "measure-reads.mjs");
const WIKI = "template/.claude/skills/foreman-wiki/SKILL.md";
const CLAUDE = "template/CLAUDE.md";
const ALL_PATHS = [...new Set(SCENARIOS.flatMap((s) => s.files))];

const repo = mkdtempSync(join(tmpdir(), "measure-reads-"));
const git = (...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
};
function write(path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}
function commit(msg) {
  git("add", "-A");
  git("commit", "-q", "-m", msg);
  return git("rev-parse", "HEAD");
}
function writeAll(sizes = {}) {
  for (const p of ALL_PATHS) write(p, "a".repeat(sizes[p] ?? 10));
}

git("init", "-q");
write(CLAUDE, "a".repeat(10));
const Z = commit("Z: only CLAUDE.md");
writeAll();
const A = commit("A: small");
writeAll({ [CLAUDE]: 500 });
const B = commit("B: CLAUDE.md larger");
writeAll();
const C = commit("C: same as A");
writeAll({ [WIKI]: 300 });
const D = commit("D: wiki larger");

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", repo, ...args], { cwd: repo, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

let n = 0;
let failed = 0;
function test(name, fn) {
  n++;
  try { fn(); console.log(`ok ${n} ${name}`); } catch (e) {
    failed++;
    console.log(`not ok ${n} ${name}\n  ${e.message}`);
  }
}

test("measure counts bytes with an injected reader and lists missing paths", () => {
  const res = measure((p) => (p === CLAUDE ? "äb" : null), [{ name: "x", counted: true, files: [CLAUDE, "nope.md"] }]);
  assert.equal(res[0].total, 3);
  assert.deepEqual(res[0].missing, ["nope.md"]);
});

test("current equal to or smaller than the baseline exits 0 with result: ok", () => {
  let r = run(["--ref", C, "--baseline", A]);
  assert.equal(r.code, 0);
  assert.match(r.out, /result: ok/);
  r = run(["--ref", A, "--baseline", B]);
  assert.equal(r.code, 0);
  assert.match(r.out, /milestone-run: \d+ B \(baseline \d+ B, -490 B\)/);
  assert.match(r.out, /result: ok/);
});

test("larger current exits 1 and names the scenario", () => {
  const r = run(["--ref", B, "--baseline", A]);
  assert.equal(r.code, 1);
  assert.match(r.out, /result: over baseline: milestone-run, fixpack-run, batch-run/);
  assert.match(r.out, /\+490 B/);
});

test("same ref on both sides gives diff 0 and exit 0", () => {
  const r = run(["--ref", A, "--baseline", A, "--json"]);
  assert.equal(r.code, 0);
  for (const s of JSON.parse(r.out).scenarios) assert.equal(s.diff, 0);
});

test("only the wiki addon grows: exit 0, wiki-addon reported with its size", () => {
  const r = run(["--ref", D, "--baseline", C]);
  assert.equal(r.code, 0);
  assert.match(r.out, /wiki-addon[^\n]*: 300 B/);
  assert.match(r.out, /result: ok/);
});

test("working tree is the default ref", () => {
  const r = run(["--baseline", C]);
  assert.equal(r.code, 0);
  assert.match(r.out, /working tree/);
  assert.match(r.out, /wiki-addon[^\n]*: 300 B/);
});

test("unknown ref exits 2 with measure-reads: on stderr and no numbers on stdout", () => {
  for (const args of [["--ref", "doesnotexist", "--baseline", A], ["--ref", A, "--baseline", "doesnotexist"]]) {
    const r = run(args);
    assert.equal(r.code, 2);
    assert.match(r.err, /^measure-reads:/);
    assert.equal(r.out, "");
  }
});

test("unknown option and missing option value exit 2", () => {
  for (const args of [["--bogus"], ["--ref"], ["--ref", "--json"]]) {
    const r = run(args);
    assert.equal(r.code, 2);
    assert.match(r.err, /^measure-reads:/);
    assert.equal(r.out, "");
  }
});

test("a path missing in the baseline counts 0 and is listed under missing", () => {
  const r = run(["--ref", A, "--baseline", Z, "--json"]);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  const ms = j.scenarios.find((s) => s.name === "milestone-run");
  assert.ok(ms.missing.some((m) => m.includes("foreman-milestone/SKILL.md") && m.includes("baseline")));
  assert.equal(ms.baseline, 10);
  assert.equal(ms.files.find((f) => f.path === CLAUDE).baseline, 10);
  assert.equal(ms.files.find((f) => f.path.endsWith("foreman-milestone/SKILL.md")).baseline, 0);
  assert.ok(j.over.includes("milestone-run"));
});

test("--json parses and has over: [] when ok", () => {
  const r = run(["--ref", C, "--baseline", A, "--json"]);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.deepEqual(j.over, []);
  assert.equal(j.ref, C);
  assert.equal(j.baseline, A);
  assert.deepEqual(j.scenarios.map((s) => s.name), SCENARIOS.map((s) => s.name));
});

test("the script does not modify the repo", () => {
  run(["--ref", B, "--baseline", A]);
  run(["--baseline", C, "--json"]);
  assert.equal(git("status", "--porcelain"), "");
});

test("option-like or shell-like ref names exit 2 and create no file", () => {
  for (const bad of ["x;touch pwned", "$(touch pwned)", "-x", "--exec=touch pwned", "`touch pwned`"]) {
    const r = run(["--ref", bad, "--baseline", A]);
    assert.equal(r.code, 2, bad);
    assert.equal(r.out, "", bad);
    const r2 = run(["--ref", A, "--baseline", bad]);
    assert.equal(r2.code, 2, bad);
  }
  assert.equal(existsSync(join(repo, "pwned")), false);
  assert.equal(git("status", "--porcelain"), "");
});

rmSync(repo, { recursive: true, force: true });
if (failed) { console.error(`${failed} of ${n} failed`); process.exit(1); }

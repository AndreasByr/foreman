#!/usr/bin/env node
// Tests for check-state-touched.mjs. Run: node scripts/test-check-state-touched.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkStateTouched } from "./check-state-touched.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

const STATE = "docs/fixpacks/2026-11-23-x/STATE.md";

t("code change without STATE.md is red and names the first file", () => {
  const r = checkStateTouched(["scripts/a.mjs", "README.md"]);
  assert.equal(r.ok, false);
  assert.match(r.message, /scripts\/a\.mjs/);
  assert.match(r.message, /STATE\.md/);
});

t("code change with a fix pack STATE.md is green", () => {
  assert.equal(checkStateTouched(["scripts/a.mjs", STATE]).ok, true);
});

t("code change with a milestone STATE.md is green", () => {
  assert.equal(checkStateTouched(["app/x.ts", "docs/milestones/M004/STATE.md"]).ok, true);
});

t("fix pack file other than STATE.md without STATE.md is red", () => {
  assert.equal(checkStateTouched(["docs/fixpacks/2026-11-23-x/ORDER.md"]).ok, false);
  assert.equal(checkStateTouched(["docs/milestones/M004/M004-CONTEXT.md"]).ok, false);
});

t("docs-only, root markdown and license changes are green", () => {
  assert.equal(checkStateTouched(["docs/learnings.md", "docs/agent-reports/x.md", "README.md", "CHANGELOG.md", "LICENSE"]).ok, true);
});

t("a STATE.md template does not count as the unit's state", () => {
  assert.equal(checkStateTouched(["scripts/a.mjs", "docs/fixpacks/_TEMPLATE/STATE.md"]).ok, false);
});

t("a STATE.md alone is green; empty diff is green", () => {
  assert.equal(checkStateTouched([STATE]).ok, true);
  assert.equal(checkStateTouched([]).ok, true);
});

t("sync and release PRs (head main or dev) are skipped", () => {
  assert.equal(checkStateTouched(["scripts/a.mjs"], { headRef: "main" }).ok, true);
  assert.equal(checkStateTouched(["scripts/a.mjs"], { headRef: "dev" }).ok, true);
  assert.equal(checkStateTouched(["scripts/a.mjs"], { headRef: "batch/dev" }).ok, false);
});

t("bot, sync and foreman update PRs are skipped by head prefix", () => {
  for (const h of ["dependabot/npm/x", "renovate/x", "sync/main-to-dev", "foreman-update-0.2.5", "foreman-update"]) {
    assert.equal(checkStateTouched(["scripts/a.mjs"], { headRef: h }).ok, true, h);
  }
  assert.equal(checkStateTouched(["scripts/a.mjs"], { headRef: "agent/foreman-update-x" }).ok, false);
});

t("a deleted STATE.md does not count", () => {
  assert.equal(checkStateTouched(["scripts/a.mjs", STATE], { stateFiles: ["scripts/a.mjs"] }).ok, false);
  assert.equal(checkStateTouched(["scripts/a.mjs", STATE], { stateFiles: [STATE] }).ok, true);
});

t("CLI on a real repo: red without STATE.md, green with it, 2 on bad usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "state-touched-"));
  const git = (...a) => { const r = spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  const put = (p, c) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); };
  const cli = (...a) => spawnSync("node", [join(HERE, "check-state-touched.mjs"), ...a], { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "dev");
    put("README.md", "x\n");
    git("add", "-A"); git("commit", "-qm", "base");
    git("checkout", "-qb", "work");
    put("scripts/a.mjs", "1\n");
    git("add", "-A"); git("commit", "-qm", "code");
    let r = cli("--base", "dev", "--head", "work");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /STATE\.md/);
    put(STATE, "Status: fixpack\n");
    git("add", "-A"); git("commit", "-qm", "state");
    r = cli("--base", "dev", "--head", "work");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    git("rm", "-q", STATE); git("commit", "-qm", "drop state");
    r = cli("--base", "dev", "--head", "work");
    assert.equal(r.status, 1, "deleted STATE.md must stay red: " + r.stdout + r.stderr);
    r = cli("--base", "dev", "--head", "work", "--head-ref", "dependabot/x");
    assert.equal(r.status, 0);
    r = cli("--base", "dev");
    assert.equal(r.status, 2);
    r = cli("--base", "nope", "--head", "work");
    assert.equal(r.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

let failed = 0;
for (const [name, fn] of queue) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n  ${e.message}`); }
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log(`${queue.length} tests ok`);

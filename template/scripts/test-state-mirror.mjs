#!/usr/bin/env node
// Tests for the pure parts of state-mirror.mjs. Run: node scripts/test-state-mirror.mjs
import assert from "node:assert/strict";
import { parseState, linearPlan, notionPlan } from "./state-mirror.mjs";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

const state = `# M004 Member export
Status: uat-ready since 2026-01-10T08:00:00Z
Target: dev
Batch-branch: batch/m004
Lock: free
Tracker: -
Pretest-round: 2
`;

t("parse fields", () => {
  const u = parseState(state);
  assert.equal(u.status, "uat-ready");
  assert.equal(u.since, "2026-01-10T08:00:00Z");
  assert.equal(u.target, "dev");
  assert.equal(u.title, "M004 Member export");
  assert.equal(u.tracker, "");
  assert.equal(u.pretestRound, 2);
});

t("unknown status is empty", () => {
  assert.equal(parseState("Status: finished-ish").status, "");
});

const unit = { id: "M004", ...parseState(state) };

t("linear: create when missing", () => {
  const c = linearPlan(unit, null, {});
  assert.equal(c.length, 1);
  assert.equal(c[0].op, "create");
  assert.equal(c[0].state, "In Review");
  assert.equal(c[0].label, "AP: uat-ready");
  assert.ok(c[0].title.startsWith("[M004]"));
});

t("linear: idempotent when in sync", () => {
  assert.deepEqual(linearPlan(unit, { state: "In Review", labels: ["AP: uat-ready", "Milestone"] }, {}), []);
});

t("linear: fixes state and stale phase label", () => {
  const c = linearPlan(unit, { state: "Testing", labels: ["AP: pretest-running"] }, {});
  assert.deepEqual(c.map((x) => x.op).sort(), ["addLabel", "removeLabel", "state"]);
});

t("linear: done removes phase labels", () => {
  const done = { ...unit, status: "done" };
  const c = linearPlan(done, { state: "In Review", labels: ["AP: uat-ready"] }, {});
  assert.deepEqual(c, [{ op: "state", from: "In Review", to: "Done" }, { op: "removeLabel", label: "AP: uat-ready" }]);
});

t("notion: opens one row per round, closes older ones", () => {
  const u = { ...unit, status: "pretest-waiting", pretestRound: 2 };
  const c = notionPlan(u, [{ id: "a", round: 1, phase: "Fix round" }], {});
  assert.deepEqual(c, [{ op: "createRow", round: 2, phase: "Pretest waiting" }, { op: "phase", id: "a", to: "Taken over" }]);
  const again = notionPlan(u, [{ id: "a", round: 1, phase: "Taken over" }, { id: "b", round: 2, phase: "Pretest waiting" }], {});
  assert.deepEqual(again, []);
});

t("notion: does not overwrite pretest result phases", () => {
  const u = { ...unit, status: "pretest-running", pretestRound: 2 };
  assert.deepEqual(notionPlan(u, [{ id: "b", round: 2, phase: "UAT ready" }], {}), []);
});

t("notion: approval closes all rows", () => {
  const u = { ...unit, status: "done" };
  const c = notionPlan(u, [{ id: "b", round: 2, phase: "UAT ready" }], {});
  assert.deepEqual(c, [{ op: "phase", id: "b", to: "Taken over" }]);
});

console.log(`${n} tests passed`);

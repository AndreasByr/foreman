#!/usr/bin/env node
// Tests for the itsaplan project template and its mirror fit. Run: node scripts/test-itsaplan-template.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTemplate, projectFromTemplate, GERMAN_WORDS } from "./lib/itsaplan-template.mjs";
import { plan, TARGETS } from "./lib/itsaplan-mirror.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(here, "..", "plugins", "foreman", "skills", "foreman-setup", "references", "itsaplan-project-template.json");

// Loaded lazily inside each test, so a missing file fails the test that needs it and nothing else.
function loadTemplate() {
  return JSON.parse(readFileSync(TEMPLATE, "utf8"));
}
function copy(x) {
  return JSON.parse(JSON.stringify(x));
}
function labelId(template, name) {
  const label = template.snapshot.labels.find((l) => l.name === name);
  assert.ok(label, `label missing: ${name}`);
  return label.id;
}
// All `field`/`value` (or `values`) entries of a filter tree, at any depth.
function conditionValues(node, field) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n.field === field) out.push(n.value, n.values);
    Object.values(n).forEach(walk);
  };
  walk(node);
  return out.flat();
}
// Every object key at any depth.
function allKeys(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => allKeys(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}
// String values under the keys that carry human text.
const TEXT_KEYS = new Set(["name", "description", "titleTemplate", "descriptionTemplate"]);
function textFields(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => textFields(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (TEXT_KEYS.has(k) && typeof v === "string") out.push(v);
      textFields(v, out);
    }
  }
  return out;
}

const LABEL_NAMES = [
  "Milestone", "Fix pack", "AP: Coding", "AP: Fix round", "AP: Action Required", "AP: Waiting for merge",
  "AP: Pretest waiting", "AP: Pretest running", "AP: UAT ready", "AP: Release ready",
];
const COLUMN_TYPES = {
  Backlog: "backlog", Todo: "unstarted", Done: "completed", "In Progress": "started", "Action Required": "started",
  "Wait for Merge": "started", Testing: "started", "In Review": "started",
};

const STATE = `Status: planning since 2026-11-21T08:00:00Z
Target: dev

# M900 Demo

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | First | open | | a.js | - |
`;

// One unit per status, as plan() sees it.
const unitFor = (status) => ({ id: "M900", kind: "milestone", status, stateText: STATE });

const queue = [];
const t = (name, fn) => queue.push([name, fn]);

t("the real template passes validateTemplate", () => {
  assert.deepEqual(validateTemplate(loadTemplate()), []);
});

t("template has the expected columns, labels, UAT view, issue templates; no people, URLs or secret keys", () => {
  const tpl = loadTemplate();
  const s = tpl.snapshot;

  assert.equal(s.columns.length, 8);
  assert.deepEqual(Object.fromEntries(s.columns.map((c) => [c.name, c.stateType])), COLUMN_TYPES);

  assert.equal(s.labels.length, 10);
  assert.deepEqual(s.labels.map((l) => l.name).sort(), [...LABEL_NAMES].sort());

  const view = s.views.find((v) => v.name === "UAT ready");
  assert.ok(view, "view 'UAT ready' missing");
  assert.ok(conditionValues(view.filters, "labels").includes(labelId(tpl, "AP: UAT ready")),
    "view 'UAT ready' does not filter on label 'AP: UAT ready'");

  assert.deepEqual(s.issueTemplates.map((x) => x.name).sort(), ["Intervention", "UAT", "Update notice"]);

  const text = JSON.stringify(tpl);
  assert.doesNotMatch(text, /https?:\/\/|www\./i, "URL in template");
  const people = /^(assignee|assignees|owner|owners|user|users|email|member|members|person|people)$/i;
  assert.deepEqual(allKeys(tpl).filter((k) => people.test(k)), [], "person-like key in template");
  assert.deepEqual(allKeys(tpl).filter((k) => /token|secret|password/i.test(k)), [], "secret-like key in template");
});

t("no German in names, descriptions or templates; no äöüß", () => {
  const violations = [];
  for (const text of textFields(loadTemplate())) {
    for (const word of text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)) {
      if (GERMAN_WORDS.has(word)) violations.push({ text, word });
    }
    if (/[äöüßÄÖÜ]/.test(text)) violations.push({ text, word: "non-ASCII letter" });
  }
  assert.deepEqual(violations, []);
});

t("mirror: every TARGETS status plans as create against the template project", () => {
  const project = projectFromTemplate(loadTemplate());
  for (const status of Object.keys(TARGETS)) {
    assert.equal(plan(unitFor(status), null, project, {}).action, "create", status);
  }
});

const mutations = [
  ["German label name", (m) => { m.snapshot.labels.find((l) => l.name === "AP: UAT ready").name = "AP: UAT bereit"; }, /AP: UAT bereit/],
  ["missing column", (m) => { m.snapshot.columns = m.snapshot.columns.filter((c) => c.name !== "Wait for Merge"); }, /Wait for Merge/],
  ["duplicate label name", (m) => { m.snapshot.labels.find((l) => l.name === "AP: Release ready").name = "AP: Coding"; }, /AP: Coding/],
  ["unknown snapshot key", (m) => { m.snapshot.bogusKey = true; }, /bogusKey/],
  ["version 2", (m) => { m.version = 2; }, /version/i],
  ["dangling label id in issue template", (m) => { m.snapshot.issueTemplates[0].labelIds.push(99999); }, /99999/],
  ["two default issue types", (m) => {
    const types = m.snapshot.issueTypes;
    const maxId = Math.max(...types.map((x) => x.id));
    types.forEach((x) => { x.isDefault = true; });
    types.push({ ...copy(types[0]), id: maxId + 1, name: "Extra type", position: Math.max(...types.map((x) => x.position)) + 1 });
  }, /default/i],
  ["no default issue type", (m) => { m.snapshot.issueTypes.forEach((x) => { x.isDefault = false; }); }, /default/i],
  ["German label name as extra label", (m) => {
    const labels = m.snapshot.labels;
    labels.push({ id: Math.max(...labels.map((l) => l.id)) + 1, groupId: null, name: "Fehler", color: "#1F2937" });
  }, /Fehler/],
  ["two issue types with the same position", (m) => {
    const types = m.snapshot.issueTypes;
    const maxId = Math.max(...types.map((x) => x.id));
    types.push({ ...copy(types[0]), id: maxId + 1, name: "Bug", isDefault: false, position: types[0].position });
  }, /position/i],
  ["two views with the same position", (m) => {
    const views = m.snapshot.views;
    views.push({ ...copy(views[0]), name: "Dup view" });
  }, /position/i],
];
for (const [name, mutate, hint] of mutations) {
  t(`negative: ${name} is reported`, () => {
    const m = loadTemplate();
    mutate(m);
    const errors = validateTemplate(m);
    assert.ok(errors.length >= 1, "no error reported");
    assert.ok(errors.some((e) => hint.test(e)), `no error mentions ${hint}: ${errors.join(" | ")}`);
  });
}

t("negative mirror: without 'Wait for Merge' plan for awaiting-merge throws Missing column", () => {
  const m = loadTemplate();
  m.snapshot.columns = m.snapshot.columns.filter((c) => c.name !== "Wait for Merge");
  const project = projectFromTemplate(m);
  assert.throws(() => plan(unitFor("awaiting-merge"), null, project, {}), /Missing column/);
});

const FIXPACK_STATE = `Status: fixpack since 2026-11-21T08:00:00Z
Target: dev

# F900 Demo fix pack

## Points

| # | Point | Status | Commit | Files | Open points |
|---|---|---|---|---|---|
| F1 | First fix | open | | a.js | - |
`;
const fixpackUnit = () => ({ id: "F900", kind: "fixpack", status: "fixpack", note: "Fix round", stateText: FIXPACK_STATE });

t("mirror: fixpack unit with note 'Fix round' plans as create with 'Fix pack' and 'AP: Fix round' labels", () => {
  const tpl = loadTemplate();
  const project = projectFromTemplate(tpl);
  const result = plan(fixpackUnit(), null, project, {});
  assert.equal(result.action, "create");
  assert.ok(result.fields.labelIds.includes(labelId(tpl, "Fix pack")), "label 'Fix pack' missing");
  assert.ok(result.fields.labelIds.includes(labelId(tpl, "AP: Fix round")), "label 'AP: Fix round' missing");
});

t("negative mirror: without label 'Fix pack' plan for a fixpack unit throws Missing labels", () => {
  const m = loadTemplate();
  m.snapshot.labels = m.snapshot.labels.filter((l) => l.name !== "Fix pack");
  const project = projectFromTemplate(m);
  assert.throws(() => plan(fixpackUnit(), null, project, {}), /Missing labels/);
});

let n = 0;
for (const [name, fn] of queue) {
  await fn();
  n++;
  console.log(`ok ${name}`);
}
console.log(`${n} tests passed`);

#!/usr/bin/env node
// Tests for measure.mjs and the intervention cause. Run: node scripts/test-measure.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { interventions, openQuestion } from "./lib/intervention.mjs";

// The repo root holds template/ (from scripts/) or is the parent of template/ (from template/scripts/).
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = existsSync(join(HERE, "..", "template")) ? join(HERE, "..") : join(HERE, "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

const STATE_TEMPLATES = [
  "docs/milestones/_TEMPLATE/STATE.md",
  "template/docs/milestones/_TEMPLATE/STATE.md",
  "docs/fixpacks/_TEMPLATE/STATE.md",
  "template/docs/fixpacks/_TEMPLATE/STATE.md",
];

const CAUSE_SKILLS = [
  "template/.claude/skills/foreman-dispatch-run/references/intervention.md",
  ".claude/skills/foreman-milestone/SKILL.md",
  ".claude/skills/foreman-fixpack/SKILL.md",
  "template/.claude/skills/foreman-fixpack/SKILL.md",
];

let n = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

t("a section with a valid cause line is an intervention without problem", () => {
  const r = interventions("# M1\n\n## Open question\n\n**Cause:** open-decision · Which format?\n");
  assert.equal(r.length, 1);
  assert.equal(r[0].problem, null);
  assert.deepEqual(r[0].cause, { category: "open-decision", text: "Which format?" });
  assert.equal(r[0].answered, false);
  assert.equal(r[0].heading, "## Open question");
});

t("no open question section gives an empty list", () => {
  assert.deepEqual(interventions("# M1\n\n## Log\n\n**Cause:** other · nothing\n"), []);
});

t("missing cause line is reported as missing", () => {
  const r = interventions("## Open question\n\nWhich format?\n");
  assert.equal(r.length, 1);
  assert.equal(r[0].problem, "missing");
  assert.equal(r[0].cause, null);
});

t("plain dash separator is not a cause line", () => {
  const r = interventions("## Open question\n\n**Cause:** open-decision - Which format?\n");
  assert.equal(r[0].problem, "missing");
  assert.equal(r[0].cause, null);
});

t("unknown category is reported with the raw category", () => {
  const r = interventions("## Open question\n\n**Cause:** banana · x\n");
  assert.equal(r[0].problem, "unknown-category");
  assert.equal(r[0].cause.category, "banana");
});

t("category without a sentence is empty-text", () => {
  const r = interventions("## Open question\n\n**Cause:** other · \n");
  assert.equal(r[0].problem, "empty-text");
  assert.equal(r[0].cause.category, "other");
});

t("two sections, one answered: two entries with answered flags in file order", () => {
  const r = interventions([
    "## Open question (answered 2026-11-20)",
    "",
    "**Cause:** missing-infra · Old server was down.",
    "",
    "## Log",
    "",
    "## Open question",
    "",
    "**Cause:** security · Token in the export link.",
    "",
  ].join("\n"));
  assert.equal(r.length, 2);
  assert.equal(r[0].answered, true);
  assert.equal(r[0].heading, "## Open question (answered 2026-11-20)");
  assert.equal(r[1].answered, false);
  assert.equal(r[1].cause.category, "security");
});

t("template placeholder section is not an intervention", () => {
  const r = interventions([
    "## Open question (when `needs-input`)",
    "",
    "One question, options, recommendation.",
    "**Cause:** <category> · <one sentence>",
    "Categories: missing-requirement, open-decision, missing-infra, merge-conflict, ui-deviation, limit-exceeded, security, other. One section per intervention; keep the section after it is answered.",
    "",
    "## Log",
  ].join("\n"));
  assert.deepEqual(r, []);
});

t("the four STATE templates have no interventions and no open question", () => {
  for (const rel of STATE_TEMPLATES) {
    const text = read(rel);
    assert.deepEqual(interventions(text), [], rel);
    assert.equal(openQuestion(text), null, rel);
  }
});

t("open question with a real question and a real cause line: short is the question", () => {
  const text = "## Open question\n\n**Cause:** open-decision · Pick a format.\n\nWhich export format do we ship first? Option A is CSV.\n";
  const q = openQuestion(text);
  assert.equal(q.short, "Which export format do we ship first?");
  assert.ok(q.text.includes("**Cause:** open-decision · Pick a format."));
});

t("skills named in the cause task contain the Cause line", () => {
  for (const rel of CAUSE_SKILLS) {
    assert.ok(read(rel).includes("**Cause:**"), rel);
  }
});

t("edge: CRLF line endings are parsed", () => {
  const r = interventions("## Open question\r\n\r\n**Cause:** merge-conflict · Two branches edit the same file.\r\n");
  assert.equal(r.length, 1);
  assert.equal(r[0].problem, null);
  assert.equal(r[0].cause.category, "merge-conflict");
});

t("edge: heading with trailing spaces is still an open question", () => {
  const r = interventions("## Open question (answered)   \n\n**Cause:** other · Done.\n");
  assert.equal(r.length, 1);
  assert.equal(r[0].answered, true);
  assert.equal(r[0].heading, "## Open question (answered)");
});

t("edge: cause line outside an open question section is ignored", () => {
  const r = interventions("**Cause:** security · Loose line.\n\n## Log\n\n**Cause:** other · Also loose.\n");
  assert.deepEqual(r, []);
});

t("edge: non-string input gives an empty list", () => {
  assert.deepEqual(interventions(undefined), []);
  assert.deepEqual(interventions(null), []);
  assert.deepEqual(interventions(42), []);
});

let failed = 0;
for (const [name, fn] of queue) {
  try { await fn(); n++; console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n  ${e.message}`); }
}
console.log(`${n}/${queue.length} passed`);
process.exit(failed ? 1 : 0);

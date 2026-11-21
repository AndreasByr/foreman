#!/usr/bin/env node
// Tests for measure.mjs and the intervention cause. Run: node scripts/test-measure.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { interventions, openQuestion } from "./lib/intervention.mjs";
import { collect, FALLBACK_TAG } from "./lib/measure.mjs";

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

// ---- collect() ----

const FIXTURES = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "measure-"));
  FIXTURES.push(d);
  return d;
}
function put(root, rel, text) {
  const f = join(root, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text);
  return f;
}
const stateText = (title, log, extra = "") => `Status: done\n\n# ${title}\n\n${extra}## Log\n\n${log.join("\n")}\n`;
const result = (...attempts) => `# Result: x\n\nStatus: **DONE**\n\n${attempts.map((a, i) => `## Attempt ${i + 1}: ${a}\n\nAnswer:\n\nsecret text\n`).join("\n")}`;
const PERIOD = { since: "2026-11-01T00:00:00Z", until: "2026-11-30T23:59:59Z" };

/** The sample project of the task: M101, FP1, M102, three reports, four result files. */
function sample() {
  const root = tmp();
  put(root, "docs/milestones/M101/STATE.md", stateText("M101: Export", [
    "- 2026-11-10T08:00Z · plan",
    "- 2026-11-10T09:00Z · S1 done",
    "- 2026-11-10T10:00Z · needs-input",
    "- 2026-11-10T12:00Z · answered, continue",
    "- 2026-11-10T12:30Z · needs-input",
    "- 2026-11-10T13:00Z · answered",
    "- 2026-11-10T13:30Z · UAT ready",
  ], "## Open question (answered 2026-11-10)\n\n**Cause:** missing-infra · No test tenant.\n\n## Open question\n\n**Cause:** open-decision · Which format?\n\n"));
  put(root, "docs/fixpacks/FP1/STATE.md", stateText("FP1: Fixes", ["- 2026-11-11T09:00Z · start", "- 2026-11-11T09:45Z · done"]));
  put(root, "docs/milestones/M102/STATE.md", stateText("M102: Import", ["- 2026-11-12T10:00Z · plan", "- 2026-11-12T11:00Z · needs-input"], "## Open question\n\nWhich source?\n\n"));
  put(root, "docs/milestones/_TEMPLATE/STATE.md", stateText("M000: <title>", ["- 2026-11-10T08:00Z · x"]));
  for (const n of ["2026-11-10-M101-S1.md", "2026-11-10-M101-S2.md", "2026-11-12-M102.md"]) put(root, `docs/agent-reports/${n}`, "report");
  const dir = join(root, "tools/delegate/tasks");
  const mtime = new Date("2026-11-15T12:00:00Z");
  const files = {
    "r1.result.md": result("execution_simple (claude/claude-haiku-5-5) - ok, 60s"),
    "r2.result.md": result("execution_simple (ollama/glm-x) - failed, 30s", "execution_simple (claude/claude-haiku-5-5, fallback after provider outage) - ok, 40s"),
    "r3.result.md": result("execution (claude/claude-sonnet-5-5) - ok, 90s"),
    "r4.result.md": result("research (claude/claude-haiku-5-5) - ok, 20s"),
  };
  for (const [name, text] of Object.entries(files)) utimesSync(put(root, `tools/delegate/tasks/${name}`, text), mtime, mtime);
  return { root, dir };
}

t("collect: sample project sums minutes, interventions, attempts and models", () => {
  const { root } = sample();
  const r = collect({ root, ...PERIOD });
  assert.deepEqual(r.units.map((u) => u.id), ["FP1", "M101", "M102"]);
  assert.equal(r.units.reduce((s, u) => s + u.minutes, 0), 285);
  const m101 = r.units.find((u) => u.id === "M101");
  assert.equal(m101.kind, "milestone");
  assert.equal(m101.title, "M101: Export");
  assert.equal(m101.minutes, 180);
  assert.equal(m101.waitedMinutes, 150);
  assert.equal(m101.reports, 2);
  assert.equal(r.units.find((u) => u.id === "FP1").kind, "fixpack");
  assert.equal(r.units.find((u) => u.id === "FP1").minutes, 45);
  assert.equal(r.units.find((u) => u.id === "M102").reports, 1);
  assert.deepEqual(r.interventionsByCause, { "open-decision": 1, "missing-infra": 1 });
  assert.equal(r.interventionsWithoutCause, 1);
  assert.equal(r.attempts, 5);
  assert.equal(r.fallbacks, 1);
  assert.deepEqual(r.modelsByRole, {
    execution_simple: { "claude/claude-haiku-5-5": 2, "ollama/glm-x": 1 },
    execution: { "claude/claude-sonnet-5-5": 1 },
    research: { "claude/claude-haiku-5-5": 1 },
  });
  assert.deepEqual(r.period, { since: "2026-11-01T00:00:00.000Z", until: "2026-11-30T23:59:59.000Z" });
});

t("collect: open needs-input wait of the last line is not subtracted and reported", () => {
  const { root } = sample();
  const r = collect({ root, ...PERIOD });
  const m102 = r.units.find((u) => u.id === "M102");
  assert.equal(m102.minutes, 60);
  assert.equal(m102.waitedMinutes, 0);
  assert.deepEqual(m102.interventions, [{ category: null, problem: "missing" }]);
  assert.ok(r.gaps.includes("M102: open needs-input wait not subtracted"));
  assert.ok(r.gaps.includes("M102: intervention without valid cause (missing)"));
});

t("collect: the result files keep no text besides counts", () => {
  const { root } = sample();
  assert.ok(!JSON.stringify(collect({ root, ...PERIOD })).includes("secret"));
});

t("collect: a one-day period contains only FP1", () => {
  const { root } = sample();
  const r = collect({ root, since: "2026-11-11", until: "2026-11-11" });
  assert.deepEqual(r.units.map((u) => u.id), ["FP1"]);
  assert.equal(r.interventionsWithoutCause, 0);
  assert.deepEqual(r.interventionsByCause, {});
  assert.equal(r.attempts, 0);
});

t("collect: malformed log line adds one gap and the unit still works", () => {
  const root = tmp();
  put(root, "docs/milestones/M200/STATE.md", stateText("M200", ["- 2026-11-10T08:00Z · plan", "- 2026-13-40T99:99Z · x", "- no time at all", "- 2026-11-10T08:30Z · done"]));
  const r = collect({ root, ...PERIOD });
  assert.equal(r.units[0].minutes, 30);
  assert.deepEqual(r.gaps.filter((g) => g.startsWith("M200")), ["M200: log line without valid time"]);
});

t("collect: unit without any valid stamp is a gap, not a unit", () => {
  const root = tmp();
  put(root, "docs/milestones/M201/STATE.md", stateText("M201", ["- 2026-13-40T99:99Z · x"]));
  put(root, "docs/milestones/M202/STATE.md", stateText("M202", []));
  const r = collect({ root, ...PERIOD });
  assert.deepEqual(r.units, []);
  assert.ok(r.gaps.includes("M201: log line without valid time"));
  assert.ok(r.gaps.some((g) => g.startsWith("M202:")));
});

t("collect: stamps with seconds and without seconds both work", () => {
  const root = tmp();
  put(root, "docs/fixpacks/FP2/STATE.md", stateText("FP2", ["- 2026-11-10T08:00:00Z · a", "- 2026-11-10T08:20Z · b"]));
  assert.equal(collect({ root, ...PERIOD }).units[0].minutes, 20);
});

t("collect: descending stamps never give negative minutes", () => {
  const root = tmp();
  put(root, "docs/fixpacks/FP3/STATE.md", stateText("FP3", ["- 2026-11-10T10:00Z · a", "- 2026-11-10T09:00Z · needs-input", "- 2026-11-10T08:00Z · b"]));
  const u = collect({ root, ...PERIOD }).units[0];
  assert.equal(u.minutes, 120);
  assert.equal(u.waitedMinutes, 0);
  put(root, "docs/fixpacks/FP4/STATE.md", stateText("FP4", ["- 2026-11-10T10:00Z · needs-input", "- 2026-11-10T08:00Z · b", "- 2026-11-10T09:00Z · c"]));
  for (const x of collect({ root, ...PERIOD }).units) assert.ok(x.minutes >= 0);
});

t("collect: wait longer than the span never drives minutes below zero", () => {
  const root = tmp();
  put(root, "docs/fixpacks/FP5/STATE.md", stateText("FP5", ["- 2026-11-10T08:00Z · needs-input", "- 2026-11-10T09:00Z · b"]));
  assert.equal(collect({ root, ...PERIOD }).units[0].minutes, 0);
});

t("collect: missing resultsDir gives a gap and no crash", () => {
  const root = tmp();
  const r = collect({ root, ...PERIOD });
  assert.deepEqual(r.gaps, [`worker result files not found (${join(root, "tools", "delegate", "tasks")})`]);
  assert.equal(r.attempts, 0);
  assert.deepEqual(r.units, []);
});

t("collect: empty result file and file without attempt give a gap", () => {
  const root = tmp();
  const mtime = new Date("2026-11-15T12:00:00Z");
  for (const [n, text] of [["empty.result.md", ""], ["other.result.md", "# Result\n\nno attempts here\n"]]) {
    utimesSync(put(root, `tools/delegate/tasks/${n}`, text), mtime, mtime);
  }
  const r = collect({ root, ...PERIOD });
  assert.deepEqual(r.gaps, ["empty.result.md: no attempt found", "other.result.md: no attempt found"]);
  assert.equal(r.attempts, 0);
});

t("collect: result files outside the period are ignored", () => {
  const { root } = sample();
  const old = new Date("2026-10-01T00:00:00Z");
  utimesSync(join(root, "tools/delegate/tasks/r3.result.md"), old, old);
  const r = collect({ root, ...PERIOD });
  assert.equal(r.attempts, 4);
  assert.equal(r.modelsByRole.execution, undefined);
});

t("collect: report names match the unit id exactly, case-insensitive", () => {
  const root = tmp();
  put(root, "docs/milestones/M10/STATE.md", stateText("M10", ["- 2026-11-10T08:00Z · a"]));
  for (const n of ["2026-11-10-m10-S1.md", "2026-11-10-M10.md", "2026-11-10-M101.md", "2026-11-10-M10-S2.txt"]) put(root, `docs/agent-reports/${n}`, "x");
  assert.equal(collect({ root, ...PERIOD }).units[0].reports, 2);
});

t("collect: invalid since or until throws, since after until throws", () => {
  const root = tmp();
  assert.throws(() => collect({ root, since: "yesterday", until: "2026-11-30" }), /^Error: invalid date/);
  assert.throws(() => collect({ root, since: "2026-11-01", until: "2026-13-45T00:00Z" }), /^Error: invalid date/);
  assert.throws(() => collect({ root, since: new Date("nope"), until: "2026-11-30" }), /^Error: invalid date/);
  assert.throws(() => collect({ root, since: "2026-11-20T00:00Z", until: "2026-11-10T00:00Z" }), /^Error: since is after until/);
});

t("collect: Date objects work and the default period is the last 7 days", () => {
  const root = tmp();
  const r = collect({ root, since: new Date("2026-11-01T00:00:00Z"), until: new Date("2026-11-08T00:00:00Z") });
  assert.equal(r.period.until, "2026-11-08T00:00:00.000Z");
  const d = collect({ root });
  assert.equal(Date.parse(d.period.until) - Date.parse(d.period.since), 7 * 86400000);
});

t("collect: the result is deterministic", () => {
  const { root } = sample();
  assert.deepEqual(collect({ root, ...PERIOD }), collect({ root, ...PERIOD }));
});

t("collect: FALLBACK_TAG equals the text the delegate wrapper writes", () => {
  const rels = ["tools/delegate/run_task.py", "template/tools/delegate/run_task.py"];
  const rel = rels.find((p) => existsSync(join(REPO, p)));
  if (!rel) { console.log("note: run_task.py not found, fallback tag check skipped"); return; }
  assert.ok(read(rel).includes(`, ${FALLBACK_TAG}"`), "run_task.py must write the tag the parser counts");
});

let failed = 0;
for (const [name, fn] of queue) {
  try { await fn(); n++; console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n  ${e.message}`); }
}
for (const d of FIXTURES) rmSync(d, { recursive: true, force: true });
console.log(`${n}/${queue.length} passed`);
process.exit(failed ? 1 : 0);

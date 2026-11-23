#!/usr/bin/env node
// Tests for state-mirror.mjs and the itsaplan adapter. Run: node scripts/test-state-mirror.mjs
import assert from "node:assert/strict";
import { parseState, linearPlan, interventionProblems, mirrorItsaplan, pendingChanges, resetPending } from "./state-mirror.mjs";
import { plan, findIssue, description, MIRROR_MARK, TARGETS } from "./lib/itsaplan-mirror.mjs";
import { checklist } from "./lib/state.mjs";
import { openQuestion, explanationText, hasExplanation, answers } from "./lib/intervention.mjs";
import * as mirror from "./state-mirror.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

let n = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

const state = `Status: uat-ready since 2026-01-10T08:00:00Z · round 2
Target: dev
Batch-branch: batch/m004
Lock: free
Tracker: -
Pretest-round: 2

# M004 Member export

## Slices

| # | Slice | Status (open / in progress / done / blocked) | Commit | Files | Open points |
|---|---|---|---|---|---|
| S1 | Export button | done | abc1234 | a.js | - |
| S2 | CSV format | in progress | | b.js | - |
| S3 | Mail | blocked | | | - |
`;

t("parse fields", () => {
  const u = parseState(state);
  assert.equal(u.status, "uat-ready");
  assert.equal(u.since, "2026-01-10T08:00:00Z");
  assert.equal(u.note, "round 2");
  assert.equal(u.target, "dev");
  assert.equal(u.title, "M004 Member export");
  assert.equal(u.tracker, "");
  assert.equal(u.pretestRound, 2);
  assert.equal(u.lock, null);
  assert.equal(parseState("Status: planning since 2026-01-10T08:00Z\nLock: 2026-01-10T09:30Z run-1").lock, Date.parse("2026-01-10T09:30:00Z"));
  assert.equal(parseState("Tracker: PRJ-12 extra").tracker, "PRJ-12");
});

t("unknown status is empty", () => {
  assert.equal(parseState("Status: finished-ish").status, "");
});

t("checklist rows", () => {
  const c = checklist(state, "milestone");
  assert.equal(c.total, 3);
  assert.equal(c.done, 1);
  assert.equal(c.items[0].commit, "abc1234");
  assert.equal(c.items[2].blocked, true);
});

const unit = { id: "M004", kind: "milestone", stateText: state, ...parseState(state) };

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

t("linear: needs-input maps to Action Required", () => {
  const u = { ...unit, status: "needs-input" };
  assert.equal(linearPlan(u, null, {})[0].state, "Action Required");
});

// ----- itsaplan -----

const project = {
  columns: [{ id: "c1", name: "In Progress" }, { id: "c2", name: "Action Required" }, { id: "c3", name: "Wait for Merge" },
    { id: "c4", name: "Testing" }, { id: "c5", name: "In Review" }, { id: "c6", name: "Done" }],
  labels: [{ id: "l1", name: "Milestone" }, { id: "l2", name: "Fix pack" }, { id: "l3", name: "AP: UAT ready" },
    { id: "l4", name: "AP: Action Required" }, { id: "l5", name: "AP: Coding" }, { id: "l6", name: "AP: Pretest waiting" }, { id: "l9", name: "bug" }],
};

t("itsaplan: every status has a column and a phase label in the project", () => {
  for (const [status, tg] of Object.entries(TARGETS)) assert.ok(tg.column, status);
});

t("itsaplan: create when missing", () => {
  const p = plan(unit, null, project);
  assert.equal(p.action, "create");
  assert.equal(p.fields.columnId, "c5");
  assert.deepEqual(p.fields.labelIds, ["l1", "l3"]);
  assert.ok(p.fields.title.startsWith("[M004] M004 Member export"));
  assert.ok(p.fields.description.includes("**Status:** uat-ready"));
  assert.ok(p.fields.description.includes("- [x] S1 Export button · abc1234"));
  assert.ok(p.fields.description.includes(MIRROR_MARK));
});

t("itsaplan: ok when in sync, keeps foreign labels and text below the mark", () => {
  const first = plan(unit, null, project).fields;
  const issue = { id: "i1", identifier: "P-1", columnId: "c5", labelIds: ["l1", "l3", "l9"], description: `${first.description}\n\nHuman note` };
  assert.equal(plan(unit, issue, project).action, "ok");
});

t("itsaplan: moves column, swaps phase label, keeps the human note", () => {
  const issue = { id: "i1", columnId: "c4", labelIds: ["l1", "l6", "l9"], description: `old\n\n${MIRROR_MARK}\n\nHuman note` };
  const p = plan(unit, issue, project);
  assert.equal(p.action, "update");
  assert.equal(p.fields.columnId, "c5");
  assert.deepEqual(p.fields.labelIds, ["l1", "l3", "l9"].sort());
  assert.ok(p.fields.description.endsWith("Human note"));
});

t("itsaplan: done drops the phase label", () => {
  const p = plan({ ...unit, status: "done" }, { id: "i", columnId: "c5", labelIds: ["l1", "l3"], description: "" }, project);
  assert.equal(p.fields.columnId, "c6");
  assert.deepEqual(p.fields.labelIds, ["l1"]);
});

t("itsaplan: Action Required column accepts the alias", () => {
  const alt = { ...project, columns: project.columns.map((c) => (c.id === "c2" ? { ...c, name: "Intervention needed" } : c)) };
  const u = { ...unit, status: "needs-input" };
  assert.equal(plan(u, null, alt).fields.columnId, "c2");
});

t("itsaplan: configured column aliases", () => {
  const alt = { ...project, columns: project.columns.map((c) => (c.id === "c2" ? { ...c, name: "Needs you" } : c)) };
  const u = { ...unit, status: "needs-input" };
  assert.throws(() => plan(u, null, alt), /Missing column/);
  assert.equal(plan(u, null, alt, { aliases: { "Action Required": ["Needs you"] } }).fields.columnId, "c2");
});

t("itsaplan: missing column or label is an error", () => {
  assert.throws(() => plan(unit, null, { ...project, columns: [] }), /Missing column/);
  assert.throws(() => plan(unit, null, { ...project, labels: [] }), /Missing labels/);
});

t("itsaplan: find issue by tracker id, then by title prefix", () => {
  const issues = [{ id: "a", identifier: "P-1", title: "[M003] x" }, { id: "b", identifier: "P-2", title: "[M004] Member export" }];
  assert.equal(findIssue(unit, issues).id, "b");
  assert.equal(findIssue({ ...unit, tracker: "P-1" }, issues).id, "a");
  assert.equal(findIssue({ ...unit, id: "M009", tracker: "" }, issues), null);
});

t("description keeps text without a mark under the block", () => {
  assert.equal(description("hello", "BLOCK"), "BLOCK\n\nhello");
});

// ----- intervention -----

const asking = `Status: needs-input since 2026-02-01T10:00:00Z · board missing
Target: dev
Lock: free
Tracker: P-7

# Fix pack 2026-02-01-x

## Points

| # | Type | Title | Status | Commit |
|---|---|---|---|---|
| F1 | fix | Button | blocked | |

## Open question (when \`needs-input\`)

**Question:** Which board applies to the new dialog?

A) Board "Dialog v2": ready now, wider layout.
B) Wait for a new board: two days later.
Recommendation: A.

## Log
`;

t("open question: extracted, template placeholder ignored", () => {
  const q = openQuestion(asking);
  assert.equal(q.short, "Which board applies to the new dialog?");
  assert.ok(q.text.includes("Recommendation: A."));
  assert.equal(openQuestion("## Open question (when `needs-input`)\n\nOne question, options, recommendation.\n"), null);
  assert.equal(openQuestion("## Open question (answered)\n\ntext\n"), null);
});

t("explanation: text carries link and answer route; detection ignores old comments", () => {
  const text = explanationText({ unit: "F-x", question: openQuestion(asking), link: "https://example.com/r" });
  assert.ok(text.startsWith("**Action Required** · F-x"));
  assert.ok(text.includes('starting with "Answer F-x:"'));
  assert.ok(text.includes("https://example.com/r"));
  const old = { kind: "comment", createdAt: "2026-01-01T00:00:00Z", body: text };
  const fresh = { kind: "comment", createdAt: "2026-02-01T10:05:00Z", body: text };
  assert.equal(hasExplanation([old], "F-x", "2026-02-01T10:00:00Z"), false);
  assert.equal(hasExplanation([fresh], "F-x", "2026-02-01T10:00:00Z"), true);
  assert.equal(hasExplanation([fresh], "F-y", "2026-02-01T10:00:00Z"), false);
});

t("answers: bot comments never count, older comments neither, prefix must match", () => {
  const feed = [
    { id: "1", kind: "comment", actorUserId: "bot", createdAt: "2026-02-01T11:00:00Z", body: "Answer F-x: from the bot" },
    { id: "2", kind: "comment", actorUserId: "me", createdAt: "2026-02-01T09:00:00Z", body: "Answer F-x: too old" },
    { id: "3", kind: "comment", actorUserId: "me", createdAt: "2026-02-01T11:00:00Z", body: "I think Answer F-x: not at the start" },
    { id: "4", kind: "comment", actorUserId: "me", createdAt: "2026-02-01T12:00:00Z", body: "Answer F-x: option A" },
  ];
  assert.deepEqual(answers(feed, "F-x", "2026-02-01T10:00:00Z", "bot").map((a) => a.id), ["4"]);
  assert.deepEqual(answers(feed, "F-x", "2026-02-01T10:00:00Z", null), []);
});

t("reconcile: needs-input without a question in STATE.md is a problem (tracker none too)", () => {
  const bad = { id: "F-z", status: "needs-input", stateText: "Status: needs-input since 2026-02-01T10:00:00Z\n\n## Open question (when `needs-input`)\n\nOne question, options, recommendation.\n" };
  const good = { id: "F-x", status: "needs-input", stateText: asking };
  assert.equal(interventionProblems([bad, good]).length, 1);
  assert.ok(interventionProblems([bad])[0].startsWith("F-z"));
});

function fakeClient(feed) {
  const calls = [];
  return {
    calls,
    project: async () => project,
    issues: async () => [{ id: "i7", identifier: "P-7", title: "[F-x] Fix", columnId: "c2", labelIds: ["l2", "l4"], description: "" }],
    comments: async () => feed,
    comment: async (id, body) => { calls.push(["comment", id, body]); },
    createIssue: async (k, f) => { calls.push(["create", f]); return { id: "new", identifier: "P-99" }; },
    updateIssue: async (id, f) => { calls.push(["update", id, f]); },
  };
}

t("itsaplan mirror: check mode reports a missing explanation comment, run mode writes it once", async () => {
  const u = { id: "F-x", kind: "fixpack", ref: "origin/batch/dev", path: "docs/fixpacks/F-x/STATE.md", stateText: asking, ...parseState(asking) };
  // ticket is in sync except for the comment
  const first = plan(u, null, project, { question: openQuestion(asking).short }).fields;
  const client = fakeClient([]);
  client.issues = async () => [{ id: "i7", identifier: "P-7", title: "[F-x] Fix", columnId: first.columnId, labelIds: first.labelIds, description: first.description }];
  resetPending();
  await mirrorItsaplan([u], { projectKey: "P" }, true, client);
  assert.equal(pendingChanges(), 1, "check must fail while the explanation is missing");
  assert.equal(client.calls.length, 0);
  resetPending();
  await mirrorItsaplan([u], { projectKey: "P" }, false, client);
  assert.equal(client.calls.filter((c) => c[0] === "comment").length, 1);
  assert.ok(client.calls[0][2].includes("Answer F-x:"));
  // with the comment present nothing is pending
  const withComment = fakeClient([{ kind: "comment", createdAt: "2026-02-01T10:30:00Z", body: client.calls[0][2] }]);
  withComment.issues = client.issues;
  resetPending();
  await mirrorItsaplan([u], { projectKey: "P" }, true, withComment);
  assert.equal(pendingChanges(), 0);
});

// ----- wiki todo -----

const wikiOn = { wiki: { enabled: true } };
const wu = (status, stateText = "", kind = "milestone", id = "M001") => ({ id, kind, status, stateText });

t("wiki: parseState returns the Wiki header value, empty when missing", () => {
  assert.equal(parseState("Status: done\nWiki: no change").wiki, "no change");
  assert.equal(parseState("Status: done\nWiki:   docs/wiki/a.md  ").wiki, "docs/wiki/a.md");
  assert.equal(parseState("Status: done").wiki, "");
});

t("wiki: parseState reads only the header (lines before the first # line)", () => {
  assert.equal(parseState("Status: done\n\n# M001 x\n\n## Log\n\nWiki: noch pruefen\n").wiki, "");
  assert.equal(parseState("Status: done\n# M001 x\nWiki: no change\n").wiki, "");
  assert.equal(parseState("Status: done\nWiki: no change\n\n# M001 x\n\n## Log\n\nWiki: other\n").wiki, "no change");
});

t("wiki: batch-pr milestone without Wiki line is one problem", () => {
  assert.equal(typeof mirror.wikiProblems, "function", "wikiProblems is not exported");
  const p = mirror.wikiProblems([wu("batch-pr", "Status: batch-pr")], wikiOn);
  assert.deepEqual(p, ["M001: Wiki line missing in STATE.md (wiki is on)"]);
});

t("wiki: a Wiki line only in the Log below the title is a problem", () => {
  const text = "Status: batch-pr\n\n# M001: x\n\n## Log\n\nWiki: no change\n";
  assert.equal(mirror.wikiProblems([wu("batch-pr", text)], wikiOn).length, 1);
});

t("wiki: done milestone without Wiki line is no problem (old milestones)", () => {
  assert.equal(mirror.wikiProblems([wu("done")], wikiOn).length, 0);
  assert.equal(mirror.wikiProblems([wu("done", "Status: done\n\n# M001: x\n")], wikiOn).length, 0);
});

t("wiki: a filled Wiki line is accepted", () => {
  assert.equal(mirror.wikiProblems([wu("batch-pr", "Wiki: no change")], wikiOn).length, 0);
  assert.equal(mirror.wikiProblems([wu("uat-ready", "Wiki: docs/wiki/spieler-und-tester/start.md")], wikiOn).length, 0);
});

t("wiki: empty, dash or template placeholder is a problem", () => {
  assert.equal(mirror.wikiProblems([wu("batch-pr", "Wiki: -")], wikiOn).length, 1);
  assert.equal(mirror.wikiProblems([wu("batch-pr", "Wiki: <pages affected>")], wikiOn).length, 1);
  assert.equal(mirror.wikiProblems([wu("batch-pr", "Wiki:")], wikiOn).length, 1);
});

t("wiki: only milestones in the wiki statuses are checked", () => {
  assert.equal(mirror.wikiProblems([wu("slice")], wikiOn).length, 0);
  assert.equal(mirror.wikiProblems([wu("planning")], wikiOn).length, 0);
  assert.equal(mirror.wikiProblems([wu("done", "", "fixpack", "F-x")], wikiOn).length, 0);
  for (const s of ["batch-pr", "awaiting-merge", "pretest-waiting", "pretest-running", "uat-ready", "release-ready"]) {
    assert.equal(mirror.wikiProblems([wu(s)], wikiOn).length, 1, s);
  }
});

t("wiki: with onlyId every milestone status except done needs the Wiki line", () => {
  for (const s of ["validation", "slice", "planning", "rework", "batch-pr", "uat-ready"]) {
    assert.deepEqual(mirror.wikiProblems([wu(s)], wikiOn, "M001"), ["M001: Wiki line missing in STATE.md (wiki is on)"], s);
    assert.equal(mirror.wikiProblems([wu(s, "Wiki: no change")], wikiOn, "M001").length, 0, s);
  }
  assert.equal(mirror.wikiProblems([wu("done")], wikiOn, "M001").length, 0, "done is exempt");
  assert.equal(mirror.wikiProblems([wu("slice")], wikiOn).length, 0, "without onlyId only the closing statuses are checked");
});

t("wiki: onlyId restricts the check to one unit", () => {
  const units = [wu("batch-pr", "Wiki: no change", "milestone", "M001"), wu("batch-pr", "Status: batch-pr", "milestone", "M002")];
  assert.deepEqual(mirror.wikiProblems(units, wikiOn, "M001"), []);
  assert.deepEqual(mirror.wikiProblems(units, wikiOn, "M002"), ["M002: Wiki line missing in STATE.md (wiki is on)"]);
  assert.equal(mirror.wikiProblems(units, wikiOn).length, 1, "without onlyId every matching unit is checked");
});

t("wiki: off (enabled false or no wiki key) means no problems", () => {
  const units = [wu("batch-pr"), wu("done")];
  assert.deepEqual(mirror.wikiProblems(units, { wiki: { enabled: false } }), []);
  assert.deepEqual(mirror.wikiProblems(units, {}), []);
});

t("wiki: CLI without --unit only warns on a missing Wiki line; --unit M001 makes it a problem", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-todo-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const env = { ...process.env };
    delete env.ITSAPLAN_URL;
    delete env.ITSAPLAN_API_KEY;
    delete env.LINEAR_API_KEY;
    const cfg = (wiki) => writeFileSync(join(dir, ".foreman.json"), JSON.stringify({ modules: [], wiki }));
    const statePath = join(dir, "docs/milestones/M001/STATE.md");
    mkdirSync(join(dir, "docs/milestones/M001"), { recursive: true });
    const head = "Status: batch-pr · since 2026-01-01T00:00Z\nTarget: dev\n";
    const run = (args) => spawnSync(process.execPath, [join(HERE, "state-mirror.mjs"), ...args], { cwd: dir, encoding: "utf8", env });
    const lines = (r) => r.stdout.split("\n");
    const WARN = "WARN|M001: Wiki line missing in STATE.md (wiki is on)";
    const hasWarn = (r) => lines(r).includes(WARN);
    const hasProblem = (r) => lines(r).some((l) => l.startsWith("PROBLEM|M001:") && l.includes("Wiki"));

    cfg({ enabled: true, language: "de", audiences: [{ name: "Tester" }], rootPageId: "x" });
    writeFileSync(statePath, `${head}\n# M001: x\n`);
    // no --unit: missing line is a WARN, exit code unchanged
    let r = run(["--local"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(hasWarn(r), r.stdout);
    assert.ok(!hasProblem(r), r.stdout);
    r = run(["--check", "--local"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(hasWarn(r), r.stdout);
    // --unit M001: the same missing line is a PROBLEM and exits 1
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(hasProblem(r), r.stdout);
    r = run(["--check", "--local", "--unit", "M001"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(hasProblem(r), r.stdout);
    r = run(["--local", "--dry-run", "--unit", "M001"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(hasProblem(r), r.stdout);

    writeFileSync(statePath, `${head}Wiki: no change\n\n# M001: x\n`);
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r) && !hasProblem(r), r.stdout);
    r = run(["--local"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r), r.stdout);

    // a Wiki line only in the Log below the title does not count as the header line
    writeFileSync(statePath, `${head}\n# M001: x\n\n## Log\n\nWiki: no change\n`);
    r = run(["--local"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(hasWarn(r), r.stdout);
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(hasProblem(r), r.stdout);

    // other units are not examined for wiki: an old batch-pr milestone without a Wiki line does not block --unit M001
    writeFileSync(statePath, `${head}Wiki: no change\n\n# M001: x\n`);
    mkdirSync(join(dir, "docs/milestones/M002"), { recursive: true });
    writeFileSync(join(dir, "docs/milestones/M002/STATE.md"), `${head}\n# M002: old\n`);
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasProblem(r), r.stdout);
    r = run(["--local", "--unit", "M002"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(lines(r).some((l) => l.startsWith("PROBLEM|M002:") && l.includes("Wiki")), r.stdout);
    rmSync(join(dir, "docs/milestones/M002"), { recursive: true, force: true });

    // unknown unit id: exit 2 with a message naming it
    r = run(["--local", "--unit", "M999"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok((r.stdout + r.stderr).includes("M999"), r.stdout + r.stderr);

    // an old done milestone without a Wiki line is no problem, not even with --unit
    writeFileSync(statePath, "Status: done · since 2026-01-01T00:00Z\nTarget: dev\n\n# M001: x\n");
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r), r.stdout);

    // with --unit the Wiki line is required in every status except done; without --unit only the closing statuses warn
    cfg({ enabled: true, language: "de", audiences: [{ name: "Tester" }], rootPageId: "x" });
    for (const s of ["validation", "slice", "planning", "rework"]) {
      const at = `Status: ${s} · since 2026-01-01T00:00Z\nTarget: dev\n`;
      writeFileSync(statePath, `${at}\n# M001: x\n`);
      r = run(["--local"]);
      assert.equal(r.status, 0, `${s}: ${r.stdout + r.stderr}`);
      assert.ok(!hasWarn(r), `${s}: ${r.stdout}`);
      r = run(["--local", "--unit", "M001"]);
      assert.equal(r.status, 1, `${s}: ${r.stdout + r.stderr}`);
      assert.ok(hasProblem(r), `${s}: ${r.stdout}`);
      writeFileSync(statePath, `${at}Wiki: no change\n\n# M001: x\n`);
      r = run(["--local", "--unit", "M001"]);
      assert.equal(r.status, 0, `${s}: ${r.stdout + r.stderr}`);
      assert.ok(!hasWarn(r) && !hasProblem(r), `${s}: ${r.stdout}`);
    }

    // equals form works like --unit M001; --unit without a value is exit 2
    writeFileSync(statePath, `${head}\n# M001: x\n`);
    r = run(["--local", "--unit=M001"]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(hasProblem(r), r.stdout);
    writeFileSync(statePath, `${head}Wiki: no change\n\n# M001: x\n`);
    r = run(["--local", "--unit=M001"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r) && !hasProblem(r), r.stdout);
    r = run(["--local", "--unit"]);
    assert.equal(r.status, 2, r.stdout + r.stderr);

    // wiki off: exit 0 and no WARN, also with --unit
    cfg({ enabled: false });
    writeFileSync(statePath, `${head}\n# M001: x\n`);
    r = run(["--local"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r), r.stdout);
    r = run(["--local", "--unit", "M001"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!hasWarn(r) && !hasProblem(r), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("tracker-sync beat: tracker none beats ok, a configured tracker without credentials beats error, no status dir set means no file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-beat-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "docs/milestones/M001"), { recursive: true });
    writeFileSync(join(dir, "docs/milestones/M001/STATE.md"), "Status: slice · since 2026-01-01T00:00Z\nTarget: dev\n\n# M001: x\n");
    const status = join(dir, "status");
    const base = { ...process.env };
    for (const k of ["ITSAPLAN_URL", "ITSAPLAN_API_KEY", "LINEAR_API_KEY", "FOREMAN_STATUS_DIR"]) delete base[k];
    const run = (env) => spawnSync(process.execPath, [join(HERE, "state-mirror.mjs"), "--local"], { cwd: dir, encoding: "utf8", env: { ...base, ...env } });
    const beat = () => { assert.ok(existsSync(join(status, "tracker-sync.json")), "tracker-sync beat file missing"); return JSON.parse(readFileSync(join(status, "tracker-sync.json"), "utf8")); };
    writeFileSync(join(dir, ".foreman.json"), JSON.stringify({ modules: [] }));
    assert.equal(run({}).status, 0);
    assert.ok(!existsSync(status), "no FOREMAN_STATUS_DIR: nothing written");
    assert.equal(run({ FOREMAN_STATUS_DIR: status }).status, 0);
    assert.equal(beat().result, "ok");
    writeFileSync(join(dir, ".foreman.json"), JSON.stringify({ modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "P" } } }));
    const r = run({ FOREMAN_STATUS_DIR: status });
    assert.equal(r.status, 0, "exit code of the skip stays as before");
    assert.equal(beat().result, "error");
    assert.match(beat().note, /ITSAPLAN_URL/);
    assert.ok(r.stdout.includes("SKIP|itsaplan"), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [name, fn] of queue) {
  await fn();
  n++;
  console.log(`ok ${name}`);
}
console.log(`${n} tests passed`);

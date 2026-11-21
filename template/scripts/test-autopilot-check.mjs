#!/usr/bin/env node
// Tests for the dispatcher check. Run: node scripts/test-autopilot-check.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tasks, formatOutput, verdictFromFile, settingsFrom, pretestRound, isLocked } from "./lib/autopilot-check.mjs";
import { parseState } from "./lib/state.mjs";
import { uatTitle, uatTitleSince, trackerApproval, fileApproval, fileAnswer, checklistPoints, uatFileText } from "./lib/uat.mjs";
import { collectUnits } from "./lib/units.mjs";
import { gatherSignals, trackerKind } from "./lib/trackers.mjs";
import { gitRun } from "./lib/git.mjs";
import { findVerdicts, findCatchUp, main } from "./autopilot-check.mjs";

const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const NOW = new Date("2026-03-06T08:10:00Z"); // Friday 08:10 UTC
const S = settingsFrom({}, {});

const unit = (id, status, extra = {}) => {
  const since = extra.since ?? "2026-03-06T01:00:00Z";
  const text = `Status: ${status} since ${since}${extra.note ? ` · ${extra.note}` : ""}\nTarget: ${extra.target ?? "dev"}\nLock: ${extra.lockLine ?? "free"}\nTracker: ${extra.tracker ?? "-"}\nPretest-round: ${extra.round ?? 0}\n`;
  return { id, kind: extra.kind ?? "fixpack", ref: extra.ref ?? "origin/batch/dev", path: `docs/fixpacks/${id}/STATE.md`, stateText: text, ...parseState(text) };
};
const kinds = (list) => list.map((x) => `${x.kind}:${x.unit}`);

t("settings: defaults, .foreman.json and env override", () => {
  assert.equal(S.tz, "UTC");
  assert.deepEqual(S.batchHours, [3, 7, 11, 15, 19, 23]);
  assert.equal(S.maxTasks, 3);
  const c = settingsFrom({ FOREMAN_TZ: "Europe/Berlin" }, { autopilot: { timezone: "Asia/Tokyo", batchHours: [2, 14], releaseWeekday: 4 } });
  assert.equal(c.tz, "Europe/Berlin");
  assert.deepEqual(c.batchHours, [2, 14]);
  assert.equal(c.releaseWeekday, 4);
});

t("coding: oldest first, at most 3, locked units skipped", () => {
  const units = [
    unit("A", "slice", { since: "2026-03-05T10:00:00Z" }),
    unit("B", "planning", { since: "2026-03-05T09:00:00Z" }),
    unit("C", "rework", { since: "2026-03-05T11:00:00Z" }),
    unit("D", "validation", { since: "2026-03-05T08:00:00Z", lockLine: "2026-03-06T07:00:00Z run-1" }),
    unit("E", "fixpack", { since: "2026-03-05T12:00:00Z" }),
  ];
  assert.deepEqual(kinds(tasks({ units, now: NOW, settings: S })), ["coding:B", "coding:A", "coding:C"]);
  assert.equal(isLocked(units[3], NOW, S.lockMs), true);
});

t("an old lock does not block", () => {
  const u = unit("A", "slice", { lockLine: "2026-03-05T01:00:00Z run-1" });
  assert.equal(tasks({ units: [u], now: NOW, settings: S }).length, 1);
});

t("pretest: run without verdict, result with verdict, stale running restarts, fresh running waits", () => {
  const waiting = unit("W", "pretest-waiting", { round: 2 });
  const done = unit("R", "pretest-waiting", { round: 1 });
  const stale = unit("S", "pretest-running", { lockLine: "2026-03-05T01:00:00Z x" });
  const busy = unit("B", "pretest-running", { lockLine: "2026-03-06T07:30:00Z x" });
  const nolock = unit("N", "pretest-running");
  const list = tasks({
    units: [waiting, done, stale, busy, nolock], now: NOW, settings: { ...S, maxTasks: 9 },
    verdicts: { W: { round: 2, verdict: null }, R: { round: 1, verdict: "uat-ready" }, S: { round: 1, verdict: null } },
  });
  assert.deepEqual(kinds(list), ["pretest-result:R", "pretest-run:W", "pretest-run:S"]);
  assert.ok(list[1].prompt.includes("round 2 against dev"));
  assert.ok(list[0].prompt.includes("docs/pretest/R-round-1.md (Verdict: uat-ready)"));
  assert.ok(tasks({ units: [unit("M", "pretest-waiting", { target: "main", ref: "origin/batch/main" })], now: NOW, settings: S })[0].prompt.includes("against staging"));
});

t("verdict lines: three values, legacy needs-input, last line wins", () => {
  assert.equal(verdictFromFile("x\nVerdict: fix-round\n"), "fix-round");
  assert.equal(verdictFromFile("Verdict: UAT ready"), "uat-ready");
  assert.equal(verdictFromFile("Verdict: needs-input"), "intervention");
  assert.equal(verdictFromFile("Verdict: intervention\n"), "intervention");
  assert.equal(verdictFromFile("Verdict: fix-round\nlater text\nVerdict: uat-ready"), "uat-ready");
  assert.equal(verdictFromFile("Verdict: maybe"), null);
  assert.equal(verdictFromFile(null), null);
});

t("pretest round: header, note, existing files", () => {
  assert.equal(pretestRound({ pretestRound: 3, note: "" }, [1]), 3);
  assert.equal(pretestRound({ pretestRound: 0, note: "round 4" }, []), 4);
  assert.equal(pretestRound({ pretestRound: 0, note: "fix round 1" }, [2]), 2);
  assert.equal(pretestRound({ pretestRound: 0, note: "" }, []), 1);
});

t("input received only with an answer; the order carries it", () => {
  const u = unit("Q", "needs-input");
  assert.equal(tasks({ units: [u], now: NOW, settings: S }).length, 0);
  const list = tasks({ units: [u], now: NOW, settings: S, signals: { answers: { Q: [{ createdAt: "2026-03-06T02:00:00Z", body: "Answer Q: option A" }] } } });
  assert.deepEqual(kinds(list), ["input-received:Q"]);
  assert.ok(list[0].prompt.endsWith("Answer Q: option A"));
});

t("uat approval", () => {
  const u = unit("U", "uat-ready");
  assert.equal(tasks({ units: [u], now: NOW, settings: S }).length, 0);
  const list = tasks({ units: [u], now: NOW, settings: S, signals: { approvals: { U: { source: "comment", info: "comment of x" } } } });
  assert.deepEqual(kinds(list), ["uat-approved:U"]);
  assert.ok(list[0].prompt.includes("Payload: UAT U approved"));
});

t("batch: window, overdue, open PR, catch-up, main busy", () => {
  const w = (id, since, target = "dev") => unit(id, "awaiting-merge", { since, target, ref: `origin/batch/${target}` });
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const one = [w("A", "2026-03-06T07:00:00Z")];
  assert.equal(tasks({ units: one, now: at("08"), settings: S }).length, 0, "no window, not overdue");
  assert.deepEqual(kinds(tasks({ units: one, now: at("07"), settings: S })), ["batch:batch:dev"], "window hour 7");
  assert.deepEqual(kinds(tasks({ units: [w("A", "2026-03-06T02:00:00Z")], now: at("08"), settings: S })), ["batch:batch:dev"], "overdue");
  assert.ok(tasks({ units: [], now: at("08"), settings: S, openPrs: { dev: 12 } })[0].info.includes("#12"));
  assert.ok(tasks({ units: one, now: at("08"), settings: S, catchUp: { dev: ["A"] } })[0].info.includes("catch-up"));
  const busy = [w("M1", "2026-03-06T02:00:00Z", "main"), unit("M2", "slice", { target: "main", lockLine: "2026-03-06T07:50:00Z r" })];
  assert.equal(tasks({ units: busy, now: at("08"), settings: S }).filter((x) => x.kind === "batch").length, 0, "main with a fresh lock waits");
  const lockedDev = [w("A", "2026-03-06T02:00:00Z"), unit("B", "awaiting-merge", { lockLine: "2026-03-06T07:50:00Z r" })];
  assert.equal(tasks({ units: lockedDev, now: at("08"), settings: S }).filter((x) => x.kind === "batch").length, 0, "dev with a locked waiting pack waits");
  const list = tasks({ units: one, now: at("07"), settings: S });
  assert.ok(list[0].prompt.includes("Batch branch: batch/dev") && list[0].prompt.includes("Units: A"));
});

t("settings: mainAutoMerge is true only for the boolean true", () => {
  assert.equal(S.mainAutoMerge, false);
  assert.equal(settingsFrom({}, { autopilot: { mainAutoMerge: true } }).mainAutoMerge, true);
  for (const v of [null, "true", "yes", 1, 0, "false", false, {}, []]) {
    assert.equal(settingsFrom({}, { autopilot: { mainAutoMerge: v } }).mainAutoMerge, false, `value ${JSON.stringify(v)}`);
  }
});

t("batch main: window and overdue start it only with mainAutoMerge true", () => {
  const m = () => unit("M", "awaiting-merge", { target: "main", ref: "origin/batch/main", since: "2026-03-06T02:00:00Z" });
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const on = settingsFrom({}, { autopilot: { mainAutoMerge: true } });
  const strOn = settingsFrom({}, { autopilot: { mainAutoMerge: "true" } });
  const mainBatch = (list) => kinds(list).filter((k) => k.startsWith("batch:batch:main"));
  assert.deepEqual(mainBatch(tasks({ units: [m()], now: at("07"), settings: S })), [], "default: no main batch in window");
  assert.deepEqual(mainBatch(tasks({ units: [m()], now: at("08"), settings: S })), [], "default: no main batch when overdue");
  assert.deepEqual(kinds(tasks({ units: [m()], now: at("07"), settings: on })), ["batch:batch:main"], "window");
  assert.deepEqual(kinds(tasks({ units: [m()], now: at("08"), settings: on })), ["batch:batch:main"], "overdue");
  assert.deepEqual(mainBatch(tasks({ units: [m()], now: at("07"), settings: strOn })), [], "string true is not enabled");
  assert.deepEqual(mainBatch(tasks({ units: [m()], now: at("08"), settings: strOn })), [], "string true overdue is not enabled");
});

t("batch main: open PR starts it only with mainAutoMerge true", () => {
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const on = settingsFrom({}, { autopilot: { mainAutoMerge: true } });
  const off = tasks({ units: [], now: at("08"), settings: S, openPrs: { main: 5 } });
  assert.equal(off.filter((x) => x.kind === "batch" && x.unit === "batch:main").length, 0, "no main batch without mainAutoMerge");
  const list = tasks({ units: [], now: at("08"), settings: on, openPrs: { main: 5 } });
  const mainTask = list.find((x) => x.kind === "batch" && x.unit === "batch:main");
  assert.ok(mainTask, "main batch with mainAutoMerge");
  assert.ok(mainTask.info.includes("#5"), mainTask.info);
});

t("batch main: catch-up still starts it without mainAutoMerge", () => {
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const m = unit("M", "awaiting-merge", { target: "main", ref: "origin/batch/main", since: "2026-03-06T02:00:00Z" });
  const list = tasks({ units: [m], now: at("08"), settings: S, catchUp: { main: ["M"] } });
  const mainTask = list.find((x) => x.kind === "batch" && x.unit === "batch:main");
  assert.ok(mainTask, "main catch-up batch without mainAutoMerge");
  assert.ok(mainTask.info.includes("catch-up"), mainTask.info);
});

t("batch main: held without mainAutoMerge, catch-up task carries only the catch-up units", () => {
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const w = unit("W", "awaiting-merge", { target: "main", ref: "origin/batch/main", since: "2026-03-06T02:00:00Z" });
  const list = tasks({ units: [w], now: at("08"), settings: S, catchUp: { main: ["C"] }, openPrs: { main: 5 } });
  const mainTasks = list.filter((x) => x.kind === "batch" && x.unit === "batch:main");
  assert.equal(mainTasks.length, 1, "exactly one main batch task");
  assert.ok(mainTasks[0].info.includes("catch-up"), mainTasks[0].info);
  assert.ok(!mainTasks[0].info.includes("#5"), mainTasks[0].info);
  assert.ok(mainTasks[0].prompt.includes("Units: C"), mainTasks[0].prompt);
  assert.ok(!mainTasks[0].prompt.includes("W"), mainTasks[0].prompt);
});

t("batch dev: unaffected by mainAutoMerge", () => {
  const at = (h) => new Date(`2026-03-06T${h}:10:00Z`);
  const on = settingsFrom({}, { autopilot: { mainAutoMerge: true } });
  const devUnits = () => [unit("A", "awaiting-merge", { target: "dev", ref: "origin/batch/dev", since: "2026-03-06T07:00:00Z" })];
  assert.deepEqual(kinds(tasks({ units: devUnits(), now: at("07"), settings: S })), ["batch:batch:dev"], "dev in window, default");
  assert.deepEqual(kinds(tasks({ units: devUnits(), now: at("07"), settings: on })), ["batch:batch:dev"], "dev in window, mainAutoMerge");
});

t("release reminder: weekday and hour in the zone, once per day", () => {
  const ready = [unit("R1", "release-ready", { target: "main" }), unit("R2", "release-ready", { target: "main" })];
  const fri9 = new Date("2026-03-06T09:05:00Z");
  assert.deepEqual(kinds(tasks({ units: ready, now: fri9, settings: S })), ["release-reminder:-"]);
  assert.equal(tasks({ units: ready, now: fri9, settings: S, signals: { releaseCommentToday: true } }).length, 0);
  assert.equal(tasks({ units: ready, now: new Date("2026-03-06T10:05:00Z"), settings: S }).length, 0);
  const berlin = { ...S, tz: "Europe/Berlin" };
  assert.equal(tasks({ units: ready, now: new Date("2026-03-06T08:05:00Z"), settings: berlin }).length, 1, "09:05 in Berlin (UTC+1)");
  assert.equal(tasks({ units: ready, now: new Date("2026-03-06T09:05:00Z"), settings: berlin }).length, 0);
});

t("priority: results before runs before answers before approvals before batch before coding", () => {
  const units = [
    unit("c", "slice"), unit("u", "uat-ready"), unit("q", "needs-input"), unit("p", "pretest-waiting"), unit("r", "pretest-waiting"),
  ];
  const list = tasks({
    units, now: NOW, settings: { ...S, maxTasks: 9 },
    verdicts: { r: { round: 1, verdict: "fix-round" }, p: { round: 1, verdict: null } },
    signals: { answers: { q: [{ createdAt: "2026-03-06T02:00:00Z", body: "Answer q: x" }] }, approvals: { u: { info: "i" } } },
  });
  assert.deepEqual(kinds(list), ["pretest-result:r", "pretest-run:p", "input-received:q", "uat-approved:u", "coding:c"]);
});

t("output contract", () => {
  assert.equal(formatOutput([]), "NOTHING|Nothing to do.");
  const list = tasks({ units: [unit("A", "slice", { note: "has | pipe" })], now: NOW, settings: S });
  const out = formatOutput(list).split("\n");
  assert.ok(out[0].startsWith("TASK|coding|A|slice since 2026-03-06T01:00:00Z"));
  assert.equal(out[1], "");
  assert.equal(out[2], "=== PROMPT 1 coding A ===");
  assert.ok(out[3].startsWith("Foreman task: coding | unit: A"));
  assert.equal(out.at(-1), "=== END 1 ===");
  assert.equal(out.filter((l) => l.startsWith("TASK|")).length, 1);
});

t("files tracker: UAT approval", () => {
  const since = "2026-03-06T01:00:00Z";
  const after = Date.parse("2026-03-06T05:00:00Z"), before = Date.parse("2026-03-06T00:30:00Z");
  const fresh = uatFileText({ unit: "U", since, points: ["a", "b"] });
  assert.equal(fileApproval({ text: fresh, modified: after, unit: "U", since }), null, "created list is not an approval");
  assert.ok(fileApproval({ text: fresh.replace(/\[ \]/g, "[x]"), modified: after, unit: "U", since }));
  assert.equal(fileApproval({ text: fresh.replace(/\[ \]/g, "[x]"), modified: before, unit: "U", since }), null, "older than the round");
  assert.ok(fileApproval({ text: `${fresh}\nUAT U approved\n`, modified: after, unit: "U", since }));
  assert.equal(fileApproval({ text: `${fresh}\nUAT V approved\n`, modified: after, unit: "U", since }), null);
  const oldRound = fresh.replace(since, "2026-03-01T00:00:00Z").replace(/\[ \]/g, "[x]");
  assert.equal(fileApproval({ text: oldRound, modified: after, unit: "U", since }), null, "list of an older round");
  assert.equal(fileApproval({ text: fresh.replace("[ ] a", "[x] a"), modified: after, unit: "U", since }), null, "partly ticked");
});

t("files tracker: answers", () => {
  const since = "2026-03-06T01:00:00Z";
  const text = "intro\nAnswer Q: option B\nbecause of cost\n\nAnswer Q: option A\nand more\nsecond line\n";
  const a = fileAnswer({ text, modified: Date.parse("2026-03-06T03:00:00Z"), unit: "Q", since });
  assert.equal(a.body, "Answer Q: option A\nand more\nsecond line");
  assert.equal(fileAnswer({ text, modified: Date.parse("2026-03-05T03:00:00Z"), unit: "Q", since }), null);
  assert.equal(fileAnswer({ text: "Answer Z: x", modified: Date.parse("2026-03-06T03:00:00Z"), unit: "Q", since }), null);
});

t("tracker approval: comment or fully ticked list of this round, never the bot", () => {
  const since = "2026-03-06T01:00:00Z";
  assert.equal(uatTitle(since), `UAT · since ${since}`);
  assert.equal(uatTitleSince(uatTitle(since)), Date.parse(since));
  assert.equal(uatTitle("garbage"), null);
  const lists = [{ title: uatTitle(since), items: [{ done: true }, { done: true }] }];
  assert.ok(trackerApproval({ checklists: lists, unit: "U", since, botUserId: "bot" }));
  assert.equal(trackerApproval({ checklists: [{ title: uatTitle(since), items: [{ done: true }, { done: false }] }], unit: "U", since }), null);
  assert.equal(trackerApproval({ checklists: [{ title: uatTitle("2026-03-01T00:00:00Z"), items: [{ done: true }] }], unit: "U", since }), null);
  assert.equal(trackerApproval({ checklists: [{ title: "Notes", items: [{ done: true }] }], unit: "U", since }), null);
  const mine = { kind: "comment", actorUserId: "me", createdAt: "2026-03-06T03:00:00Z", body: "UAT U approved" };
  assert.ok(trackerApproval({ comments: [mine], unit: "U", since, botUserId: "bot" }));
  assert.equal(trackerApproval({ comments: [{ ...mine, actorUserId: "bot" }], unit: "U", since, botUserId: "bot" }), null);
  assert.equal(trackerApproval({ comments: [{ ...mine, createdAt: "2026-03-05T03:00:00Z" }], unit: "U", since, botUserId: "bot" }), null);
  assert.equal(trackerApproval({ comments: [mine], unit: "U", since: "", botUserId: "bot" }), null);
});

t("checklist points from a pretest document", () => {
  const doc = "# R\n- [ ] not uat\n\n## UAT checklist\n- [ ] Second account sees the mail\n- [x] Hardware button\n\n## Next\n- [ ] other\n";
  assert.deepEqual(checklistPoints(doc), ["Second account sees the mail", "Hardware button"]);
});

t("tracker kind from modules", () => {
  assert.equal(trackerKind({ modules: ["delegate", "tracker-itsaplan"] }), "itsaplan");
  assert.equal(trackerKind({ modules: ["tracker-linear"] }), "linear");
  assert.equal(trackerKind({ modules: [] }), "none");
  assert.equal(trackerKind({}), "none");
});

t("itsaplan signals with a fake client: answer, approval, release comment", async () => {
  const u1 = unit("Q", "needs-input", { tracker: "P-1", since: "2026-03-06T01:00:00Z" });
  const u2 = unit("U", "uat-ready", { tracker: "P-2", since: "2026-03-06T01:00:00Z" });
  const u3 = unit("R", "release-ready", { tracker: "P-3", target: "main" });
  const feeds = {
    i1: [{ kind: "comment", actorUserId: "me", createdAt: "2026-03-06T02:00:00Z", body: "Answer Q: A" }, { kind: "comment", actorUserId: "bot", createdAt: "2026-03-06T02:30:00Z", body: "Answer Q: bot" }],
    i2: [{ kind: "comment", actorUserId: "me", createdAt: "2026-03-06T03:00:00Z", body: "UAT U approved" }],
    i3: [{ kind: "comment", actorUserId: "bot", createdAt: "2026-03-06T00:30:00Z", body: "Release day: 1 fix ready" }],
  };
  const client = {
    issues: async () => [{ id: "i1", identifier: "P-1" }, { id: "i2", identifier: "P-2" }, { id: "i3", identifier: "P-3" }],
    me: async () => "bot",
    comments: async (id) => feeds[id],
    checklists: async () => [],
  };
  const sig = await gatherSignals({ conf: { modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "P" } } }, units: [u1, u2, u3], now: NOW, tz: "UTC", client, stderr: () => {}, wantRelease: true });
  assert.deepEqual(sig.answers.Q.map((a) => a.body), ["Answer Q: A"]);
  assert.equal(sig.approvals.U.source, "comment");
  assert.equal(sig.releaseCommentToday, true);
});

t("itsaplan signals: failing tracker does not stop the check", async () => {
  const u1 = unit("Q", "needs-input", { tracker: "P-1" });
  const errs = [];
  const client = { issues: async () => { throw new Error("down"); }, me: async () => "bot" };
  const sig = await gatherSignals({ conf: { modules: ["tracker-itsaplan"], mirror: { itsaplan: { projectKey: "P" } } }, units: [u1], now: NOW, tz: "UTC", client, stderr: (m) => errs.push(m), wantRelease: false });
  assert.deepEqual(sig.answers, {});
  assert.ok(errs[0].includes("down"));
});

// ----- integration with a real git repository -----

function sh(cwd, ...args) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
function write(cwd, rel, text) { mkdirSync(join(cwd, rel, ".."), { recursive: true }); writeFileSync(join(cwd, rel), text); }
const header = (status, since, extra = "") => `Status: ${status} since ${since}\nTarget: dev\nBatch-branch: batch/dev\nLock: free\nTracker: -\nPretest-round: 1\n${extra}\n# Pack\n`;

t("integration: units from remote branches, verdicts, catch-up, full check output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-check-"));
  const git = (args) => gitRun(args, join(dir, "work"));
  try {
    const origin = join(dir, "origin");
    mkdirSync(origin);
    sh(origin, "init", "-q", "-b", "dev");
    sh(origin, "config", "user.email", "t@example.com"); sh(origin, "config", "user.name", "t");
    write(origin, "README.md", "x");
    sh(origin, "add", "."); sh(origin, "commit", "-qm", "init");
    sh(origin, "branch", "main");
    sh(origin, "checkout", "-q", "-b", "batch/dev");
    write(origin, "docs/fixpacks/p-one/STATE.md", header("pretest-waiting", "2026-03-06T01:00:00Z"));
    write(origin, "docs/pretest/p-one-round-1.md", "# result\n\nVerdict: uat-ready\n");
    write(origin, "docs/fixpacks/p-two/STATE.md", header("slice", "2026-03-06T02:00:00Z"));
    write(origin, "docs/fixpacks/p-three/STATE.md", header("awaiting-merge", "2026-03-05T02:00:00Z"));
    write(origin, "docs/fixpacks/p-main-copy/STATE.md", header("slice", "2026-03-06T03:00:00Z").replace("Target: dev", "Target: main"));
    sh(origin, "add", "."); sh(origin, "commit", "-qm", "units");
    sh(origin, "checkout", "-q", "-b", "batch/m004", "dev");
    mkdirSync(join(origin, "docs/milestones/M004"), { recursive: true });
    write(origin, "docs/milestones/M004/STATE.md", header("planning", "2026-03-05T20:00:00Z").replace("Batch-branch: batch/dev", "Batch-branch: batch/m004"));
    sh(origin, "add", "."); sh(origin, "commit", "-qm", "milestone");
    sh(origin, "checkout", "-q", "dev");
    sh(dir, "clone", "-q", origin, "work");
    const units = collectUnits(git);
    const ids = units.map((u) => u.id).sort();
    assert.deepEqual(ids, ["M004", "p-one", "p-three", "p-two"], "a copy with the other target is not a unit of batch/dev");
    assert.equal(units.find((u) => u.id === "M004").kind, "milestone");
    const verdicts = await findVerdicts(units, git);
    assert.deepEqual(verdicts["p-one"], { round: 1, verdict: "uat-ready" });
    assert.deepEqual(findCatchUp(units, git, NOW), { dev: [], main: [] });
    // merge batch/dev into dev: p-three is already in the target, the catch-up reports it
    sh(origin, "merge", "-q", "--no-edit", "batch/dev");
    sh(join(dir, "work"), "fetch", "-q", "origin");
    const late = findCatchUp(collectUnits(git), git, NOW);
    assert.ok(late.dev.includes("p-three"), JSON.stringify(late));
    // whole check through main(): output lists the pretest result first
    const lines = [];
    const orig = console.log;
    console.log = (m) => lines.push(m);
    const cwd = process.cwd();
    process.chdir(join(dir, "work"));
    try {
      await main(["--no-fetch", "--now", "2026-03-06T08:10:00Z"], { git, openPrs: { dev: null, main: null }, stderr: () => {} });
    } finally { process.chdir(cwd); console.log = orig; }
    const out = lines.join("\n");
    assert.ok(out.startsWith("TASK|pretest-result|p-one|round 1: uat-ready"), out);
    assert.ok(out.includes("=== PROMPT 1 pretest-result p-one ==="));
    assert.ok(out.split("\n").filter((l) => l.startsWith("TASK|")).length <= 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

let n = 0;
for (const [name, fn] of queue) {
  await fn();
  n++;
  console.log(`ok ${name}`);
}
console.log(`${n} tests passed`);

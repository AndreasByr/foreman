// Candidates and order texts of the dispatcher check. Pure functions; I/O lives in scripts/autopilot-check.mjs.
//
// Output contract (stdout):
//   TASK|<kind>|<unit>|<info>             one line per task, priority order, at most `maxTasks`
//   (empty line)
//   === PROMPT <n> <kind> <unit> ===
//   <complete order text for the work run>
//   === END <n> ===
// No task: the single line `NOTHING|Nothing to do.`
import { CODING_STATUSES, stamp } from "./state.mjs";
import { localParts } from "./time.mjs";

export const KINDS = ["pretest-result", "pretest-run", "input-received", "uat-approved", "batch", "release-reminder", "coding"];

export function settingsFrom(env = {}, conf = {}) {
  const a = conf.autopilot ?? {};
  const ctx = conf.context ?? {};
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const ctxDay = dayNames.indexOf(String(ctx.releaseDay ?? "").toLowerCase()) + 1 || null;
  const waitHours = typeof a.waitHours === "number" && Number.isFinite(a.waitHours) && a.waitHours > 0 && a.waitHours <= 168 ? a.waitHours : 4;
  const hours = (env.FOREMAN_BATCH_HOURS ?? (Array.isArray(a.batchHours) ? a.batchHours.join(" ") : null) ?? "03 07 11 15 19 23")
    .split(/[\s,]+/).filter(Boolean).map(Number);
  return {
    tz: [env.FOREMAN_TZ, a.timezone, ctx.timeZone].find((v) => typeof v === "string" && v.trim() !== "") ?? "UTC",
    batchHours: hours,
    releaseWeekday: Number(env.FOREMAN_RELEASE_WEEKDAY ?? a.releaseWeekday ?? ctxDay ?? 5),
    releaseHour: Number(env.FOREMAN_RELEASE_HOUR ?? a.releaseHour ?? 9),
    lockMs: Number(env.FOREMAN_LOCK_SECONDS ?? 10800) * 1000,
    waitMs: Number(env.FOREMAN_WAIT_SECONDS ?? waitHours * 3600) * 1000,
    maxTasks: Number(env.FOREMAN_MAX_TASKS ?? 3),
    mainAutoMerge: a.mainAutoMerge === true,
  };
}

export function isLocked(unit, now, lockMs) {
  return unit.lock !== null && unit.lock !== undefined && now.getTime() - unit.lock < lockMs;
}

function targetName(unit) {
  const t = unit.target || /(?:^|\/)(main|dev)$/.exec(unit.ref ?? "")?.[1];
  return t === "main" ? "staging" : "dev";
}

/** Normalizes the Verdict line of a pretest file; null when absent or unknown. */
export function verdictFromFile(text) {
  const line = String(text ?? "").split(/\r?\n/).reverse().find((l) => /^Verdict:/.test(l));
  const v = line?.slice("Verdict:".length).trim().toLowerCase().replace(/\s+/g, "-");
  return { "fix-round": "fix-round", "uat-ready": "uat-ready", intervention: "intervention", "needs-input": "intervention" }[v] ?? null;
}

/** Round to test or to take over: Pretest-round header, then "Round N" in the note, then the highest file, then 1. */
export function pretestRound(unit, existingRounds = []) {
  if (unit.pretestRound > 0) return unit.pretestRound;
  const n = /(?:^|[·;,]\s*)round\s+(\d+)\b/i.exec(unit.note ?? "");
  if (n) return Number(n[1]);
  return Math.max(1, ...existingRounds);
}

function header(kind, unit, info) {
  return [`Foreman task: ${kind} | unit: ${unit}`, `Info: ${info}`];
}

const BASE = [
  "Step 0 (choosing the unit) is done by the dispatcher; do not repeat it. Load `.claude/skills/foreman-dispatch-run/SKILL.md` first and work by it and CLAUDE.md.",
  "Touch only the unit named here; other work runs handle other units in parallel.",
].join(" ");

export function promptFor(kind, unit, info, extra = {}) {
  const lines = [...header(kind, unit, info), BASE];
  if (kind === "pretest-result") {
    lines.push(`Pretest result: docs/pretest/${unit}-round-${extra.round}.md (Verdict: ${extra.verdict}). Take it over per references/payload.md.`);
  } else if (kind === "pretest-run") {
    lines.push(`Run pretest ${unit} round ${extra.round} against ${extra.target} per .claude/skills/foreman-pretest/SKILL.md. Result: docs/pretest/${unit}-round-${extra.round}.md on the unit's batch branch, last line "Verdict: ...".`);
  } else if (kind === "input-received") {
    lines.push("Answer:", extra.answer);
  } else if (kind === "uat-approved") {
    lines.push(`Payload: UAT ${unit} approved`, `Source: ${info}`);
  } else if (kind === "batch") {
    lines.push(`Batch branch: batch/${extra.target}`, `Units: ${extra.units.join(", ") || "-"}`);
  }
  return lines.join("\n");
}

const mk = (kind, unit, info, extra = {}) => ({ kind, unit, info, prompt: promptFor(kind, unit, info, extra) });

/**
 * Builds the prioritized task list.
 * units: from lib/units.mjs. verdicts: { <unit>: { round, verdict|null } }. signals: { answers, approvals, releaseCommentToday }.
 * openPrs: { dev: number|null, main: number|null }. catchUp: { dev: [ids], main: [ids] } (units already in the target).
 */
export function tasks({ units = [], now = new Date(), settings, verdicts = {}, signals = {}, openPrs = {}, catchUp = {} }) {
  const s = settings ?? settingsFrom();
  const local = localParts(now, s.tz);
  const locked = new Set(units.filter((u) => isLocked(u, now, s.lockMs)));
  const free = units.filter((u) => !locked.has(u));
  const out = [];
  const isPretest = (u) => u.status === "pretest-waiting" || u.status === "pretest-running";

  for (const u of free) {
    const v = verdicts[u.id];
    if (isPretest(u) && v?.verdict) out.push(mk("pretest-result", u.id, `round ${v.round}: ${v.verdict}`, v));
  }
  for (const u of free) {
    if (!isPretest(u)) continue;
    // A running pretest without a fresh lock was aborted and starts again.
    if (u.status === "pretest-running" && (u.lock === null || now.getTime() - u.lock < s.lockMs)) continue;
    const v = verdicts[u.id];
    if (v?.verdict) continue;
    const round = v?.round ?? 1;
    const target = targetName(u);
    out.push(mk("pretest-run", u.id, `round ${round} on ${target}`, { round, target }));
  }
  for (const u of free) {
    const a = signals.answers?.[u.id] ?? [];
    if (u.status !== "needs-input" || !a.length) continue;
    const newest = [...a].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
    const text = typeof newest === "string" ? newest : newest.body;
    out.push(mk("input-received", u.id, text.trim().slice(0, 120), { answer: text }));
  }
  for (const u of free) {
    const a = signals.approvals?.[u.id];
    if (u.status === "uat-ready" && a) out.push(mk("uat-approved", u.id, a.info));
  }
  for (const target of ["dev", "main"]) {
    const waiting = free.filter((u) => u.kind === "fixpack" && u.target === target && u.status === "awaiting-merge");
    const mainBusy = target === "main" && units.some((u) => u.target === "main" && locked.has(u));
    const pr = openPrs[target];
    const open = pr !== null && pr !== undefined;
    const lockedWaiting = target === "dev" && !open && units.some((u) =>
      u.kind === "fixpack" && u.target === target && locked.has(u) && u.status === "awaiting-merge");
    if (mainBusy || lockedWaiting) continue;
    const late = Array.isArray(catchUp[target]) ? catchUp[target] : [];
    const window = s.batchHours.includes(local.hour);
    const oldest = waiting.map((u) => ({ u, t: stamp(u.since) })).filter((x) => x.t !== null).sort((a, b) => a.t - b.t)[0];
    const overdue = oldest && now.getTime() - oldest.t > s.waitMs;
    // Merging to main is outward-facing: window and overdue start it only with mainAutoMerge; an open PR (the human's
    // "Batch PR main") and catch-up always run.
    const auto = target !== "main" || s.mainAutoMerge;
    const trigger = open || (auto && waiting.length > 0 && (window || overdue));
    if (!trigger && !late.length) continue;
    // Held main (no mainAutoMerge, no open PR): only the catch-up runs, so the task names only the catch-up units.
    const held = target === "main" && !s.mainAutoMerge && !open;
    const why = [];
    if (open) why.push(`batch PR #${pr} open`);
    if (late.length) why.push(`catch-up: ${late.join(", ")} already in ${target}`);
    if (!open && !late.length) why.push(window ? `${waiting.length} awaiting-merge (window ${local.hour}:00)` : `${oldest.u.id} awaiting-merge for over ${Math.round(s.waitMs / 3600000)} hours`);
    out.push(mk("batch", `batch:${target}`, why.join("; "), { target, units: held ? late : waiting.map((u) => u.id) }));
  }
  const ready = free.filter((u) => u.status === "release-ready");
  if (local.weekday === s.releaseWeekday && local.hour === s.releaseHour && ready.length && !signals.releaseCommentToday) {
    out.push(mk("release-reminder", "-", ready.map((u) => u.id).join(", ")));
  }
  const coding = free.filter((u) => CODING_STATUSES.includes(u.status))
    .sort((a, b) => {
      const x = stamp(a.since), y = stamp(b.since);
      return x === null ? (y === null ? 0 : 1) : y === null ? -1 : x - y;
    });
  for (const u of coding) out.push(mk("coding", u.id, `${u.status} since ${u.since || "-"}`));
  return out.slice(0, s.maxTasks);
}

/** Formats the task list per the output contract. */
export function formatOutput(list) {
  if (!list.length) return "NOTHING|Nothing to do.";
  const clean = (x) => String(x).replaceAll("|", "/").replace(/[\r\n]+/g, " ");
  const lines = list.map((t) => `TASK|${t.kind}|${t.unit}|${clean(t.info)}`);
  const blocks = list.flatMap((t, i) => [`=== PROMPT ${i + 1} ${t.kind} ${t.unit} ===`, t.prompt, `=== END ${i + 1} ===`]);
  return [...lines, "", ...blocks].join("\n");
}

// Mirror logic for itsaplan: what a unit's STATE.md says -> column, labels, description of one ticket.
import { checklist } from "./state.mjs";

export const MIRROR_MARK = "_Status and checklist: mirrored from STATE.md_";

// Column (ticket status) and phase label per unit status.
export const TARGETS = {
  planning: { column: "In Progress", phase: "Coding" },
  slice: { column: "In Progress", phase: "Coding" },
  rework: { column: "In Progress", phase: "Coding" },
  validation: { column: "In Progress", phase: "Coding" },
  "batch-pr": { column: "In Progress", phase: "Coding" },
  fixpack: { column: "In Progress", phase: "Coding" },
  "needs-input": { column: "Action Required", phase: "Action Required" },
  "awaiting-merge": { column: "Wait for Merge", phase: "Waiting for merge" },
  "pretest-waiting": { column: "Testing", phase: "Pretest waiting" },
  "pretest-running": { column: "Testing", phase: "Pretest running" },
  "uat-ready": { column: "In Review", phase: "UAT ready" },
  "release-ready": { column: "In Review", phase: "Release ready" },
  done: { column: "Done", phase: null },
};
// Other names a column may carry in a project. English defaults; add more in .foreman.json "tracker.columnAliases",
// e.g. { "Action Required": ["<your column name>"] }.
export const COLUMN_ALIASES = { "Action Required": ["Intervention needed"] };
export const TYPE_LABELS = { milestone: "Milestone", fixpack: "Fix pack" };

export function statusLine(unit, list, question) {
  const parts = [`**Status:** ${unit.status}`];
  if (unit.note) parts.push(unit.note.slice(0, 200));
  if (question) parts.push(`Question: ${question}`);
  parts.push(`${list.done} of ${list.total} ${unit.kind === "milestone" ? "slices" : "points"}`, `updated ${unit.since || "-"}`);
  return parts.join(" · ");
}

/** Replaces the mirrored block at the top of a description and keeps everything the humans wrote below the mark. */
export function description(old, block) {
  const lines = String(old ?? "").split(/\r?\n/);
  const mark = lines.findIndex((l) => l.trim() === MIRROR_MARK);
  const rest = mark >= 0 ? lines.slice(mark + 1) : lines;
  return [...block.split("\n"), ...(mark >= 0 ? rest : ["", ...rest])].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function phaseLabelFor(unit, prefix) {
  const t = TARGETS[unit.status];
  if (!t || !t.phase) return null;
  const phase = unit.status === "fixpack" && /fix round|pretest/i.test(unit.note ?? "") ? "Fix round" : t.phase;
  return `${prefix}${phase}`;
}

export function unitTitle(unit) {
  const first = checklist(unit.stateText, unit.kind).items[0]?.title;
  const base = unit.title || first || unit.id;
  return `[${unit.id}] ${base.replace(/^#?\s*/, "")}`.slice(0, 140);
}

export function findIssue(unit, issues) {
  if (unit.tracker) {
    const hit = issues.find((i) => i.identifier === unit.tracker);
    if (hit) return hit;
  }
  return issues.find((i) => String(i.title ?? "").startsWith(`[${unit.id}]`)) ?? null;
}

/**
 * Plan for one unit. `project` = { columns, labels, assignees }, `issue` = current ticket or null.
 * Returns { action: "create"|"update"|"ok", fields, reasons }. Throws when the project lacks a column or label.
 */
export function plan(unit, issue, project, { prefix = "AP: ", question = null, aliases = {} } = {}) {
  const target = TARGETS[unit.status];
  if (!target) throw new Error(`Unknown unit status: ${unit.status}`);
  const list = checklist(unit.stateText, unit.kind);
  const block = `${statusLine(unit, list, question)}\n\n${list.items.map((p) =>
    `- [${p.done ? "x" : " "}] ${p.nr} ${p.title}${p.done && p.commit ? ` · ${p.commit}` : p.blocked ? " · blocked" : ""}`).join("\n")}\n\n${MIRROR_MARK}`;
  const labels = new Map((project.labels ?? []).map((l) => [l.name, l]));
  const wanted = [TYPE_LABELS[unit.kind], phaseLabelFor(unit, prefix)].filter(Boolean);
  const missing = wanted.filter((n) => !labels.has(n));
  if (missing.length) throw new Error(`Missing labels in the project: ${missing.join(", ")}`);
  const columns = project.columns ?? [];
  const column = columns.find((c) => c.name === target.column) ??
    columns.find((c) => [...(COLUMN_ALIASES[target.column] ?? []), ...(aliases[target.column] ?? [])].includes(c.name));
  if (!column) throw new Error(`Missing column in the project: ${target.column}`);
  const managed = new Set([...Object.values(TYPE_LABELS), ...[...labels.keys()].filter((n) => n.startsWith(prefix))]);
  const idToName = new Map((project.labels ?? []).map((l) => [l.id, l.name]));
  const keep = (issue?.labelIds ?? []).filter((id) => !managed.has(idToName.get(id)));
  const labelIds = [...new Set([...keep, ...wanted.map((n) => labels.get(n).id)])].sort();
  if (!issue) {
    return {
      action: "create",
      fields: { title: unitTitle(unit), description: description("", block), columnId: column.id, labelIds },
      reasons: ["ticket missing"],
    };
  }
  const desc = description(issue.description, block);
  const fields = {};
  if (issue.columnId !== column.id) fields.columnId = column.id;
  if (JSON.stringify([...(issue.labelIds ?? [])].sort()) !== JSON.stringify(labelIds)) fields.labelIds = labelIds;
  if (issue.description !== desc) fields.description = desc;
  const reasons = Object.keys(fields).map((k) => `${k} differs`);
  return { action: reasons.length ? "update" : "ok", fields, reasons };
}

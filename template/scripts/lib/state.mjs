// Parsing of STATE.md headers. Pure functions, no I/O.

export const STATUSES = [
  "planning", "slice", "rework", "validation", "batch-pr", "fixpack", "awaiting-merge",
  "pretest-waiting", "pretest-running", "needs-input", "uat-ready", "release-ready", "done",
];
export const CODING_STATUSES = ["planning", "slice", "rework", "validation", "batch-pr", "fixpack"];

const ISO = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?Z";

/** Header field value ("Name: value"), empty string when missing. */
export function field(text, name) {
  const m = String(text ?? "").match(new RegExp(`^${name}:[ \\t]*(.*)$`, "mi"));
  return m ? m[1].trim() : "";
}

/** Header of STATE.md: the lines before the first line starting with "#". */
function header(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const end = lines.findIndex((l) => l.startsWith("#"));
  return end < 0 ? lines.join("\n") : lines.slice(0, end).join("\n");
}

/** Milliseconds of an ISO UTC stamp with or without seconds and trailing Z; null when invalid. */
export function stamp(value) {
  if (typeof value !== "string" || !new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?Z?$`).test(value)) return null;
  const t = Date.parse(/Z$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(t) ? t : null;
}

export function parseState(text) {
  const statusRaw = field(text, "Status");
  const status = (statusRaw.match(/^([a-z-]+)/) || [])[1] || "";
  const since = (statusRaw.match(new RegExp(`since\\s+(${ISO})`)) || [])[1] || "";
  const note = statusRaw
    .slice(status.length)
    .replace(new RegExp(`since\\s+${ISO}`), "")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .replace(/\s*·\s*·\s*/g, " · ");
  const lockRaw = field(text, "Lock");
  const lockStamp = (lockRaw.match(new RegExp(`^(${ISO})`)) || [])[1] || "";
  const tracker = field(text, "Tracker");
  const title = field(text, "Title") || (String(text ?? "").match(/^#\s+(.+)$/m) || [])[1] || "";
  const target = (field(text, "Target").match(/^`?(main|dev)\b/) || [])[1] || "";
  return {
    status: STATUSES.includes(status) ? status : "",
    since,
    note,
    target,
    title: title.trim(),
    tracker: tracker && tracker !== "-" ? tracker.split(/\s/)[0].replace(/`/g, "") : "",
    pretestRound: parseInt(field(text, "Pretest-round") || "0", 10) || 0,
    lock: lockStamp ? stamp(lockStamp) : null,
    wiki: field(header(text), "Wiki"),
  };
}

/** Rows of the checklist table ("## Slices" for milestones, "## Points" for fix packs). */
export function checklist(stateText, kind) {
  const heading = kind === "milestone" ? "## Slices" : "## Points";
  const lines = String(stateText ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  const empty = { items: [], done: 0, total: 0 };
  if (start < 0) return empty;
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
  let h = start + 1;
  while (h < lines.length && !lines[h].includes("|")) h++;
  if (h >= lines.length) return empty;
  const heads = cells(lines[h]).map((x) => x.toLowerCase());
  const titleCol = Math.max(heads.findIndex((x) => x === "title" || x === "slice"), 0);
  const statusCol = heads.findIndex((x) => x.startsWith("status"));
  const commitCol = heads.findIndex((x) => x === "commit");
  const items = [];
  for (let i = h + 1; i < lines.length && lines[i].includes("|"); i++) {
    if (/^\s*\|?\s*:?-{2,}/.test(lines[i])) continue;
    const c = cells(lines[i]);
    if (!c[0]) continue;
    const status = statusCol >= 0 ? c[statusCol] ?? "" : "";
    items.push({
      nr: c[0],
      title: c[titleCol] ?? "",
      status,
      commit: ((commitCol >= 0 ? c[commitCol] : "") ?? "").match(/\b[\da-fA-F]{7,40}\b/)?.[0] ?? "",
      done: /^done\b/i.test(status),
      blocked: /^blocked\b/i.test(status),
    });
  }
  return { items, done: items.filter((x) => x.done).length, total: items.length };
}

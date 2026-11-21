// UAT round titles, checklist parsing and approval detection (tracker comments, tracker checklists, files).
import { stamp } from "./state.mjs";

const esc = (s) => String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Title of the checklist of one UAT round. The stamp ties the list to the status start of that round. */
export function uatTitle(since) {
  return stamp(since) === null ? null : `UAT · since ${since}`;
}

/** Start (ms) of the round a checklist title belongs to, or null for other lists. */
export function uatTitleSince(title) {
  const m = /^UAT · since (.+)$/.exec(String(title ?? ""));
  return m ? stamp(m[1]) : null;
}

/** Checkbox points from a document, optionally limited to its UAT section. */
export function checklistPoints(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  let from = 0, level = null;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+.*\buat\b.*$/i.exec(lines[i].trim());
    if (h) { from = i + 1; level = h[1].length; break; }
  }
  const points = [];
  for (const line of lines.slice(from)) {
    const head = /^(#{1,6})\s/.exec(line.trim());
    if (level !== null && head && head[1].length <= level) break;
    const p = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (p) points.push(p[2].trim().slice(0, 500));
  }
  return points;
}

/**
 * Approval by tracker data: a comment "UAT <unit> approved" of someone else than the bot after the round start, or a
 * fully ticked checklist of exactly this round (at least one point; other rounds and lists without a stamp do not count).
 */
export function trackerApproval({ comments = [], checklists = [], unit, since, botUserId } = {}) {
  const from = stamp(since);
  if (from === null) return null;
  const re = new RegExp(`^UAT ${esc(unit)} approved(?:\\s|$)`, "i");
  const hit = botUserId && comments.find((c) =>
    (c.kind ?? "comment") === "comment" && c.actorUserId !== botUserId &&
    Date.parse(c.createdAt) > from && re.test(String(c.body ?? "").trim()));
  if (hit) return { source: "comment", info: `comment of ${hit.createdAt}` };
  const mine = checklists.filter((l) => uatTitleSince(l.title) === from);
  if (!mine.length) return null;
  let n = 0;
  for (const l of mine) {
    if (!Array.isArray(l.items) || !l.items.length || !l.items.every((p) => p.done === true)) return null;
    n += l.items.length;
  }
  return { source: "checklist", info: `UAT checklist fully ticked (${n} points)` };
}

/** Approval by file `docs/uat/<unit>.md` (module none). `modified` = epoch ms of the file's last commit. */
export function fileApproval({ text, modified, unit, since }) {
  const from = stamp(since);
  if (from === null || typeof text !== "string" || !Number.isFinite(modified) || modified <= from) return null;
  const head = /^#.*\bsince (\S+)/m.exec(text)?.[1];
  if (head && stamp(head) !== from) return null; // list of an older round
  if (new RegExp(`^UAT ${esc(unit)} approved(?:\\s|$)`, "im").test(text)) return { source: "file", info: "line in docs/uat" };
  const boxes = [...text.matchAll(/^\s*[-*+]\s+\[([ xX])\]\s+/gm)];
  if (boxes.length && boxes.every((b) => b[1].toLowerCase() === "x")) {
    return { source: "file", info: `UAT file fully ticked (${boxes.length} points)` };
  }
  return null;
}

/** Content of a new `docs/uat/<unit>.md`. The approval line is documented in a quote so it never counts by itself. */
export function uatFileText({ unit, since, points }) {
  return [
    `# UAT ${unit} · since ${since}`,
    "",
    "Only what needs a second real account, real hardware or a product decision.",
    "",
    ...points.map((p) => `- [ ] ${p}`),
    "",
    `> Approve: tick every point, or add a line that reads exactly \`UAT ${unit} approved\` at the start of a line, then commit and push.`,
    "",
  ].join("\n");
}

/** Answer lines of docs/answers/<unit>.md (module none): the last "Answer <unit>: ..." line with its continuation. */
export function fileAnswer({ text, modified, unit, since }) {
  const from = stamp(since);
  if (from === null || typeof text !== "string" || !Number.isFinite(modified) || modified <= from) return null;
  const lines = text.split(/\r?\n/);
  const re = new RegExp(`^Answer ${esc(unit)}:`);
  let at = -1;
  lines.forEach((l, i) => { if (re.test(l.trim())) at = i; });
  if (at < 0) return null;
  const body = [lines[at].trim()];
  for (let i = at + 1; i < lines.length && lines[i].trim() && !/^Answer\s/.test(lines[i]); i++) body.push(lines[i].trim());
  return { createdAt: new Date(modified).toISOString(), body: body.join("\n") };
}

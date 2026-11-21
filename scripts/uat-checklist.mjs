#!/usr/bin/env node
// Creates the UAT checklist of one round. Only what needs a second real account, real hardware or a product decision.
//   itsaplan: a checklist "UAT · since <since>" on the ticket (approval = all points ticked or a comment "UAT <unit> approved")
//   linear:   a comment with the same title and checkboxes (approval = a comment "UAT <unit> approved")
//   none:     the file docs/uat/<unit>.md (approval = all points ticked or a line "UAT <unit> approved", committed and pushed)
//
//   node scripts/uat-checklist.mjs --unit <id> --since <status start, UTC ISO> [--ticket <id>] [--point "<text>"]... [--from <file>] [--dry-run]
//
// --from reads the checkbox points (`- [ ] text`) of a document, limited to its UAT section when it has one.
// Idempotent: a list of the same round is not created twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { itsaplanClient } from "./lib/itsaplan-api.mjs";
import { linearClient } from "./lib/linear-api.mjs";
import { trackerKind } from "./lib/trackers.mjs";
import { uatTitle, uatTitleSince, checklistPoints, uatFileText } from "./lib/uat.mjs";
import { stamp } from "./lib/state.mjs";

function values(argv, name) {
  const v = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === name && argv[i + 1] && !argv[i + 1].startsWith("--")) v.push(argv[i + 1]);
  return v;
}

export async function main(argv = [], { conf, itsaplan, linear, out = console.log, err = console.error, root = process.cwd() } = {}) {
  const unit = values(argv, "--unit")[0];
  const since = values(argv, "--since")[0];
  const title = uatTitle(since);
  if (!unit) { err("--unit <id> is required."); return 2; }
  if (!title) { err("--since needs the valid ISO time of the UAT status start."); return 2; }
  let points = values(argv, "--point");
  const from = values(argv, "--from")[0];
  if (from) {
    try { points = [...points, ...checklistPoints(readFileSync(from, "utf8"))]; } catch (e) { err(`cannot read ${from}: ${e.message}`); return 2; }
  }
  points = points.map((p) => p.trim().slice(0, 500)).filter(Boolean);
  if (!points.length) { err("No UAT points given."); return 2; }
  const dry = argv.includes("--dry-run");
  const c = conf ?? (existsSync(resolve(root, ".foreman.json")) ? JSON.parse(readFileSync(resolve(root, ".foreman.json"), "utf8")) : {});
  const kind = trackerKind(c);
  const ticket = values(argv, "--ticket")[0];
  try {
    if (kind === "none") {
      const path = resolve(root, `docs/uat/${unit}.md`);
      if (existsSync(path) && stamp(/since (\S+)/.exec(readFileSync(path, "utf8").split("\n")[0])?.[1]) === stamp(since)) {
        out(`UAT file for ${unit} already exists.`);
        return 0;
      }
      if (dry) { out(`UAT file docs/uat/${unit}.md would be written with ${points.length} points.`); return 0; }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, uatFileText({ unit, since, points }));
      out(`UAT file docs/uat/${unit}.md written (${points.length} points). Commit and push it.`);
      return 0;
    }
    if (!ticket) { err("--ticket <id> is required with a tracker."); return 2; }
    if (kind === "linear") {
      const client = linear ?? linearClient();
      const feed = await client.comments(ticket);
      if (feed.some((x) => String(x.body).startsWith(title))) { out(`UAT list for ${ticket} already exists.`); return 0; }
      if (dry) { out(`UAT comment for ${ticket} would have ${points.length} points.`); return 0; }
      await client.comment(ticket, `${title}\n\n${points.map((p) => `- [ ] ${p}`).join("\n")}\n\nApprove with a comment: UAT ${unit} approved`);
      out(`UAT comment for ${ticket} written (${points.length} points).`);
      return 0;
    }
    const client = itsaplan ?? itsaplanClient();
    const key = c.mirror?.itsaplan?.projectKey;
    if (!key) { err("mirror.itsaplan.projectKey missing in .foreman.json"); return 2; }
    const issue = (await client.issues(key)).find((i) => i.identifier === ticket);
    if (!issue) { err(`ticket ${ticket} not found`); return 2; }
    const lists = await client.checklists(issue.id);
    if ((Array.isArray(lists) ? lists : []).some((l) => uatTitleSince(l.title) === stamp(since))) { out(`UAT checklist for ${ticket} already exists.`); return 0; }
    if (dry) { out(`UAT checklist for ${ticket} would be created with ${points.length} points.`); return 0; }
    const list = await client.createChecklist(issue.id, title);
    await client.addChecklistItems(list.id, points);
    out(`UAT checklist for ${ticket} created (${points.length} points).`);
    return 0;
  } catch (e) { err(`tracker error${e.status ? ` (${e.status})` : ""}: ${e.message}`); return 2; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}

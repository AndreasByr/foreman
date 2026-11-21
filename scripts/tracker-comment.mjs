#!/usr/bin/env node
// Writes a comment into a unit's ticket (itsaplan or Linear, per .foreman.json). Workers and runs use it for the
// per-step comment; statuses and labels stay the mirror's job.
//
//   node scripts/tracker-comment.mjs <ticket id> --text "<comment>" [--file <path>]
//
// With tracker none this prints a note and exits 0 (the log lives in STATE.md).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { itsaplanClient } from "./lib/itsaplan-api.mjs";
import { linearClient } from "./lib/linear-api.mjs";
import { trackerKind } from "./lib/trackers.mjs";

export async function main(argv, { conf, itsaplan, linear, out = console.log, err = console.error } = {}) {
  const get = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1] ?? null; };
  const ticket = argv.find((a, i) => !a.startsWith("--") && !["--text", "--file"].includes(argv[i - 1]));
  const text = get("--text") ?? (get("--file") ? readFileSync(get("--file"), "utf8") : null);
  if (!ticket || !text?.trim()) { err("usage: tracker-comment.mjs <ticket id> --text \"<comment>\""); return 2; }
  const c = conf ?? (existsSync(".foreman.json") ? JSON.parse(readFileSync(".foreman.json", "utf8")) : {});
  const kind = trackerKind(c);
  try {
    if (kind === "none") { out("tracker none: no comment written (log it in STATE.md)."); return 0; }
    if (kind === "linear") {
      await (linear ?? linearClient()).comment(ticket, text);
    } else {
      const client = itsaplan ?? itsaplanClient();
      const key = c.mirror?.itsaplan?.projectKey;
      if (!key) { err("mirror.itsaplan.projectKey missing in .foreman.json"); return 2; }
      const issue = (await client.issues(key)).find((i) => i.identifier === ticket);
      if (!issue) { err(`ticket ${ticket} not found`); return 2; }
      await client.comment(issue.id, text);
    }
    out(`comment written to ${ticket}`);
    return 0;
  } catch (e) { err(`tracker error${e.status ? ` (${e.status})` : ""}: ${e.message}`); return 2; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}

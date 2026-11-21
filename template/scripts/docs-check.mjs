#!/usr/bin/env node
// Check overview documents against the Stand line rule (docs/docs-rules.md, section "Stand line").
// Only reads files. Run: node scripts/docs-check.mjs <file> [<file> ...]
// Exit: 0 all files ok, 1 a file breaks a rule, 2 no argument or a file cannot be read.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkDocs } from "./lib/docs-check.mjs";

export function main(files) {
  if (files.length === 0) {
    console.error("usage: node scripts/docs-check.mjs <file> [<file> ...]");
    return 2;
  }
  let unreadable = false;
  let broken = false;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (e) {
      // Report the reason without a stack trace and keep checking the other files.
      console.error(`cannot read ${file}: ${e.message}`);
      unreadable = true;
      continue;
    }
    const { ok, problems } = checkDocs(text);
    if (ok) console.log(`ok ${file}`);
    for (const p of problems) {
      console.log(`FAIL ${file}: ${p}`);
      broken = true;
    }
  }
  if (unreadable) return 2;
  return broken ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}

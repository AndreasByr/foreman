#!/usr/bin/env node
// Checks an itsaplan project template file. Run: node scripts/check-itsaplan-template.mjs <file>
import { readFileSync } from "node:fs";
import { validateTemplate } from "./lib/itsaplan-template.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/check-itsaplan-template.mjs <file>");
  process.exit(2);
}

let text;
try {
  text = readFileSync(file, "utf8");
} catch (err) {
  console.error(`itsaplan template: cannot read ${file}: ${err.code ?? err.message}`);
  process.exit(1);
}
let template;
try {
  template = JSON.parse(text);
} catch {
  console.error(`itsaplan template: invalid JSON in ${file}`);
  process.exit(1);
}

const errors = validateTemplate(template);
if (errors.length) {
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log("itsaplan template: ok");
process.exit(0);

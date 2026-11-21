#!/usr/bin/env node
// Tests for measure.mjs and the intervention cause. Run: node scripts/test-measure.mjs
import assert from "node:assert/strict";
import { interventions } from "./lib/intervention.mjs";

let n = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

t("a section with a valid cause line is an intervention without problem", () => {
  const r = interventions("# M1\n\n## Open question\n\n**Cause:** open-decision · Which format?\n");
  assert.equal(r.length, 1);
  assert.equal(r[0].problem, null);
});

let failed = 0;
for (const [name, fn] of queue) {
  try { await fn(); n++; console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n  ${e.message}`); }
}
console.log(`${n}/${queue.length} passed`);
process.exit(failed ? 1 : 0);

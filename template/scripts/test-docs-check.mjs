#!/usr/bin/env node
// Tests for lib/docs-check.mjs (the "Stand" line rule) and the CLI scripts/docs-check.mjs. Run: node scripts/test-docs-check.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDocs } from "./lib/docs-check.mjs";

let n = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);

const MULTI = /more than one version|mehr als eine Version/i;
const NO_STAND = /no Stand line|kein Stand/i;
const MANY_STAND = /more than one Stand line|mehr als eine Stand|mehrere Stand/i;

function expectOk(text) {
  const r = checkDocs(text);
  assert.equal(r.ok, true, `expected ok, got problems: ${JSON.stringify(r.problems)}`);
  assert.deepEqual(r.problems, []);
}

function expectProblem(text, pattern) {
  const r = checkDocs(text);
  assert.equal(r.ok, false, "expected a problem");
  assert.ok(r.problems.length > 0, "problems must not be empty when ok is false");
  if (pattern) assert.ok(r.problems.some((p) => pattern.test(p)), `no problem matches ${pattern}: ${JSON.stringify(r.problems)}`);
}

// ----- ok cases -----

t("ok: date with Fassung-free single version", () => {
  expectOk("**Stand:** 21.11.2026, Version 1 (erste Fassung aus `docs/requirements.md`)");
});

t("ok: ISO date, one version, parenthesis with a number and words", () => {
  expectOk("**Stand:** 2026-11-21, Version 3 (added milestone M008, 5000 words rule)");
});

t("ok: plain Stand line without bold, version 27", () => {
  expectOk("Stand: 14.10.2026, Version 27 (Kapitel 4 ergänzt)");
});

t("ok: leading spaces before the Stand line", () => {
  expectOk("   **Stand:** 14.10.2026, Version 27 (Kapitel 4 ergänzt)");
});

t("ok: bare numbers (roadmap 0.2.1, 5000 words) are not versions", () => {
  expectOk("**Stand:** 2026-11-21, Version 3 (Roadmap 0.2.1, 5000 Wörter)");
});

t("ok: Stand line in a quote block", () => {
  expectOk("> **Stand:** 14.10.2026, Version 27 (Kapitel 4 ergänzt)");
});

t("ok: bold variant with the colon outside", () => {
  expectOk("**Stand**: 14.10.2026, Version 27 (Kapitel 4 ergänzt)");
});

t("ok: comma and plain number in the note after a singular keyword", () => {
  expectOk("**Stand:** 14.10.2026, Version 3, 12 neue Milestones");
});

t("ok: bare number and a word after the comma (12 neue Milestones)", () => {
  expectOk("**Stand:** 14.10.2026, Version 3, 12 neue Milestones");
});

t("ok: bare number after the comma is a date with a month name", () => {
  expectOk("**Stand:** Version 3, 21. November 2026");
});

t("ok: hyphen range, then a bare number followed by a word", () => {
  expectOk("**Stand:** 14.10.2026, Version 3 - 5 neue Milestones");
});

t("ok: en-dash range, then a date with a month name", () => {
  expectOk("**Stand:** Version 3 – 21. November 2026");
});

t("ok: lowercase keyword version", () => {
  expectOk("**Stand:** 14.10.2026, version 3 (Kapitel 4)");
});

t("ok: Version: 3 form with a colon", () => {
  expectOk("**Stand:** 14.10.2026, Version: 3 (x)");
});

t("ok: list prefix before the Stand line", () => {
  expectOk("- **Stand:** 14.10.2026, Version 3 (x)");
});

t("ok: date without year", () => {
  expectOk("**Stand:** Version 3, 21.11.");
});

t("ok: longer document, history below the Stand line in its own section", () => {
  const doc = [
    "# Roadmap 0.2.x",
    "",
    "**Stand:** 14.10.2026, Version 27 (Kapitel 4 ergänzt)",
    "",
    "Milestones M001 bis M011 in Arbeit. Details in `docs/roadmap-0.2.x/`.",
    "",
    "## Ziele",
    "",
    "- Export für Mitglieder",
    "- Rollen und Rechte",
    "",
    "## History",
    "",
    "Version 26: Rollen ergänzt.",
    "Version 25: Tests ergänzt.",
    "",
  ].join("\n");
  expectOk(doc);
});

// ----- problem cases: more than one version -----

t("problem: several version mentions on one Stand line", () => {
  expectProblem("**Stand:** 14.10.2026, Version 27 (Kapitel 4). Version 26: Rollen. Version 25: Tests.", MULTI);
});

t("problem: range with Versionen and bis", () => {
  expectProblem("**Stand:** 14.10.2026, Versionen 9 bis 27 (Verlauf)", MULTI);
});

t("problem: range with Versions and to", () => {
  expectProblem("**Stand:** 2026-10-14, Versions 1 to 3", MULTI);
});

t("problem: range with v1-v3", () => {
  expectProblem("**Stand:** 2026-10-14, v1-v3", MULTI);
});

t("problem: list with v-prefix", () => {
  expectProblem("**Stand:** 14.10.2026, v9, v10, v11", MULTI);
});

t("problem: list with Versionen and und", () => {
  expectProblem("**Stand:** 14.10.2026, Versionen 9, 10 und 11", MULTI);
});

t("problem: fabricated overview, history from Version 9 to 27 in one Stand paragraph", () => {
  expectProblem(
    "**Stand:** 14.10.2026, Version 27 (Kapitel 4). Version 26: Rollen ergänzt. Version 25: Tests. Versionen 9 bis 24: Aufbau.",
    MULTI,
  );
});

t("problem: second version in the note (v-prefix)", () => {
  expectProblem("**Stand:** 14.10.2026, Version 3 (v0.2.2 veröffentlicht)", MULTI);
});

t("problem: bare-number list after singular Version", () => {
  expectProblem("**Stand:** 14.10.2026, Version 9, 10, 11 (Verlauf)", MULTI);
});

t("problem: bare number after und after singular Version", () => {
  expectProblem("**Stand:** 14.10.2026, Version 2 und 3", MULTI);
});

t("problem: bare number after & after singular Version", () => {
  expectProblem("**Stand:** 14.10.2026, Version 26 & 27", MULTI);
});

t("problem: plural range with a hyphen", () => {
  expectProblem("**Stand:** 14.10.2026, Versionen 9 - 27", MULTI);
});

t("problem: lowercase version und version", () => {
  expectProblem("**Stand:** 14.10.2026, version 3 und version 4", MULTI);
});

// ----- problem cases: Stand line count -----

t("problem: empty string has no Stand line", () => {
  expectProblem("", NO_STAND);
});

t("problem: text without a Stand line", () => {
  expectProblem("# Roadmap\n\nMilestones M001 bis M011.\n\n## Ziele\n\n- Export\n", NO_STAND);
});

t("problem: two Stand lines", () => {
  expectProblem(
    "**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n\nText.\n\n**Stand:** 21.11.2026, Version 28 (M008)\n",
    MANY_STAND,
  );
});

t("problem: quote-block Stand line plus a normal Stand line", () => {
  expectProblem(
    "> **Stand:** 14.10.2026, Version 27 (Kapitel 4 ergänzt)\n\nText.\n\n**Stand:** 21.11.2026, Version 28 (M008)\n",
    MANY_STAND,
  );
});

// ----- fenced blocks and list prefixes -----

t("problem: only Stand line inside a ``` fence", () => {
  expectProblem("# Roadmap\n\n```\n**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n```\n", NO_STAND);
});

t("problem: only Stand line inside a ~~~ fence", () => {
  expectProblem("# Roadmap\n\n~~~\n**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n~~~\n", NO_STAND);
});

t("ok: real Stand line plus a second one inside a fence", () => {
  expectOk("**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n\n```md\n**Stand:** 21.11.2026, Version 28 (M008)\n```\n");
});

t("problem: unclosed fence hides the only Stand line after it", () => {
  expectProblem("# Roadmap\n\n```\n**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n", NO_STAND);
});

t("ok: unclosed fence hides a second Stand line after it", () => {
  expectOk("**Stand:** 14.10.2026, Version 27 (Kapitel 4)\n\n```\n**Stand:** 21.11.2026, Version 28 (M008)\n");
});

// ----- invariant -----

t("invariant: ok is true exactly when problems is empty", () => {
  const samples = [
    "",
    "# nothing",
    "**Stand:** 21.11.2026, Version 1 (erste Fassung)",
    "**Stand:** 14.10.2026, Version 27 (Kapitel 4). Version 26: Rollen.",
    "**Stand:** 14.10.2026, v9, v10, v11",
    "Stand: 2026-11-21, Version 3\nStand: 2026-11-22, Version 4\n",
  ];
  for (const s of samples) {
    const r = checkDocs(s);
    assert.equal(r.ok, r.problems.length === 0, `ok/problems disagree for ${JSON.stringify(s)}`);
    assert.ok(Array.isArray(r.problems));
  }
});

// ----- CLI: scripts/docs-check.mjs -----

const CLI = fileURLToPath(new URL("./docs-check.mjs", import.meta.url));

const GOOD = "# Requirements\n\n**Stand:** 21.11.2026, Version 1 (erste Fassung)\n\nText.\n";
const BAD = "# Roadmap\n\n**Stand:** 14.10.2026, Versionen 9 bis 27 (Verlauf)\n";

const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

t("cli: good file exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-check-"));
  try {
    const file = join(dir, "good.md");
    writeFileSync(file, GOOD);
    const r = runCli([file]);
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("cli: bad file exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-check-"));
  try {
    const file = join(dir, "bad.md");
    writeFileSync(file, BAD);
    const r = runCli([file]);
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("cli: missing path exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-check-"));
  try {
    const r = runCli([join(dir, "does-not-exist.md")]);
    assert.equal(r.status, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("cli: no argument exits 2", () => {
  const r = runCli([]);
  assert.equal(r.status, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
});

for (const [name, fn] of queue) {
  await fn();
  n++;
  console.log(`ok ${name}`);
}
console.log(`docs-check tests: ${n} ok`);

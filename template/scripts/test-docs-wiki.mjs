#!/usr/bin/env node
// Tests for the docs wiki: the library scripts/lib/docs-wiki.mjs, the CLI flag --wiki of
// scripts/docs-notion.mjs, the skill foreman-wiki and the module docs. Run: node scripts/test-docs-wiki.mjs
// Black-box where possible; the CLI runs as a child process, no network (dry-run or fail before any request).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "lib", "docs-wiki.mjs");
const CLI = join(HERE, "docs-notion.mjs");
const SKILL = join(HERE, "..", ".claude", "skills", "foreman-wiki", "SKILL.md");
const MODULES = join(HERE, "..", "..", "docs", "MODULES.md");
const DEAD_BASE = "http://127.0.0.1:9";
const FAKE_TOKEN = "ntn_TEST_FAKE_TOKEN_WIKI_12345";

// ---------------------------------------------------------------- helpers

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.log(`not ok ${name}`);
    console.log(String(e?.stack ?? e));
    process.exit(1);
  }
}

const loadLib = () => import(pathToFileURL(LIB).href);

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

// Strip the temp root (absolute or relative paths both come out as docs/... relative paths).
function relPath(p, root, realRoot) {
  let s = String(p).replace(/\\/g, "/");
  for (const r of [realRoot, root]) if (r && s.startsWith(r.replace(/\\/g, "/") + "/")) s = s.slice(r.length + 1);
  return s;
}

const HEAD = "---\naudience: Spieler und Tester\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n";
const START_MD = HEAD + "# Start\n\nInvented welcome text for players.\n";
const SPIELEN_MD = HEAD + "# Spielen\n\nInvented text about playing.\n";
const LOOSE_MD = "# Loose\n\nNo head here.\n";
const CONFIG = {
  context: { language: "de" },
  wiki: {
    enabled: true,
    rootPageId: "wiki-root-1",
    audiences: [{ name: "Spieler und Tester", description: "Spielende und Testende" }],
  },
};

// Project with a wiki, plus links that must never be published: a file symlink inside the
// root, a directory symlink, and a file symlink pointing outside the root.
async function withWikiProject(fn) {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-"));
  const outside = mkdtempSync(join(tmpdir(), "docs-wiki-outside-"));
  try {
    writeFiles(root, {
      ".foreman.json": JSON.stringify(CONFIG, null, 2),
      "docs/wiki/spieler-und-tester/start.md": START_MD,
      "docs/wiki/spieler-und-tester/spielen.md": SPIELEN_MD,
      "docs/wiki/loose.md": LOOSE_MD,
      "docs/wiki/notes.txt": "not markdown\n",
      "docs/roadmap.md": "# Roadmap\n\nOutside the wiki.\n",
      "docs/wiki-notes.md": "# Wiki notes\n\nOutside the wiki.\n",
    });
    writeFiles(outside, { "outside.md": "# Outside\n\nMust never be published.\n", "dir/inner.md": "# Inner\n" });
    symlinkSync("../roadmap.md", join(root, "docs/wiki/link.md"));
    symlinkSync(join(outside, "dir"), join(root, "docs/wiki/linkdir"), "dir");
    symlinkSync(join(outside, "outside.md"), join(root, "docs/wiki/escape.md"));
    return await fn({ root, outside });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

// Runs the CLI as a child process. The environment is cleaned of NOTION_* first.
function runCli({ cwd, args = [], token, extraEnv = {} }) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^NOTION_/i.test(k)) delete env[k];
  env.NOTION_API_BASE = DEAD_BASE;
  if (token) env.NOTION_API_KEY = token;
  Object.assign(env, extraEnv);
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 30000 });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const info = (r) => `exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`;

// ---------------------------------------------------------------- library

await check("lib audienceSlug: umlauts, separators, empty", async () => {
  const { audienceSlug } = await loadLib();
  assert.equal(audienceSlug("Spieler und Tester"), "spieler-und-tester");
  assert.equal(audienceSlug("Nutzer & Admins"), "nutzer-admins");
  assert.equal(audienceSlug("Größe Übung"), "groesse-uebung");
  assert.equal(audienceSlug(""), "");
});

await check("lib parseHead: full head, trimmed comma lists, body after closing line", async () => {
  const { parseHead } = await loadLib();
  const text = "---\naudience: Spieler und Tester\nsource: docs/design.md, docs/requirements.md ,\nchecked: no-ai-slop, humanizer\n---\n# Start\n\nText.\n";
  const { head, body } = parseHead(text);
  assert.deepEqual(head, {
    audience: "Spieler und Tester",
    source: ["docs/design.md", "docs/requirements.md"],
    checked: ["no-ai-slop", "humanizer"],
  });
  assert.equal(body.trim(), "# Start\n\nText.");
});

await check("lib parseHead: missing keys give empty values", async () => {
  const { parseHead } = await loadLib();
  const { head, body } = parseHead("---\naudience: X\n---\nBody line\n");
  assert.deepEqual(head, { audience: "X", source: [], checked: [] });
  assert.equal(body.trim(), "Body line");
});

await check("lib parseHead: no head or no closing line gives head null and the whole text as body", async () => {
  const { parseHead } = await loadLib();
  const plain = "# Title\n\nNo head.\n";
  const r1 = parseHead(plain);
  assert.equal(r1.head, null);
  assert.equal(r1.body, plain);
  const open = "---\naudience: X\n# Title\n\nNo closing line.\n";
  const r2 = parseHead(open);
  assert.equal(r2.head, null);
  assert.equal(r2.body, open);
});

await check("lib loadWikiConfig: fields, language fallback, audience slugs", async () => {
  const { loadWikiConfig } = await loadLib();
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-cfg-"));
  try {
    writeFiles(root, { ".foreman.json": JSON.stringify(CONFIG) });
    const cfg = await loadWikiConfig(root);
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.language, "de", "language must fall back to context.language");
    assert.equal(cfg.rootPageId, "wiki-root-1");
    assert.deepEqual(cfg.audiences, [{ name: "Spieler und Tester", description: "Spielende und Testende", slug: "spieler-und-tester" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check("lib loadWikiConfig: missing or non-object wiki key throws code 2", async () => {
  const { loadWikiConfig } = await loadLib();
  for (const json of [{ context: { language: "de" } }, { wiki: "yes" }]) {
    const root = mkdtempSync(join(tmpdir(), "docs-wiki-cfg-"));
    try {
      writeFiles(root, { ".foreman.json": JSON.stringify(json) });
      let err = null;
      try {
        await loadWikiConfig(root);
      } catch (e) {
        err = e;
      }
      assert.ok(err, `no error for ${JSON.stringify(json)}`);
      assert.equal(err.code, 2, `error code for ${JSON.stringify(json)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

await check("lib collectWikiPages: only .md below docs/wiki, sorted, symlinks skipped", async () => {
  const { collectWikiPages } = await loadLib();
  await withWikiProject(async ({ root }) => {
    const realRoot = realpathSync(root);
    const { pages, skipped } = await collectWikiPages(root);
    const rels = pages.map((p) => relPath(p.path, root, realRoot));
    assert.deepEqual(rels, ["docs/wiki/loose.md", "docs/wiki/spieler-und-tester/spielen.md", "docs/wiki/spieler-und-tester/start.md"]);

    const byRel = Object.fromEntries(pages.map((p) => [relPath(p.path, root, realRoot), p]));
    assert.equal(byRel["docs/wiki/loose.md"].dir, "");
    assert.equal(byRel["docs/wiki/loose.md"].head, null);
    assert.equal(byRel["docs/wiki/spieler-und-tester/start.md"].dir, "spieler-und-tester");
    assert.deepEqual(byRel["docs/wiki/spieler-und-tester/start.md"].head, {
      audience: "Spieler und Tester",
      source: ["docs/design.md"],
      checked: ["no-ai-slop", "humanizer"],
    });
    assert.ok(byRel["docs/wiki/spieler-und-tester/start.md"].body.includes("Invented welcome text"), "body lost");

    const skippedText = skipped.join("\n");
    assert.ok(/link\.md .*\(symlink\)/.test(skippedText), `file symlink not skipped as symlink:\n${skippedText}`);
    assert.ok(/linkdir .*\(symlink\)/.test(skippedText), `directory symlink not skipped:\n${skippedText}`);
    assert.ok(/escape\.md .*\((symlink|outside root)\)/.test(skippedText), `escaping link not skipped:\n${skippedText}`);
    assert.ok(!pages.some((p) => /link|escape|outside|roadmap|wiki-notes|notes\.txt/.test(p.path)), "a link, an outside file or a non-md file was returned");
  });
});

// ---------------------------------------------------------------- CLI --wiki

await check("cli --wiki: no wiki block exits 2 with 'wiki is off'", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-cli-"));
  try {
    writeFiles(root, { ".foreman.json": JSON.stringify({ context: { language: "de" } }), "docs/wiki/a.md": "# A\n" });
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root] });
    assert.equal(r.status, 2, info(r));
    assert.ok(r.stderr.includes("wiki is off"), info(r));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki: wiki.enabled false exits 2 with 'wiki is off'", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-cli-"));
  try {
    writeFiles(root, { ".foreman.json": JSON.stringify({ wiki: { enabled: false, rootPageId: "x" } }), "docs/wiki/a.md": "# A\n" });
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root] });
    assert.equal(r.status, 2, info(r));
    assert.ok(r.stderr.includes("wiki is off"), info(r));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki --dry-run: one sync line per page, nothing outside docs/wiki, symlink named", async () => {
  await withWikiProject(({ root }) => {
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root] });
    assert.equal(r.status, 0, info(r));
    const sync = r.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("sync "));
    assert.deepEqual(
      [...sync].sort(),
      [
        "sync docs/wiki/loose.md (audience: none)",
        "sync docs/wiki/spieler-und-tester/spielen.md (audience: Spieler und Tester)",
        "sync docs/wiki/spieler-und-tester/start.md (audience: Spieler und Tester)",
      ],
      info(r),
    );
    assert.ok(!r.stdout.includes("roadmap.md"), `file outside docs/wiki listed:\n${info(r)}`);
    assert.ok(!r.stdout.includes("wiki-notes"), `file outside docs/wiki listed:\n${info(r)}`);
    assert.ok(r.stderr.includes("link.md"), `skipped symlink not named on stderr:\n${info(r)}`);
  });
});

await check("cli --wiki without --dry-run and without NOTION_API_KEY exits 3", async () => {
  await withWikiProject(({ root }) => {
    const r = runCli({ cwd: root, args: ["--wiki", "--root", root], token: "" });
    assert.equal(r.status, 3, info(r));
    assert.ok(r.stderr.includes("NOTION_API_KEY"), info(r));
  });
});

await check("cli --wiki without --dry-run, token set, empty rootPageId exits 3", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-cli-"));
  try {
    const cfg = { wiki: { enabled: true, rootPageId: "", audiences: [] } };
    writeFiles(root, { ".foreman.json": JSON.stringify(cfg), "docs/wiki/a.md": "# A\n" });
    const r = runCli({ cwd: root, args: ["--wiki", "--root", root], token: FAKE_TOKEN });
    assert.equal(r.status, 3, info(r));
    assert.ok(r.stderr.includes("wiki.rootPageId"), info(r));
    assert.ok(!r.stdout.includes(FAKE_TOKEN) && !r.stderr.includes(FAKE_TOKEN), "token leaked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki: enabled with no pages exits 0 with 'nothing to publish'", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-cli-"));
  try {
    writeFiles(root, { ".foreman.json": JSON.stringify(CONFIG), "docs/roadmap.md": "# Roadmap\n" });
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root] });
    assert.equal(r.status, 0, info(r));
    assert.ok(r.stdout.includes("nothing to publish"), info(r));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- skill and docs
// --lib-only skips these two checks (the skill and docs/MODULES.md are written separately).

if (!process.argv.includes("--lib-only")) {
  await check("skill foreman-wiki: SKILL.md exists and names the required terms", async () => {
    const text = readFileSync(SKILL, "utf8");
    for (const word of ["docs/wiki/", "no-ai-slop", "humanizer", "source", "audience", "--wiki"]) {
      assert.ok(text.includes(word), `SKILL.md does not mention ${word}`);
    }
  });

  await check("docs/MODULES.md mentions --wiki", async () => {
    const text = readFileSync(MODULES, "utf8");
    assert.ok(text.includes("--wiki"), "docs/MODULES.md does not mention --wiki");
  });
}

console.log("docs-wiki tests: ok");

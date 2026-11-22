#!/usr/bin/env node
// Tests for the docs wiki: the library scripts/lib/docs-wiki.mjs, the CLI flag --wiki of
// scripts/docs-notion.mjs, the skill foreman-wiki and the module docs. Run: node scripts/test-docs-wiki.mjs
// Black-box where possible; the CLI runs as a child process, no network (dry-run or fail before any request).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const plainText = (rt = []) => rt.map((r) => r.text?.content ?? r.plain_text ?? "").join("");
const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "lib", "docs-wiki.mjs");
const CLI = join(HERE, "docs-notion.mjs");
const SKILL = join(HERE, "..", ".claude", "skills", "foreman-wiki", "SKILL.md");
const MODULES = join(HERE, "..", "..", "docs", "MODULES.md");
const INSTALL_SH = join(HERE, "..", "..", "install.sh"); // present only in a foreman checkout, not in an installed project
const DEAD_BASE = "http://127.0.0.1:9";
const FAKE_TOKEN = ["ntn", "TEST_FAKE_TOKEN_WIKI_12345"].join("_"); // built at runtime (privacy-scan)

// ---------------------------------------------------------------- helpers

// Every case runs; failures are counted and reported at the end (exit 1).
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.log(`not ok ${name}`);
    console.log(String(e?.stack ?? e));
  }
}

const loadLib = () => import(pathToFileURL(LIB).href);

// Files that exist only in a full repo (docs/MODULES.md, batch-run.md), not in an installed project: skip when missing.
async function checkIfInstalled(name, file, fn) {
  if (!existsSync(file)) {
    console.log(`ok ${name} (skipped: file not installed)`);
    return;
  }
  await check(name, () => fn(readFileSync(file, "utf8")));
}

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

await check("lib loadWikiConfig: empty wiki.language falls back to context.language; a set wiki.language wins", async () => {
  const { loadWikiConfig } = await loadLib();
  const cases = [
    [{ context: { language: "de" }, wiki: { enabled: true, language: "", audiences: [], rootPageId: "x" } }, "de"],
    [{ context: { language: "de" }, wiki: { enabled: true, language: "en", audiences: [], rootPageId: "x" } }, "en"],
  ];
  for (const [json, want] of cases) {
    const root = mkdtempSync(join(tmpdir(), "docs-wiki-cfg-"));
    try {
      writeFiles(root, { ".foreman.json": JSON.stringify(json) });
      const cfg = await loadWikiConfig(root);
      assert.equal(cfg.language, want, JSON.stringify(json));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

await check("lib loadWikiConfig: empty audience slug, or two names with one slug, throw code 2", async () => {
  const { loadWikiConfig } = await loadLib();
  const lists = [[{ name: "!!!" }], [{ name: "Spieler/Tester" }, { name: "Spieler Tester" }]];
  for (const audiences of lists) {
    const root = mkdtempSync(join(tmpdir(), "docs-wiki-cfg-"));
    try {
      writeFiles(root, { ".foreman.json": JSON.stringify({ wiki: { enabled: true, language: "de", rootPageId: "x", audiences } }) });
      let err = null;
      try {
        await loadWikiConfig(root);
      } catch (e) {
        err = e;
      }
      assert.ok(err, `no error for ${JSON.stringify(audiences)}`);
      assert.equal(err.code, 2, `error code for ${JSON.stringify(audiences)}`);
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
    rmSync(join(root, "docs/wiki/loose.md")); // a page without head is a validation problem (exit 4), see the validation cases
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root] });
    assert.equal(r.status, 0, info(r));
    const sync = r.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("sync "));
    assert.deepEqual(
      [...sync].sort(),
      [
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

// ---------------------------------------------------------------- scan and publish
// Lib scan/validate cases and CLI publish cases. They fail until lib/docs-wiki-scan.mjs and --wiki publishing exist.

const SCAN = join(HERE, "lib", "docs-wiki-scan.mjs");
const loadScan = () => import(pathToFileURL(SCAN).href);
const WIKI_ROOT = "wiki-root";
const PUB_TOKEN = "fake-token-123456789";
const SECRET = ["ntn", "Q7xKm2Lp9Rt4Wz8Yc3Vb"].join("_"); // invented; built at runtime so the privacy scan sees no token shape in the file
// More invented token shapes, all built at runtime from joined parts for the same reason.
const ALNUM = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"; // 36 alphanumerics
const SHAPES = {
  githubPat: ["github", "pat", ALNUM.slice(0, 22)].join("_"),
  slackBot: ["xoxb", "1234567890abcDEF"].join("-"),
  gitlabPat: ["glpat", ALNUM.slice(0, 20)].join("-"),
  googleKey: ["AI", "za"].join("") + ALNUM.slice(0, 35),
  jwt: ["eyJ" + ALNUM.slice(0, 12), "eyJ" + ALNUM.slice(12, 24), ALNUM.slice(20, 36)].join("."),
  passwordLine: ["password", "Invented-Value-42"].join(": "),
  apiKeyLine: ["api_key", "invented42value"].join("="),
};
// Literal token shapes for the scan cases, built at runtime from joined parts.
const SK = ["sk", "abcdefghijklmnopqrstu"].join("-");
const BEARER = ["Bearer", "abcdefghijklmnopqrstuvwx"].join(" ");
const AWS = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const PEM = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const RSA_PEM = ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ");
const NOTION_EQ = ["NOTION_API_KEY", "abc123xyz"].join("=");
const NOTION_COLON = ["NOTION_API_KEY", "abc123xyz"].join(": ");
const PUB_CONFIG = {
  context: { language: "de" },
  wiki: {
    enabled: true,
    language: "de",
    rootPageId: WIKI_ROOT,
    audiences: [{ name: "Spieler und Tester", description: "Spielende und Testende" }],
    forbidden: ["Projekt Z"],
  },
  docsNotion: { rootPageId: "docs-root", include: ["docs/**/*.md"], exclude: [] },
};
const lastLine = (s) => s.split("\n").map((l) => l.trimEnd()).filter(Boolean).at(-1);
const noToken = (r) => assert.ok(!r.stdout.includes(PUB_TOKEN) && !r.stderr.includes(PUB_TOKEN), `token printed\n${info(r)}`);

// A project with two valid wiki pages and internal docs; extra files are written on top.
function pubProject(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-pub-"));
  writeFiles(root, {
    ".foreman.json": JSON.stringify(PUB_CONFIG, null, 2),
    "docs/wiki/spieler-und-tester/start.md": START_MD,
    "docs/wiki/spieler-und-tester/spielen.md": SPIELEN_MD,
    "docs/roadmap.md": "# Roadmap\n\nInternal plan.\n",
    "docs/requirements.md": "# Requirements\n\nInternal.\n",
    ...extra,
  });
  return root;
}

// Minimal fake Notion for the wiki publish. Records every request (method, path).
// seed: [id, title, text] human-made child pages of the wiki root (no marker paragraph).
async function startWikiFake({ token = PUB_TOKEN, seed = [] } = {}) {
  let seq = 0;
  const newId = (p) => `${p}-${++seq}`;
  const pages = new Map();
  pages.set(WIKI_ROOT, { id: WIKI_ROOT, title: "Wiki", parent: null, archived: false, items: [] });
  for (const [id, title, text] of seed) {
    pages.set(id, { id, title, parent: WIKI_ROOT, archived: false, items: [{ object: "block", id: newId("blk"), type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } }] });
    pages.get(WIKI_ROOT).items.push({ child_page: id });
  }
  const requests = [];
  const stamp = (b) => ({ ...structuredClone(b), object: "block", id: newId("blk") });
  const archive = (p) => {
    p.archived = true;
    for (const it of p.items) if (it.child_page) archive(pages.get(it.child_page));
  };
  const findItem = (id) => {
    for (const p of pages.values()) {
      const i = p.items.findIndex((it) => (it.child_page ? it.child_page === id : it.id === id));
      if (i >= 0) return { owner: p, index: i, item: p.items[i] };
    }
    return null;
  };
  const listing = (p) =>
    p.items.flatMap((it) => {
      if (!it.child_page) return [it];
      const c = pages.get(it.child_page);
      return c.archived ? [] : [{ object: "block", id: c.id, type: "child_page", has_children: true, child_page: { title: c.title } }];
    });

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url, "http://localhost");
    let body;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = undefined;
    }
    const rec = { method: req.method, path: url.pathname, status: 0 };
    requests.push(rec);
    const send = (status, obj) => {
      rec.status = status;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const fail = (status, code, message) => send(status, { object: "error", status, code, message });
    if (req.headers.authorization !== `Bearer ${token}`) return fail(401, "unauthorized", "API token is invalid.");
    if (!req.headers["notion-version"]) return fail(400, "missing_version", "Notion-Version header is required.");
    let m;
    if (req.method === "POST" && url.pathname === "/v1/pages") {
      const parent = pages.get(body?.parent?.page_id);
      if (!parent || parent.archived) return fail(404, "object_not_found", "parent page not found");
      const tp = body.properties?.title;
      const arr = Array.isArray(tp) ? tp : tp?.title;
      if (!Array.isArray(arr)) return fail(400, "validation_error", "properties.title missing");
      const page = { id: newId("page"), title: arr.map((r) => r.text?.content ?? "").join(""), parent: parent.id, archived: false, items: (body.children ?? []).map(stamp) };
      pages.set(page.id, page);
      parent.items.push({ child_page: page.id });
      return send(200, { object: "page", id: page.id, archived: false });
    }
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/))) {
      const p = pages.get(m[1]);
      if (!p) return fail(404, "object_not_found", "block not found");
      return send(200, { object: "list", results: listing(p), has_more: false, next_cursor: null });
    }
    if (req.method === "PATCH" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/))) {
      const p = pages.get(m[1]);
      if (!p) return fail(404, "object_not_found", "block not found");
      if (!Array.isArray(body?.children)) return fail(400, "validation_error", "children must be an array");
      p.items.push(...body.children.map(stamp));
      return send(200, { object: "list", results: [], has_more: false, next_cursor: null });
    }
    if (req.method === "DELETE" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)$/))) {
      const f = findItem(m[1]);
      if (!f) return fail(404, "object_not_found", "block not found");
      if (f.item.child_page) archive(pages.get(f.item.child_page));
      else f.owner.items.splice(f.index, 1);
      return send(200, { object: "block", id: m[1], archived: true });
    }
    if (req.method === "PATCH" && (m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/))) {
      const p = pages.get(m[1]);
      if (!p) return fail(404, "object_not_found", "page not found");
      if (body?.archived === true) archive(p);
      return send(200, { object: "page", id: p.id, archived: p.archived });
    }
    return fail(404, "invalid_request_url", `no route for ${req.method} ${url.pathname}`);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const live = () => [...pages.values()].filter((p) => p.id !== WIKI_ROOT && !p.archived);
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requests,
    since: (mark) => requests.slice(mark),
    writes: (mark = 0) => requests.slice(mark).filter((q) => ["POST", "PATCH", "DELETE"].includes(q.method)),
    page: (title) => live().find((p) => p.title === title),
    titled: (title) => live().filter((p) => p.title === title),
    archivedPage: (title) => [...pages.values()].find((p) => p.title === title && p.archived),
    childTitles: (id) => listing(pages.get(id)).filter((b) => b.type === "child_page").map((b) => b.child_page.title).sort(),
    // text of the blocks directly on a page (child pages excluded)
    textOf: (id) => pages.get(id).items.filter((it) => !it.child_page).map((b) => plainText(b[b.type]?.rich_text)).join("\n"),
    blocksOf: (id) => pages.get(id).items.filter((it) => !it.child_page),
    close: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

// Async runner: the fake lives in this process, so the CLI must not block the event loop.
function runCliAsync({ cwd, args = [], base, token = PUB_TOKEN }) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^NOTION_/i.test(k) || /^(https?|all)_proxy$/i.test(k)) delete env[k];
  env.NO_PROXY = "127.0.0.1,localhost";
  env.NOTION_API_BASE = base;
  if (token) env.NOTION_API_KEY = token;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("error", reject);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status: status ?? `signal ${signal}`, stdout, stderr });
    });
  });
}

const pageTextWithHead = (audience, checked = "no-ai-slop, humanizer", source = "docs/design.md") =>
  `---\naudience: ${audience}\nsource: ${source}\nchecked: ${checked}\n---\n`;

async function problemsFor(files) {
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-val-"));
  try {
    writeFiles(root, { ".foreman.json": JSON.stringify(PUB_CONFIG), ...files });
    const { loadWikiConfig, collectWikiPages } = await loadLib();
    const { validatePages } = await loadScan();
    const cfg = await loadWikiConfig(root);
    const { pages } = await collectWikiPages(root);
    return validatePages(cfg, pages);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- lib: scanText

await check("lib scanText internal-term: each listed term is a hit (case-insensitive); plain 'brief' is not", async () => {
  const { scanText } = await loadScan();
  const terms = ["Roast", "roadmap", "Fix Pack", "fix-paket", "agent-report", "agent report", "STATE.md", "offene Frage", "open question", "Logiklücke", "logic gap", "needs-input", "milestone brief", "CONTEXT.md"];
  for (const term of terms) {
    const f = scanText(`Erste Zeile\nText mit ${term} hier\nDritte Zeile`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${term}: ${JSON.stringify(f)}`);
  }
  assert.ok(scanText("ROADMAP steht oben.", []).some((x) => x.rule === "internal-term"), "uppercase Roadmap not a hit");
  const clean = scanText("Kurz gesagt, in brief: ein Brief-Format und ein brief text.", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText internal-term: plural, inflected and German/English variants are hits", async () => {
  const { scanText } = await loadScan();
  const terms = ["offene Fragen", "Offene Fragen", "open questions", "Logiklücken", "logic gaps", "Fix-Pakete", "fix packs", "Agent-Reports", "agent reports", "Roadmaps", "Roasts", "needs input", "needs-input"];
  for (const term of terms) {
    const f = scanText(`Erste Zeile\nText mit ${term} hier\nDritte Zeile`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${term}: ${JSON.stringify(f)}`);
  }
  const briefs = scanText("Erste Zeile\nLaut Brief ist es fertig.\nZwei Briefs liegen vor.\n", []);
  assert.ok(briefs.some((x) => x.line === 2 && x.rule === "internal-term"), `Brief: ${JSON.stringify(briefs)}`);
  assert.ok(briefs.some((x) => x.line === 3 && x.rule === "internal-term"), `Briefs: ${JSON.stringify(briefs)}`);
});

await check("lib scanText internal-term: internal repo paths are hits; Briefing and Brief-Format are not", async () => {
  const { scanText } = await loadScan();
  for (const p of ["docs/agent-reports/x.md", "docs/fixpacks/F1.md", "docs/answers/a.md", "docs/role-reviews/x.md", "docs/milestones/M001", "docs/uat/M001.md"]) {
    const f = scanText(`Erste Zeile\nSiehe ${p} dazu\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${p}: ${JSON.stringify(f)}`);
  }
  const clean = scanText("Das Briefing bleibt kurz. Ein Brief-Format gilt.", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText host: IPv4, localhost, internal suffixes, server-<digits>, ssh:// are hits; version numbers are not", async () => {
  const { scanText } = await loadScan();
  for (const term of ["192.168.1.5", "localhost", "printer.internal", "nas.local", "box.lan", "srv.corp", "wiki.intranet", "pc.home", "server-1", "ssh://deploy"]) {
    const f = scanText(`Erste Zeile\nHier ${term} steht\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "host"), `${term}: ${JSON.stringify(f)}`);
  }
  const clean = scanText("Version 2.0 und 1.2 sind da. Der Server ist offline. Nicht im home office.", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText secret: token shapes are hits; short look-alikes are not; a finding never holds the secret", async () => {
  const { scanText } = await loadScan();
  const secrets = [
    ["secret", "AbCdEf1234567890XyZw"].join("_"),
    SECRET,
    SK,
    ["ghp", "abcdefghijklmnopqrstuvwxyz0123"].join("_"),
    BEARER,
    PEM,
    RSA_PEM,
    AWS,
    NOTION_EQ,
    NOTION_COLON,
    SHAPES.githubPat,
    SHAPES.slackBot,
    SHAPES.gitlabPat,
    SHAPES.googleKey,
    SHAPES.jwt,
    SHAPES.passwordLine,
    SHAPES.apiKeyLine,
  ];
  for (const s of secrets) {
    const f = scanText(`Erste Zeile\nWert: ${s}\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "secret"), `${s}: ${JSON.stringify(f)}`);
    assert.ok(!JSON.stringify(f).includes(s), `finding holds the secret text for ${s.slice(0, 8)}`);
  }
  const clean = scanText("secret_kurz, ntn_kurz, sk-kurz, ghp_kurz, Bearer kurz, AKIAkurz, NOTION_API_KEY ohne Wert. Das Geheimnis ist ein Plan.", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText forbidden: a configured term is a hit, case-insensitive; other text is not", async () => {
  const { scanText } = await loadScan();
  const f = scanText("Erste Zeile\nDas gilt für projekt z heute.\n", ["Projekt Z"]);
  assert.ok(f.some((x) => x.line === 2 && x.rule === "forbidden"), JSON.stringify(f));
  assert.deepEqual(scanText("Das gilt für Projekt Y.", ["Projekt Z"]), []);
  assert.ok(!scanText("Das gilt für Projekt Z.", []).some((x) => x.rule === "forbidden"), "forbidden hit with an empty list");
});

await check("lib scanText forbidden: split by a line break, emphasis, hyphen, NBSP or double space still hits", async () => {
  const { scanText } = await loadScan();
  for (const v of ["Projekt Z", "Projekt\nZ", "**Projekt** Z", "Projekt-Z", "Projekt Z", "Projekt  Z"]) {
    const f = scanText(`Erste Zeile\nDas gilt für ${v} heute.\n`, ["Projekt Z"]);
    assert.ok(f.some((x) => x.rule === "forbidden"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText internal-term: German inflected forms are hits; lowercase brief, Briefing and Brief-Format are not", async () => {
  const { scanText } = await loadScan();
  const terms = ["zu den offenen Fragen", "einer offener Frage", "Logik-Lücke", "Logik Lücken", "Briefe", "offene-Fragen"];
  for (const term of terms) {
    const f = scanText(`Erste Zeile\nText mit ${term} hier\nDritte Zeile`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${term}: ${JSON.stringify(f)}`);
  }
  const clean = scanText("Erste Zeile\nEin brief liegt bei.\nDas Briefing bleibt kurz.\nEin Brief-Format gilt.\n", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText markup: bold, code span, zero-width space and 'Fix Pakete' are hits; forbidden through a zero-width space is a hit", async () => {
  const { scanText } = await loadScan();
  const ZW = "​";
  for (const v of ["Road**map**", "Road`map`", `Road${ZW}map`, "Fix Pakete"]) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
  const f = scanText(`Erste Zeile\nDas gilt für Projekt${ZW}Z heute.\n`, ["Projekt Z"]);
  assert.ok(f.some((x) => x.line === 2 && x.rule === "forbidden"), JSON.stringify(f));
});

await check("lib scanText markdown: backslash escapes hide neither an internal term, a host, a token shape nor a forbidden term", async () => {
  const { scanText } = await loadScan();
  const NTN_ESC = ["ntn", "\\_", ALNUM.slice(0, 24)].join(""); // token shape with an escaped underscore, built at runtime
  const cases = [
    ["internal-term", "STATE\\.md", []],
    ["internal-term", "needs\\_input", []],
    ["host", "10\\.0\\.0\\.7", []],
    ["secret", NTN_ESC, []],
    ["forbidden", "Projekt\\-Z", ["Projekt Z"]],
  ];
  for (const [rule, v, forb] of cases) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile`, forb);
    assert.ok(f.some((x) => x.line === 2 && x.rule === rule), `${v}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText markdown: a link split inside a word is joined for the scan; the URL part of a link is scanned", async () => {
  const { scanText } = await loadScan();
  for (const v of ["[Road](https://example.com)map", "Road[map](x)"]) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${v}: ${JSON.stringify(f)}`);
  }
  const h = scanText("Erste Zeile\nSiehe [hier](http://192.168.1.5/x) dazu\n", []);
  assert.ok(h.some((x) => x.line === 2 && x.rule === "host"), `URL host: ${JSON.stringify(h)}`);
});

await check("lib scanText forbidden: whole words only; 'Projekt B' inside 'Das Projekt bietet' or 'Projektbüro' is no hit; spelled forms are", async () => {
  const { scanText } = await loadScan();
  for (const v of ["Das Projekt bietet viel.", "Projektbüro eröffnet."]) {
    const f = scanText(`Erste Zeile\n${v}\n`, ["Projekt B"]);
    assert.ok(!f.some((x) => x.rule === "forbidden"), `${v}: ${JSON.stringify(f)}`);
  }
  for (const v of ["Projekt B", "Projekt-B", "projekt  b", "**Projekt** B"]) {
    const f = scanText(`Erste Zeile\nDas gilt für ${v} heute.\n`, ["Projekt B"]);
    assert.ok(f.some((x) => x.rule === "forbidden"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
  const o = scanText("Erste Zeile\nEin Projekt Quelle kommt.\n", ["Projekt Q"]);
  assert.ok(!o.some((x) => x.rule === "forbidden"), `Projekt Quelle: ${JSON.stringify(o)}`);
  for (const v of ["Projekt Q", "Projekt Qs"]) {
    const f = scanText(`Erste Zeile\nIm ${v} hier.\n`, ["Projekt Q"]);
    assert.ok(f.some((x) => x.rule === "forbidden"), `${v}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText forbidden: a term in a link or image target, or percent-encoded, is a hit; 'projektbuero' in a URL is not", async () => {
  const { scanText } = await loadScan();
  for (const v of ["![Start](img/projekt-b-start.png)", "[Code](https://example.com/owner/projekt-b)", "[x](https://example.com/projekt%20b)", "[x](<projekt b>)"]) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile\n`, ["Projekt B"]);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "forbidden"), `${v}: ${JSON.stringify(f)}`);
  }
  const n = scanText("Erste Zeile\nSiehe [x](https://example.com/projektbuero) hier.\n", ["Projekt B"]);
  assert.ok(!n.some((x) => x.rule === "forbidden"), `projektbuero: ${JSON.stringify(n)}`);
});

await check("lib scanText unicode: non-breaking, soft, minus and dash variants, fullwidth and invisible characters are internal-term hits", async () => {
  const { scanText } = await loadScan();
  const cases = [
    "Fix‑Paket", // non-breaking hyphen
    "needs‑input", // non-breaking hyphen
    "Agent‐Report", // Unicode hyphen
    "Road­map", // soft hyphen
    "Fix−Pakete", // minus sign
    "STATE．md", // fullwidth full stop, NFKC -> STATE.md
    "ｒｏａｄｍａｐ", // fullwidth letters, NFKC -> roadmap
  ];
  for (const v of cases) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText forbidden: 'Projekt Z' with a soft hyphen or U+2011 inside is a hit; a soft hyphen inside 'Spieler' is no hit", async () => {
  const { scanText } = await loadScan();
  for (const v of ["Pro­jekt Z", "Projekt‑Z"]) {
    const f = scanText(`Erste Zeile\nDas gilt für ${v} heute.\n`, ["Projekt Z"]);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "forbidden"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
  const clean = scanText("Erste Zeile\nEin Spie­ler kommt.\n", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText internal-term: 'offen' + word is no hit ('Offenbar fragen', 'offensichtlich'); offene/offenen/offener Frage(n) is", async () => {
  const { scanText } = await loadScan();
  for (const v of ["Offenbar fragen viele Spieler.", "Das ist offensichtlich so."]) {
    const f = scanText(`Erste Zeile\n${v}\nDritte Zeile\n`, []);
    assert.ok(!f.some((x) => x.rule === "internal-term"), `${v}: ${JSON.stringify(f)}`);
  }
  for (const v of ["offene Fragen", "offenen Frage", "offener Fragen"]) {
    const f = scanText(`Erste Zeile\nText mit ${v} hier\nDritte Zeile\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${v}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText link or image title: an internal or forbidden term after the target is a hit, in text and in a heading; a harmless title is no hit", async () => {
  const { scanText } = await loadScan();
  const cases = [
    ["internal-term", '![Screenshot](shot.png "Screenshot of the roadmap")'],
    ["forbidden", "[Download](https://example.com/x Projekt B)"],
    ["internal-term", "[x](a.png 'Fix-Paket')"],
  ];
  for (const [rule, v] of cases) {
    for (const [label, text] of [
      ["text", `Erste Zeile\nText mit ${v} hier\nDritte Zeile\n`],
      ["heading", `Erste Zeile\n# ${v}\nDritte Zeile\n`],
    ]) {
      const f = scanText(text, ["Projekt B"]);
      assert.ok(f.some((x) => x.line === 2 && x.rule === rule), `${label} ${v}: ${JSON.stringify(f)}`);
    }
  }
  const clean = scanText('Erste Zeile\nText mit ![Bild](a.png "Ein Foto vom Spiel") hier\n', ["Projekt B"]);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

await check("lib scanText internal-term: a term split by a line break inside a paragraph is a hit ('Road-\\nmap', 'Fix\\nPaket', 'open\\nquestions')", async () => {
  const { scanText } = await loadScan();
  for (const v of ["Road-\nmap", "Fix\nPaket", "open\nquestions"]) {
    const f = scanText(`Erste Zeile\nEin Absatz mit ${v} hier, weiter im Text.\nDritte Zeile\n`, []);
    assert.ok(f.some((x) => x.rule === "internal-term"), `${JSON.stringify(v)}: ${JSON.stringify(f)}`);
  }
});

await check("lib scanText internal-term: 'den Briefen' and standalone 'BRIEF' are hits; lowercase 'brief' stays clean", async () => {
  const { scanText } = await loadScan();
  for (const v of ["In den Briefen steht es.", "Der Auftrag steht im BRIEF."]) {
    const f = scanText(`Erste Zeile\n${v}\nDritte Zeile\n`, []);
    assert.ok(f.some((x) => x.line === 2 && x.rule === "internal-term"), `${v}: ${JSON.stringify(f)}`);
  }
  const clean = scanText("Erste Zeile\nEin brief liegt bei, siehe das Briefing.\n", []);
  assert.deepEqual(clean, [], JSON.stringify(clean));
});

// ---- lib: validatePages

await check("lib validatePages: a clean page in an audience folder gives no problem", async () => {
  const probs = await problemsFor({ "docs/wiki/spieler-und-tester/start.md": START_MD });
  assert.deepEqual(probs, [], JSON.stringify(probs));
});

await check("lib validatePages: page directly in docs/wiki -> 'page not in an audience folder'", async () => {
  const probs = await problemsFor({ "docs/wiki/willkommen.md": pageTextWithHead("Spieler und Tester") + "# Willkommen\n\nText.\n" });
  const p = probs.find((x) => x.path.endsWith("willkommen.md"));
  assert.ok(p && p.problem.includes("page not in an audience folder"), JSON.stringify(probs));
});

await check("lib validatePages: page without head -> 'no head'", async () => {
  const probs = await problemsFor({ "docs/wiki/spieler-und-tester/plain.md": LOOSE_MD });
  const p = probs.find((x) => x.path.endsWith("plain.md"));
  assert.ok(p && p.problem.includes("no head"), JSON.stringify(probs));
});

await check("lib validatePages: empty or unknown audience -> 'unknown audience'", async () => {
  const probs = await problemsFor({
    "docs/wiki/spieler-und-tester/unbekannt.md": pageTextWithHead("Anderes") + "# X\n\nText.\n",
    "docs/wiki/spieler-und-tester/leer.md": pageTextWithHead("") + "# Y\n\nText.\n",
  });
  for (const name of ["unbekannt.md", "leer.md"]) {
    const p = probs.find((x) => x.path.endsWith(name));
    assert.ok(p && p.problem.includes("unknown audience"), `${name}: ${JSON.stringify(probs)}`);
  }
});

await check("lib validatePages: folder other than the audience slug -> 'folder does not match audience'", async () => {
  const probs = await problemsFor({ "docs/wiki/anderes/x.md": pageTextWithHead("Spieler und Tester") + "# X\n\nText.\n" });
  const p = probs.find((x) => x.path.endsWith("x.md"));
  assert.ok(p && p.problem.includes("folder does not match audience"), JSON.stringify(probs));
});

await check("lib validatePages: empty source -> 'no source'", async () => {
  const probs = await problemsFor({ "docs/wiki/spieler-und-tester/quelle.md": pageTextWithHead("Spieler und Tester", "no-ai-slop, humanizer", "") + "# Q\n\nText.\n" });
  const p = probs.find((x) => x.path.endsWith("quelle.md"));
  assert.ok(p && p.problem.includes("no source"), JSON.stringify(probs));
});

await check("lib validatePages: checked without no-ai-slop or without humanizer -> 'text check missing'", async () => {
  const probs = await problemsFor({
    "docs/wiki/spieler-und-tester/ohne-humanizer.md": pageTextWithHead("Spieler und Tester", "no-ai-slop") + "# A\n\nText.\n",
    "docs/wiki/spieler-und-tester/ohne-slop.md": pageTextWithHead("Spieler und Tester", "humanizer") + "# B\n\nText.\n",
  });
  for (const name of ["ohne-humanizer.md", "ohne-slop.md"]) {
    const p = probs.find((x) => x.path.endsWith(name));
    assert.ok(p && p.problem.includes("text check missing"), `${name}: ${JSON.stringify(probs)}`);
  }
});

// ---- CLI: publish

await check("cli --wiki publish: audience page, two child pages, head not in page content, summary line", async () => {
  const root = pubProject();
  const fake = await startWikiFake();
  try {
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    assert.equal(lastLine(r.stdout), "created 3, updated 0, archived 0, unchanged 0", info(r));
    noToken(r);
    assert.deepEqual(fake.childTitles(WIKI_ROOT), ["Spieler und Tester"], info(r));
    const aud = fake.page("Spieler und Tester");
    assert.ok(aud, "audience page missing");
    assert.deepEqual(fake.childTitles(aud.id), ["Spielen", "Start"]);
    assert.ok(fake.blocksOf(aud.id).some((b) => String(b.type).startsWith("heading") && plainText(b[b.type]?.rich_text).includes("Spieler und Tester")), "no heading with the audience name");
    assert.ok(fake.textOf(aud.id).includes("Spielende und Testende"), "no audience description");
    const start = fake.page("Start");
    const spielen = fake.page("Spielen");
    assert.equal(start.parent, aud.id);
    assert.equal(spielen.parent, aud.id);
    assert.ok(fake.textOf(start.id).includes("Invented welcome text for players"), "start body missing");
    assert.ok(fake.textOf(spielen.id).includes("Invented text about playing"), "spielen body missing");
    for (const id of [aud.id, start.id, spielen.id]) {
      assert.ok(!/audience:|source:|checked:/.test(fake.textOf(id)), `head text in page content: ${fake.textOf(id)}`);
    }
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki publish: second run unchanged, body change updated, deleted file archived", async () => {
  const root = pubProject();
  const fake = await startWikiFake();
  try {
    const first = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(first.status, 0, info(first));

    const mark = fake.requests.length;
    const second = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(second.status, 0, info(second));
    assert.equal(lastLine(second.stdout), "created 0, updated 0, archived 0, unchanged 3", info(second));
    assert.equal(fake.since(mark).filter((q) => q.method === "POST").length, 0, "second run created pages");

    writeFiles(root, { "docs/wiki/spieler-und-tester/start.md": HEAD + "# Start\n\nInvented welcome text, changed.\n" });
    const third = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(third.status, 0, info(third));
    assert.equal(lastLine(third.stdout), "created 0, updated 1, archived 0, unchanged 2", info(third));
    assert.ok(fake.textOf(fake.page("Start").id).includes("changed"), "body change not published");

    rmSync(join(root, "docs/wiki/spieler-und-tester/spielen.md"));
    const fourth = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(fourth.status, 0, info(fourth));
    assert.equal(lastLine(fourth.stdout), "created 0, updated 0, archived 1, unchanged 2", info(fourth));
    assert.ok(fake.archivedPage("Spielen"), "deleted file's page not archived");
    assert.equal(fake.page("Spielen"), undefined, "deleted file's page still live");
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki publish: first block of every page is the marker paragraph, without .md, docs/wiki or the slug path", async () => {
  const root = pubProject();
  const fake = await startWikiFake();
  try {
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    const aud = fake.page("Spieler und Tester");
    const ids = [aud.id, ...fake.childTitles(aud.id).map((t) => fake.page(t).id)];
    assert.equal(ids.length, 3, info(r));
    for (const id of ids) {
      const first = fake.blocksOf(id)[0];
      assert.ok(first, `page ${id} has no blocks`);
      assert.equal(first.type, "paragraph", `first block of ${id} is ${first.type}`);
      const text = plainText(first.paragraph?.rich_text);
      assert.ok(text.trim(), `marker paragraph of ${id} is empty`);
      for (const bad of [".md", "docs/wiki", "spieler-und-tester"]) assert.ok(!text.includes(bad), `marker of ${id} holds ${bad}: ${text}`);
    }
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki titles: same heading in two audiences -> '<heading> (<audience>)'; audience pages take the audience name", async () => {
  const cfg = {
    ...PUB_CONFIG,
    wiki: {
      ...PUB_CONFIG.wiki,
      audiences: [
        { name: "Spieler und Tester", description: "Spielende und Testende" },
        { name: "Presse", description: "Medien" },
      ],
    },
  };
  const root = pubProject({
    ".foreman.json": JSON.stringify(cfg, null, 2),
    "docs/wiki/presse/start.md": pageTextWithHead("Presse") + "# Start\n\nInvented press text.\n",
  });
  const fake = await startWikiFake();
  try {
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    assert.deepEqual(fake.childTitles(WIKI_ROOT), ["Presse", "Spieler und Tester"], info(r));
    const sp = fake.page("Spieler und Tester");
    const pr = fake.page("Presse");
    assert.ok(sp && pr, info(r));
    assert.deepEqual(fake.childTitles(sp.id), ["Spielen", "Start (Spieler und Tester)"], info(r));
    assert.deepEqual(fake.childTitles(pr.id), ["Start (Presse)"], info(r));
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki titles: page heading equal to an audience name -> '<heading> (<audience>)'; second run unchanged, nothing archived", async () => {
  const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, audiences: [{ name: "Spieler", description: "Spielende" }] } };
  const root = mkdtempSync(join(tmpdir(), "docs-wiki-titles-"));
  writeFiles(root, {
    ".foreman.json": JSON.stringify(cfg, null, 2),
    "docs/wiki/spieler/spieler.md": pageTextWithHead("Spieler") + "# Spieler\n\nInvented text for players.\n",
    "docs/roadmap.md": "# Roadmap\n\nInternal plan.\n",
  });
  const fake = await startWikiFake();
  try {
    const first = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(first.status, 0, info(first));
    assert.equal(lastLine(first.stdout), "created 2, updated 0, archived 0, unchanged 0", info(first));
    const aud = fake.page("Spieler");
    assert.ok(aud, `audience page 'Spieler' missing\n${info(first)}`);
    assert.deepEqual(fake.childTitles(aud.id), ["Spieler (Spieler)"], info(first));

    const mark = fake.requests.length;
    const second = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(second.status, 0, info(second));
    assert.equal(lastLine(second.stdout), "created 0, updated 0, archived 0, unchanged 2", info(second));
    const archives = fake.since(mark).filter((q) => q.method === "PATCH" || q.method === "DELETE");
    assert.equal(archives.length, 0, "second run sent PATCH or DELETE requests");
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const dry of [false, true]) {
  await check(`cli --wiki titles: heading equal to an audience name and the suffixed title already taken -> 'duplicate title', exit 4, no writes${dry ? " (--dry-run)" : ""}`, async () => {
    const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, audiences: [{ name: "Spieler", description: "Spielende" }] } };
    const root = mkdtempSync(join(tmpdir(), "docs-wiki-titles-"));
    writeFiles(root, {
      ".foreman.json": JSON.stringify(cfg, null, 2),
      "docs/wiki/spieler/spieler.md": pageTextWithHead("Spieler") + "# Spieler\n\nInvented text one.\n",
      "docs/wiki/spieler/doppelt.md": pageTextWithHead("Spieler") + "# Spieler (Spieler)\n\nInvented text two.\n",
      "docs/roadmap.md": "# Roadmap\n\nInternal plan.\n",
    });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.ok(r.stderr.includes("duplicate title"), `problem not named\n${info(r)}`);
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

await check("cli --wiki titles: page without a heading takes its file name without .md", async () => {
  const root = pubProject({ "docs/wiki/spieler-und-tester/ohne-titel.md": HEAD + "Text ohne Überschrift.\n" });
  const fake = await startWikiFake();
  try {
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    const aud = fake.page("Spieler und Tester");
    assert.deepEqual(fake.childTitles(aud.id), ["Spielen", "Start", "ohne-titel"], info(r));
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const dry of [false, true]) {
  await check(`cli --wiki titles: two pages of one audience with the same title -> 'duplicate title', exit 4, no writes${dry ? " (--dry-run)" : ""}`, async () => {
    const root = pubProject({
      "docs/wiki/spieler-und-tester/erste.md": HEAD + "# Gleich\n\nInvented text one.\n",
      "docs/wiki/spieler-und-tester/zweite.md": HEAD + "# Gleich\n\nInvented text two.\n",
    });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.ok(r.stderr.includes("duplicate title"), `problem not named\n${info(r)}`);
      assert.ok(/spieler-und-tester\/(erste|zweite)\.md/.test(r.stderr), `no page named\n${info(r)}`);
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

await check("cli --wiki --dry-run: clean wiki exits 0 and lists both pages", async () => {
  const root = pubProject();
  try {
    const r = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root], token: "" });
    assert.equal(r.status, 0, info(r));
    const sync = r.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("sync "));
    assert.equal(sync.length, 2, info(r));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli same root: wiki.rootPageId equal to docsNotion.rootPageId -> --wiki and the mirror exit 2 'same root page', zero requests", async () => {
  const cfg = { ...PUB_CONFIG, docsNotion: { ...PUB_CONFIG.docsNotion, rootPageId: WIKI_ROOT } };
  const root = pubProject({ ".foreman.json": JSON.stringify(cfg, null, 2) });
  const fake = await startWikiFake();
  try {
    for (const args of [["--wiki", "--root", root], ["--root", root]]) {
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 2, `${args.join(" ")}: ${info(r)}`);
      assert.ok(r.stderr.includes("same root page"), `${args.join(" ")}: ${info(r)}`);
      noToken(r);
    }
    assert.equal(fake.requests.length, 0, "requests sent");
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli same root: ids equal after dashes are removed and case is ignored -> --wiki and the mirror exit 2 'same root page', zero requests", async () => {
  const pairs = [
    ["0123456789abcdef0123456789abcdef", "0123456789ABCDEF0123456789ABCDEF"],
    ["0123456789abcdef0123456789abcdef", "0123-4567-89ab-cdef-0123-4567-89AB-CDEF"],
  ];
  for (const [wikiId, docsId] of pairs) {
    const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, rootPageId: wikiId }, docsNotion: { ...PUB_CONFIG.docsNotion, rootPageId: docsId } };
    const root = pubProject({ ".foreman.json": JSON.stringify(cfg, null, 2) });
    const fake = await startWikiFake();
    try {
      for (const args of [["--wiki", "--root", root], ["--root", root]]) {
        const r = await runCliAsync({ cwd: root, args, base: fake.base });
        assert.equal(r.status, 2, `${wikiId} / ${docsId} ${args.join(" ")}: ${info(r)}`);
        assert.ok(r.stderr.includes("same root page"), `${wikiId} / ${docsId} ${args.join(" ")}: ${info(r)}`);
        noToken(r);
      }
      assert.equal(fake.requests.length, 0, `${wikiId} / ${docsId}: requests sent`);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

await check("cli --wiki publish: page file 'Start.MD' (uppercase extension) is published with its heading as title, counted, and listed in the dry run", async () => {
  const root = pubProject({ "docs/wiki/spieler-und-tester/Start.MD": HEAD + "# Willkommen\n\nInvented welcome text for players.\n" });
  rmSync(join(root, "docs/wiki/spieler-und-tester/start.md"));
  const fake = await startWikiFake();
  try {
    const dry = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root], token: "" });
    assert.equal(dry.status, 0, info(dry));
    const lines = dry.stdout.split("\n").map((l) => l.trim());
    assert.ok(lines.includes("sync docs/wiki/spieler-und-tester/Start.MD (audience: Spieler und Tester)"), `not listed in dry run\n${info(dry)}`);
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    assert.equal(lastLine(r.stdout), "created 3, updated 0, archived 0, unchanged 0", info(r));
    const aud = fake.page("Spieler und Tester");
    assert.ok(aud, info(r));
    assert.deepEqual(fake.childTitles(aud.id), ["Spielen", "Willkommen"], info(r));
    assert.ok(fake.textOf(fake.page("Willkommen").id).includes("Invented welcome text for players"), "body of Start.MD missing");
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki publish: human-made pages under the wiki root are left alone; clash named 'not mirrored'; second run stable", async () => {
  const root = pubProject();
  const seed = [
    ["foreign-aud-1", "Spieler und Tester", "Von Hand geschriebene Seite, invented."],
    ["foreign-faq-1", "FAQ", "Von Hand geschriebene FAQ, invented."],
  ];
  const fake = await startWikiFake({ seed });
  try {
    const r1 = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r1.status, 0, info(r1));
    assert.ok(r1.stderr.includes("not mirrored"), `clash not named on stderr\n${info(r1)}`);
    assert.equal(lastLine(r1.stdout), "created 3, updated 0, archived 0, unchanged 0", info(r1));
    const touched = fake.requests.filter((q) => ["PATCH", "DELETE"].includes(q.method) && (q.path.includes("foreign-aud-1") || q.path.includes("foreign-faq-1")));
    assert.equal(touched.length, 0, `foreign page touched: ${JSON.stringify(touched)}`);
    assert.equal(fake.textOf("foreign-aud-1"), "Von Hand geschriebene Seite, invented.", "foreign page content changed");
    assert.equal(fake.textOf("foreign-faq-1"), "Von Hand geschriebene FAQ, invented.", "foreign FAQ content changed");
    assert.deepEqual(fake.childTitles("foreign-aud-1"), [], "pages added under the foreign page");
    assert.deepEqual(fake.childTitles("foreign-faq-1"), [], "pages added under the foreign FAQ");
    const own = fake.titled("Spieler und Tester").filter((p) => p.id !== "foreign-aud-1");
    assert.equal(own.length, 1, info(r1));
    assert.deepEqual(fake.childTitles(own[0].id), ["Spielen", "Start"], info(r1));

    const posts = () => fake.requests.filter((q) => q.method === "POST").length;
    const before = posts();
    const mark = fake.requests.length;
    const r2 = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r2.status, 0, info(r2));
    assert.equal(lastLine(r2.stdout), "created 0, updated 0, archived 0, unchanged 3", info(r2));
    assert.equal(fake.since(mark).filter((q) => q.method === "POST").length, 0, "second run created pages");
    assert.equal(posts(), before, "duplicates created");
    assert.equal(fake.titled("Spieler und Tester").length, 2, "audience page count changed");
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- CLI: scan blocks the whole publish

const SCAN_CASES = [
  ["internal term Roast", "Das Roast ist fertig.", "internal-term", null],
  ["internal term offene Frage", "Hier bleibt eine offene Frage.", "internal-term", null],
  ["internal term STATE.md", "Siehe STATE.md dazu.", "internal-term", null],
  ["host IPv4", "Der Dienst antwortet unter 192.168.1.5.", "host", null],
  ["host server-1", "Lauf auf server-1 heute.", "host", null],
  ["secret ntn_ token", `Token: ${SECRET}`, "secret", SECRET],
  ["forbidden Projekt Z", "Das gilt für Projekt Z.", "forbidden", null],
];
for (const [label, text, rule, secret] of SCAN_CASES) {
  await check(`cli --wiki scan: ${label} -> exit 4, no writes, file and rule named (also --dry-run)`, async () => {
    const root = pubProject({ "docs/wiki/spieler-und-tester/bad.md": HEAD + `# Bad\n\n${text}\n` });
    const fake = await startWikiFake();
    try {
      for (const dry of [false, true]) {
        const args = ["--wiki", "--root", root];
        if (dry) args.push("--dry-run");
        const mark = fake.requests.length;
        const r = await runCliAsync({ cwd: root, args, base: fake.base });
        const tag = dry ? "dry-run" : "publish";
        assert.equal(r.status, 4, `${tag}: ${info(r)}`);
        assert.equal(fake.writes(mark).length, 0, `${tag}: writes sent`);
        assert.ok(r.stderr.includes("docs/wiki/spieler-und-tester/bad.md"), `${tag}: file not named\n${info(r)}`);
        assert.ok(r.stderr.includes(rule), `${tag}: rule ${rule} not named\n${info(r)}`);
        noToken(r);
        if (secret) assert.ok(!r.stdout.includes(secret) && !r.stderr.includes(secret), `${tag}: secret printed\n${info(r)}`);
      }
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

await check("cli --wiki scan: a file name below docs/wiki with a hit -> exit 4, no writes, path named (also --dry-run)", async () => {
  const path = "docs/wiki/spieler-und-tester/server-1-roadmap.md";
  const root = pubProject({ [path]: HEAD + "# Netz\n\nInvented text.\n" });
  const fake = await startWikiFake();
  try {
    for (const dry of [false, true]) {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      const tag = dry ? "dry-run" : "publish";
      assert.equal(r.status, 4, `${tag}: ${info(r)}`);
      assert.equal(fake.writes(mark).length, 0, `${tag}: writes sent`);
      assert.ok(r.stderr.includes(path), `${tag}: path not named\n${info(r)}`);
      noToken(r);
    }
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const dry of [false, true]) {
  await check(`cli --wiki scan: heading with markup around a hit (Road-backtick-map-backtick) -> exit 4, no writes, file and rule named${dry ? " (--dry-run)" : ""}`, async () => {
    const root = pubProject({ "docs/wiki/spieler-und-tester/titel.md": HEAD + "# Road`map`\n\nInvented text.\n" });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      assert.ok(r.stderr.includes("titel.md"), `file not named\n${info(r)}`);
      assert.ok(r.stderr.includes("internal-term"), `rule not named\n${info(r)}`);
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const [label, name] of [
  ["internal term", "[x](a roadmap).md"],
  ["forbidden term", "[x](Projekt Z).md"],
]) {
  for (const dry of [false, true]) {
    await check(`cli --wiki scan: page file name with a ${label} in link syntax -> exit 4, no writes, path named${dry ? " (--dry-run)" : ""}`, async () => {
      const path = `docs/wiki/spieler-und-tester/${name}`;
      const root = pubProject({ [path]: HEAD + "# Netz\n\nInvented text.\n" });
      const fake = await startWikiFake();
      try {
        const args = ["--wiki", "--root", root];
        if (dry) args.push("--dry-run");
        const mark = fake.requests.length;
        const r = await runCliAsync({ cwd: root, args, base: fake.base });
        assert.equal(r.status, 4, info(r));
        assert.equal(fake.writes(mark).length, 0, "writes sent");
        assert.ok(r.stderr.includes(path), `path not named\n${info(r)}`);
        noToken(r);
      } finally {
        await fake.close();
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

// ---- CLI: error output never shows a secret-shaped name

const TOKEN_STEM = ["ghp", ALNUM.slice(0, 30)].join("_"); // token-shaped page name, built at runtime
for (const dry of [false, true]) {
  await check(`cli --wiki validation: page file named like a token, head without checked -> exit 4, the name never printed${dry ? " (--dry-run)" : ""}`, async () => {
    const root = pubProject({ [`docs/wiki/spieler-und-tester/${TOKEN_STEM}.md`]: "---\naudience: Spieler und Tester\nsource: docs/design.md\n---\n# Netz\n\nText.\n" });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      assert.ok(r.stderr.includes("text check missing"), `problem not named\n${info(r)}`);
      assert.ok(!r.stdout.includes(TOKEN_STEM) && !r.stderr.includes(TOKEN_STEM), `token-shaped name printed\n${info(r)}`);
      assert.ok(r.stderr.includes("<hidden: secret in name>"), `file named with a token shape not masked\n${info(r)}`);
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const dry of [false, true]) {
  await check(`cli --wiki validation: audience name shaped like a token is never printed, head without checked -> exit 4${dry ? " (--dry-run)" : ""}`, async () => {
    const name = SHAPES.githubPat;
    const { audienceSlug } = await loadLib();
    const slug = audienceSlug(name);
    const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, audiences: [{ name, description: "Test" }] } };
    const root = pubProject({
      ".foreman.json": JSON.stringify(cfg, null, 2),
      [`docs/wiki/${slug}/bad.md`]: `---\naudience: ${name}\nsource: docs/design.md\n---\n# Bad\n\nText.\n`,
    });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      assert.ok(r.stderr.includes("text check missing"), `problem not named\n${info(r)}`);
      assert.ok(!r.stdout.includes(name) && !r.stderr.includes(name), `audience name printed\n${info(r)}`);
      const dashed = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      for (const form of new Set([slug, dashed])) {
        assert.ok(!r.stdout.includes(form) && !r.stderr.includes(form), `audience slug form ${form} printed\n${info(r)}`);
      }
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---- CLI: audience name and description are scanned

for (const dry of [false, true]) {
  await check(`cli --wiki scan: audience description with an internal term -> exit 4, 'audience <name>' and internal-term named, no writes${dry ? " (--dry-run)" : ""}`, async () => {
    const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, audiences: [{ name: "Spieler und Tester", description: "Roadmap für Spielende und Testende" }] } };
    const root = pubProject({ ".foreman.json": JSON.stringify(cfg, null, 2) });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.ok(r.stderr.includes("audience Spieler und Tester"), `audience not named\n${info(r)}`);
      assert.ok(r.stderr.includes("internal-term"), `rule not named\n${info(r)}`);
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check(`cli --wiki scan: audience name with a forbidden term -> exit 4, 'audience <name>' and forbidden named, no writes${dry ? " (--dry-run)" : ""}`, async () => {
    const cfg = { ...PUB_CONFIG, wiki: { ...PUB_CONFIG.wiki, audiences: [{ name: "Spieler und Tester", description: "Spielende" }, { name: "Projekt Z", description: "Spielende" }] } };
    const root = pubProject({ ".foreman.json": JSON.stringify(cfg, null, 2), "docs/wiki/projekt-z/x.md": pageTextWithHead("Projekt Z") + "# X\n\nInvented text.\n" });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.ok(r.stderr.includes("audience Projekt Z"), `audience not named\n${info(r)}`);
      assert.ok(r.stderr.includes("forbidden"), `rule not named\n${info(r)}`);
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const dry of [false, true]) {
  await check(`cli --wiki validation: pages a.md and a.MD in one audience folder -> 'duplicate file name', exit 4, no writes${dry ? " (--dry-run)" : ""}`, async () => {
    const root = pubProject({
      "docs/wiki/spieler-und-tester/a.md": HEAD + "# A\n\nInvented text.\n",
      "docs/wiki/spieler-und-tester/a.MD": HEAD + "# A2\n\nInvented text.\n",
    });
    const fake = await startWikiFake();
    try {
      const args = ["--wiki", "--root", root];
      if (dry) args.push("--dry-run");
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args, base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      assert.ok(r.stderr.includes("duplicate file name"), `problem not named\n${info(r)}`);
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

await check("cli --wiki publish: last page deleted -> audience page and page archived by PATCH, summary 'archived 2', exit 0", async () => {
  const root = pubProject();
  rmSync(join(root, "docs/wiki/spieler-und-tester/spielen.md"));
  const fake = await startWikiFake();
  try {
    const first = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(first.status, 0, info(first));
    assert.equal(lastLine(first.stdout), "created 2, updated 0, archived 0, unchanged 0", info(first));

    rmSync(join(root, "docs/wiki/spieler-und-tester/start.md"));
    const mark = fake.requests.length;
    const second = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(second.status, 0, info(second));
    assert.equal(lastLine(second.stdout), "created 0, updated 0, archived 2, unchanged 0", info(second));
    const archives = fake.since(mark).filter((q) => q.method === "PATCH" && q.path.startsWith("/v1/pages/"));
    assert.equal(archives.length, 2, `PATCH archived requests\n${info(second)}`);
    assert.ok(fake.archivedPage("Start"), "page not archived");
    assert.ok(fake.archivedPage("Spieler und Tester"), "audience page not archived");
    assert.equal(fake.page("Start"), undefined, "page still live");
    assert.equal(fake.page("Spieler und Tester"), undefined, "audience page still live");
    noToken(second);
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli --wiki publish: no pages and nothing published before -> 'nothing to publish', exit 0, no write requests; dry run the same", async () => {
  const root = pubProject();
  rmSync(join(root, "docs/wiki/spieler-und-tester/start.md"));
  rmSync(join(root, "docs/wiki/spieler-und-tester/spielen.md"));
  const fake = await startWikiFake();
  try {
    const mark = fake.requests.length;
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 0, info(r));
    assert.ok(r.stdout.includes("nothing to publish"), info(r));
    assert.equal(fake.writes(mark).length, 0, "write requests sent");
    const d = await runCliAsync({ cwd: root, args: ["--wiki", "--dry-run", "--root", root], base: fake.base });
    assert.equal(d.status, 0, info(d));
    assert.ok(d.stdout.includes("nothing to publish"), info(d));
    assert.equal(fake.writes(mark).length, 0, "dry run sent write requests");
    noToken(r);
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- CLI: validation failures

const VALIDATION_CASES = [
  ["unknown audience", "docs/wiki/spieler-und-tester/bad.md", "---\naudience: Anderes\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
  ["missing audience", "docs/wiki/spieler-und-tester/bad.md", "---\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
  ["missing humanizer", "docs/wiki/spieler-und-tester/bad.md", "---\naudience: Spieler und Tester\nsource: docs/design.md\nchecked: no-ai-slop\n---\n# Bad\n\nText.\n", "text check missing"],
  ["folder mismatch", "docs/wiki/anderes/bad.md", "---\naudience: Spieler und Tester\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "folder does not match audience"],
  ["no head", "docs/wiki/spieler-und-tester/bad.md", "# Bad\n\nNo head here.\n", "no head"],
  ["audience not in config (folder anderes)", "docs/wiki/anderes/bad.md", "---\naudience: Anderes\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
  ["page directly in docs/wiki", "docs/wiki/willkommen.md", HEAD + "# Willkommen\n\nText.\n", "page not in an audience folder"],
];
for (const [label, path, text, phrase] of VALIDATION_CASES) {
  for (const dry of [false, true]) {
    await check(`cli --wiki validation: ${label}${dry ? " (--dry-run)" : ""} -> exit 4, no writes, file and problem named`, async () => {
      const root = pubProject({ [path]: text });
      const fake = await startWikiFake();
      try {
        const args = ["--wiki", "--root", root];
        if (dry) args.push("--dry-run");
        const mark = fake.requests.length;
        const r = await runCliAsync({ cwd: root, args, base: fake.base });
        assert.equal(r.status, 4, info(r));
        assert.equal(fake.writes(mark).length, 0, "writes sent");
        if (dry) assert.ok(!r.stdout.split("\n").some((l) => l.trim().startsWith("sync ")), `sync line on stdout\n${info(r)}`);
        assert.ok(r.stderr.includes(path), `file not named\n${info(r)}`);
        assert.ok(r.stderr.includes(phrase), `problem not named\n${info(r)}`);
        noToken(r);
      } finally {
        await fake.close();
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

// ---- CLI: token safety and the mirror split

await check("cli --wiki publish: API answers 401 to every request -> exit 1, error reported, token not printed", async () => {
  const root = pubProject();
  const fake = await startWikiFake({ token: "some-other-token" });
  try {
    const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(r.status, 1, info(r));
    assert.ok(r.stderr.trim().length > 0, "no error reported");
    assert.ok(fake.requests.some((q) => q.status === 401), "fake never answered 401");
    assert.equal(fake.writes().length, 0, "writes sent");
    noToken(r);
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

await check("cli mirror (no --wiki) --dry-run never lists docs/wiki; --wiki never lists docs/roadmap.md or other internal docs", async () => {
  const root = pubProject();
  try {
    const m = runCli({ cwd: root, args: ["--dry-run", "--root", root], token: "" });
    assert.equal(m.status, 0, info(m));
    assert.ok(m.stdout.includes("roadmap"), `mirror did not list the internal docs (sanity)\n${info(m)}`);
    assert.ok(!m.stdout.includes("docs/wiki/"), `mirror listed a wiki page\n${info(m)}`);
    const w = runCli({ cwd: root, args: ["--wiki", "--dry-run", "--root", root], token: "" });
    assert.equal(w.status, 0, info(w));
    assert.ok(!w.stdout.includes("roadmap") && !w.stdout.includes("requirements"), `--wiki listed an internal doc\n${info(w)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [label, rel, pattern] of [
  ["folder docs/Wiki/", "docs/Wiki/mirror-only.md", /wiki\/mirror-only\.md/i],
  ["file docs/WIKI/x.md", "docs/WIKI/x.md", /wiki\/x\.md/i],
]) {
  await check(`cli mirror (no --wiki) --dry-run: ${label} is excluded like docs/wiki (case-insensitive)`, async () => {
    const root = pubProject({ [rel]: "# Mirror\n\nInvented text.\n" });
    try {
      const m = runCli({ cwd: root, args: ["--dry-run", "--root", root], token: "" });
      assert.equal(m.status, 0, info(m));
      assert.ok(m.stdout.includes("roadmap"), `mirror did not list the internal docs (sanity)\n${info(m)}`);
      assert.ok(!pattern.test(m.stdout), `mirror listed ${rel}\n${info(m)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

await check("hook contains no --wiki", async () => {
  const f = join(HERE, "post-merge.d", "docs-notion.sh");
  assert.ok(!readFileSync(f, "utf8").includes("--wiki"), `${f} contains --wiki`);
});

await checkIfInstalled("batch run contains no --wiki", join(HERE, "..", ".claude", "skills", "foreman-dispatch-run", "references", "batch-run.md"), (text) => {
  assert.ok(!text.includes("--wiki"), "batch-run.md contains --wiki");
});

// ---------------------------------------------------------------- skill and docs
// --lib-only skips these two checks (the skill and docs/MODULES.md are written separately).

if (!process.argv.includes("--lib-only")) {
  await check("skill foreman-wiki: SKILL.md exists and names the required terms", async () => {
    const text = readFileSync(SKILL, "utf8");
    for (const word of ["docs/wiki/", "no-ai-slop", "humanizer", "source", "audience", "--wiki", "Never invent", "internal docs"]) {
      assert.ok(text.includes(word), `SKILL.md does not mention ${word}`);
    }
  });

  // Runs only in a foreman checkout (install.sh at the repo root); an installed project prints the skip line.
  if (!existsSync(INSTALL_SH)) {
    console.log("ok docs/MODULES.md mentions --wiki (skipped: not a foreman checkout)");
  } else {
    await check("docs/MODULES.md mentions --wiki", () => {
      assert.ok(readFileSync(MODULES, "utf8").includes("--wiki"), "docs/MODULES.md does not mention --wiki");
    });
  }

  // Gate self-check: a copy of this file in a tree without install.sh must print the skip line.
  // DOCS_WIKI_NESTED stops the copy from running this check again.
  if (!process.env.DOCS_WIKI_NESTED) {
    await check("gate: docs/MODULES.md check prints 'skipped: not a foreman checkout' when install.sh is missing", () => {
      const tmp = mkdtempSync(join(tmpdir(), "docs-wiki-plain-"));
      try {
        const scripts = join(tmp, "template", "scripts");
        mkdirSync(scripts, { recursive: true });
        const copy = join(scripts, "test-docs-wiki.mjs");
        copyFileSync(fileURLToPath(import.meta.url), copy);
        const r = spawnSync(process.execPath, [copy], { cwd: tmp, env: { ...process.env, DOCS_WIKI_NESTED: "1" }, encoding: "utf8", timeout: 120000 });
        const stdout = r.stdout ?? "";
        assert.ok(stdout.includes("ok docs/MODULES.md mentions --wiki (skipped: not a foreman checkout)"), `no skip line\n${stdout}\n${r.stderr ?? ""}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
}

if (failed) {
  console.log(`docs-wiki tests: ${failed} failed`);
  process.exitCode = 1;
} else {
  console.log("docs-wiki tests: ok");
}

#!/usr/bin/env node
// Tests for the docs wiki: the library scripts/lib/docs-wiki.mjs, the CLI flag --wiki of
// scripts/docs-notion.mjs, the skill foreman-wiki and the module docs. Run: node scripts/test-docs-wiki.mjs
// Black-box where possible; the CLI runs as a child process, no network (dry-run or fail before any request).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const plainText = (rt = []) => rt.map((r) => r.text?.content ?? r.plain_text ?? "").join("");
const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "lib", "docs-wiki.mjs");
const CLI = join(HERE, "docs-notion.mjs");
const SKILL = join(HERE, "..", ".claude", "skills", "foreman-wiki", "SKILL.md");
const MODULES = join(HERE, "..", "..", "docs", "MODULES.md");
const DEAD_BASE = "http://127.0.0.1:9";
const FAKE_TOKEN = "ntn_TEST_FAKE_TOKEN_WIKI_12345";

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

// ---------------------------------------------------------------- scan and publish
// Lib scan/validate cases and CLI publish cases. They fail until lib/docs-wiki-scan.mjs and --wiki publishing exist.

const SCAN = join(HERE, "lib", "docs-wiki-scan.mjs");
const loadScan = () => import(pathToFileURL(SCAN).href);
const WIKI_ROOT = "wiki-root";
const PUB_TOKEN = "fake-token-123456789";
const SECRET = ["ntn", "Q7xKm2Lp9Rt4Wz8Yc3Vb"].join("_"); // invented; built at runtime so the privacy scan sees no token shape in the file
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
async function startWikiFake({ token = PUB_TOKEN } = {}) {
  let seq = 0;
  const newId = (p) => `${p}-${++seq}`;
  const pages = new Map();
  pages.set(WIKI_ROOT, { id: WIKI_ROOT, title: "Wiki", parent: null, archived: false, items: [] });
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
    return validatePages(loadWikiConfig(root), collectWikiPages(root).pages);
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
    "sk-abcdefghijklmnopqrstu",
    ["ghp", "abcdefghijklmnopqrstuvwxyz0123"].join("_"),
    "Bearer abcdefghijklmnopqrstuvwx",
    "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----",
    "AKIAABCDEFGHIJKLMNOP",
    "NOTION_API_KEY=abc123xyz",
    "NOTION_API_KEY: abc123xyz",
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

// ---- lib: validatePages

await check("lib validatePages: a clean page and a page directly in docs/wiki give no problem", async () => {
  const probs = await problemsFor({
    "docs/wiki/spieler-und-tester/start.md": START_MD,
    "docs/wiki/willkommen.md": pageTextWithHead("Spieler und Tester") + "# Willkommen\n\nText.\n",
  });
  assert.deepEqual(probs, [], JSON.stringify(probs));
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
    assert.deepEqual(fake.childTitles(WIKI_ROOT), ["spieler-und-tester.md"], info(r));
    const aud = fake.page("spieler-und-tester.md");
    assert.ok(aud, "audience page missing");
    assert.deepEqual(fake.childTitles(aud.id), ["spieler-und-tester/spielen.md", "spieler-und-tester/start.md"]);
    assert.ok(fake.blocksOf(aud.id).some((b) => String(b.type).startsWith("heading") && plainText(b[b.type]?.rich_text).includes("Spieler und Tester")), "no heading with the audience name");
    assert.ok(fake.textOf(aud.id).includes("Spielende und Testende"), "no audience description");
    const start = fake.page("spieler-und-tester/start.md");
    const spielen = fake.page("spieler-und-tester/spielen.md");
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
    assert.ok(fake.textOf(fake.page("spieler-und-tester/start.md").id).includes("changed"), "body change not published");

    rmSync(join(root, "docs/wiki/spieler-und-tester/spielen.md"));
    const fourth = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
    assert.equal(fourth.status, 0, info(fourth));
    assert.equal(lastLine(fourth.stdout), "created 0, updated 0, archived 1, unchanged 2", info(fourth));
    assert.ok(fake.archivedPage("spieler-und-tester/spielen.md"), "deleted file's page not archived");
    assert.equal(fake.page("spieler-und-tester/spielen.md"), undefined, "deleted file's page still live");
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

// ---- CLI: validation failures

const VALIDATION_CASES = [
  ["unknown audience", "docs/wiki/spieler-und-tester/bad.md", "---\naudience: Anderes\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
  ["missing audience", "docs/wiki/spieler-und-tester/bad.md", "---\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
  ["missing humanizer", "docs/wiki/spieler-und-tester/bad.md", "---\naudience: Spieler und Tester\nsource: docs/design.md\nchecked: no-ai-slop\n---\n# Bad\n\nText.\n", "text check missing"],
  ["folder mismatch", "docs/wiki/anderes/bad.md", "---\naudience: Spieler und Tester\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "folder does not match audience"],
  ["no head", "docs/wiki/spieler-und-tester/bad.md", "# Bad\n\nNo head here.\n", "no head"],
  ["audience not in config (folder anderes)", "docs/wiki/anderes/bad.md", "---\naudience: Anderes\nsource: docs/design.md\nchecked: no-ai-slop, humanizer\n---\n# Bad\n\nText.\n", "unknown audience"],
];
for (const [label, path, text, phrase] of VALIDATION_CASES) {
  await check(`cli --wiki validation: ${label} -> exit 4, no writes, file and problem named`, async () => {
    const root = pubProject({ [path]: text });
    const fake = await startWikiFake();
    try {
      const mark = fake.requests.length;
      const r = await runCliAsync({ cwd: root, args: ["--wiki", "--root", root], base: fake.base });
      assert.equal(r.status, 4, info(r));
      assert.equal(fake.writes(mark).length, 0, "writes sent");
      assert.ok(r.stderr.includes(path), `file not named\n${info(r)}`);
      assert.ok(r.stderr.includes(phrase), `problem not named\n${info(r)}`);
      noToken(r);
    } finally {
      await fake.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
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

await check("hook and batch run contain no --wiki", async () => {
  const files = [
    join(HERE, "post-merge.d", "docs-notion.sh"),
    join(HERE, "..", ".claude", "skills", "foreman-dispatch-run", "references", "batch-run.md"),
  ];
  for (const f of files) {
    assert.ok(!readFileSync(f, "utf8").includes("--wiki"), `${f} contains --wiki`);
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

if (failed) {
  console.log(`docs-wiki tests: ${failed} failed`);
  process.exitCode = 1;
} else {
  console.log("docs-wiki tests: ok");
}

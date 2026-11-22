#!/usr/bin/env node
// Black-box tests for the docs mirror CLI scripts/docs-notion.mjs.
// The CLI runs as a child process against an in-process fake Notion server. Run: node scripts/test-docs-notion.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, rmdirSync, symlinkSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "docs-notion.mjs");
const TOKEN = "ntn_TEST_FAKE_TOKEN_12345";
const ROOT_ID = "root-1";

const queue = [];
const t = (name, fn) => queue.push([name, fn]);

// ---------------------------------------------------------------- fake Notion

const plainText = (rt = []) => rt.map((r) => r.text?.content ?? r.plain_text ?? "").join("");
const blockText = (b) => plainText(b[b.type]?.rich_text);

// Strip ids so blocks from different runs can be compared.
const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === "id" || k === "object" ? undefined : v)));

function violations(node, path = "body") {
  const out = [];
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...violations(v, `${path}[${i}]`)));
  } else if (node && typeof node === "object") {
    if (Array.isArray(node.children) && node.children.length > 100) out.push(`${path}.children has ${node.children.length} items (max 100)`);
    if (Array.isArray(node.rich_text) && node.rich_text.length > 100) out.push(`${path}.rich_text has ${node.rich_text.length} elements (max 100)`);
    if (typeof node.content === "string" && node.content.length > 2000) out.push(`${path}.content has ${node.content.length} chars (max 2000)`);
    for (const [k, v] of Object.entries(node)) out.push(...violations(v, `${path}.${k}`));
  }
  return out;
}

const kidsOf = (b) => b[b.type]?.children ?? b.children;
// Block elements in a children array, nested children included.
const countBlocks = (arr = []) => arr.reduce((n, b) => n + 1 + countBlocks(kidsOf(b)), 0);
const bodyViolations = (body) => {
  const out = violations(body);
  const n = countBlocks(Array.isArray(body?.children) ? body.children : []);
  if (n > 1000) out.push(`request has ${n} block elements (max 1000)`);
  return out;
};

async function startFake({ pageSize = 3, token = TOKEN, delayMs = 0 } = {}) {
  let seq = 0;
  let delay = delayMs; // every response is held back this long
  const newId = (p) => `${p}-${++seq}`;
  const pages = new Map(); // id -> { id, title, parent, archived, items }
  pages.set(ROOT_ID, { id: ROOT_ID, title: "root", parent: null, archived: false, items: [] });
  const requests = [];
  const rejected = []; // requests the fake refused on its own rules (not injected failures)
  let armed = null;

  const stamp = (b) => {
    const c = structuredClone(b);
    c.object = "block";
    c.id = newId("blk");
    const inner = c[c.type];
    if (inner && Array.isArray(inner.children)) inner.children = inner.children.map(stamp);
    if (Array.isArray(c.children)) c.children = c.children.map(stamp);
    return c;
  };
  // Real API: a block with children is listed WITHOUT them, with has_children: true.
  const shallow = (b) => {
    const c = structuredClone(b);
    const kids = kidsOf(c);
    if (c[c.type]) delete c[c.type].children;
    delete c.children;
    c.has_children = !!kids?.length;
    return c;
  };
  const listing = (page) =>
    page.items.flatMap((it) => {
      if (it.child_page) {
        const p = pages.get(it.child_page);
        if (p.archived) return [];
        return [{ object: "block", id: p.id, type: "child_page", has_children: true, child_page: { title: p.title } }];
      }
      return [shallow(it)];
    });
  const findIn = (arr, id) => {
    for (const b of arr ?? []) {
      if (b.id === id) return b;
      const r = findIn(kidsOf(b), id);
      if (r) return r;
    }
    return null;
  };
  // Any id: a page or a block (also nested). archived is true when the page (or the block's page) is archived.
  const target = (id) => {
    const p = pages.get(id);
    if (p) return { page: p, archived: p.archived };
    for (const q of pages.values()) {
      const r = findIn(q.items.filter((it) => !it.child_page), id);
      if (r) return { blk: r, owner: q, archived: q.archived };
    }
    return null;
  };
  const archivePage = (page) => {
    page.archived = true;
    for (const it of page.items) if (it.child_page) archivePage(pages.get(it.child_page));
  };
  const removeIn = (arr, id) => {
    const i = arr.findIndex((b) => b.id === id);
    if (i >= 0) {
      arr.splice(i, 1);
      return true;
    }
    return arr.some((b) => kidsOf(b) && removeIn(kidsOf(b), id));
  };
  const ARCHIVED = "Can't edit block that is archived";

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url, "http://localhost");
    let body;
    let badJson = false;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      badJson = true;
    }
    const rec = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body, status: 0, t: Date.now() };
    requests.push(rec);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    const send =(status, obj, headers = {}) => {
      rec.status = status;
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(obj));
    };
    const reject = (status, code, message) => {
      rejected.push(`${req.method} ${url.pathname}: ${status} ${code} ${message}`);
      send(status, { object: "error", status, code, message });
    };

    if (armed && --armed.n <= 0) {
      const a = armed;
      if (!a.sticky) armed = null;
      return send(a.status, { object: "error", status: a.status, code: "injected_failure", message: "injected failure" }, a.headers);
    }
    if (req.headers.authorization !== `Bearer ${token}`) return reject(401, "unauthorized", "API token is invalid.");
    if (!req.headers["notion-version"]) return reject(400, "missing_version", "Notion-Version header is required.");
    if (badJson) return reject(400, "invalid_json", "Body is not valid JSON.");

    let m;
    if (req.method === "POST" && url.pathname === "/v1/pages") {
      const parent = pages.get(body?.parent?.page_id);
      if (!parent) return reject(404, "object_not_found", "parent page not found");
      if (parent.archived) return reject(400, "validation_error", ARCHIVED);
      const tp = body.properties?.title;
      const arr = Array.isArray(tp) ? tp : tp?.title;
      if (!Array.isArray(arr)) return reject(400, "validation_error", "properties.title missing");
      if (body.children !== undefined && !Array.isArray(body.children)) return reject(400, "validation_error", "children must be an array");
      const v = bodyViolations(body);
      if (v.length) return reject(400, "validation_error", v.join("; "));
      const page = { id: newId("page"), title: plainText(arr), parent: parent.id, archived: false, items: (body.children ?? []).map(stamp) };
      pages.set(page.id, page);
      parent.items.push({ child_page: page.id });
      return send(200, { object: "page", id: page.id, archived: false, parent: { type: "page_id", page_id: parent.id }, properties: { title: { type: "title", title: arr } } });
    }
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/))) {
      const tg = target(m[1]);
      if (!tg) return reject(404, "object_not_found", "block not found");
      if (tg.archived) return reject(400, "validation_error", ARCHIVED);
      const size = Math.min(parseInt(rec.query.page_size, 10) || 100, pageSize);
      const start = parseInt(rec.query.start_cursor, 10) || 0;
      const all = tg.page ? listing(tg.page) : (kidsOf(tg.blk) ?? []).map(shallow);
      const more = start + size < all.length;
      return send(200, { object: "list", results: all.slice(start, start + size), has_more: more, next_cursor: more ? String(start + size) : null });
    }
    if (req.method === "PATCH" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/))) {
      const tg = target(m[1]);
      if (!tg) return reject(404, "object_not_found", "block not found");
      if (tg.archived) return reject(400, "validation_error", ARCHIVED);
      if (!Array.isArray(body?.children)) return reject(400, "validation_error", "children must be an array");
      if (body.children.length > 100) return reject(400, "validation_error", `children has ${body.children.length} items (max 100)`);
      const v = bodyViolations(body);
      if (v.length) return reject(400, "validation_error", v.join("; "));
      const added = body.children.map(stamp);
      if (tg.page) tg.page.items.push(...added);
      else {
        const blk = tg.blk;
        if (!kidsOf(blk)) (blk[blk.type] ??= {}).children = [];
        kidsOf(blk).push(...added); // table blocks: append rows
      }
      return send(200, { object: "list", results: added.map(shallow), has_more: false, next_cursor: null });
    }
    if (req.method === "DELETE" && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)$/))) {
      const id = m[1];
      const tg = target(id);
      if (!tg || id === ROOT_ID) return reject(404, "object_not_found", "block not found");
      if (tg.archived) return reject(400, "validation_error", ARCHIVED);
      if (tg.page) archivePage(tg.page); // deleting a child_page block archives the page and its sub-pages
      else removeIn(tg.owner.items, id);
      return send(200, { object: "block", id, archived: true });
    }
    if (req.method === "PATCH" && (m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/))) {
      const page = pages.get(m[1]);
      if (!page || page.id === ROOT_ID) return reject(404, "object_not_found", "page not found");
      if (page.archived || pages.get(page.parent)?.archived) return reject(400, "validation_error", ARCHIVED);
      if (body?.archived === true) archivePage(page);
      return send(200, { object: "page", id: page.id, archived: page.archived });
    }
    return reject(404, "invalid_request_url", `no route for ${req.method} ${url.pathname}`);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const titleOf = (id) => pages.get(id)?.title ?? "?";
  const real = () => [...pages.values()].filter((p) => p.id !== ROOT_ID && !p.archived);

  return {
    port,
    base: `http://127.0.0.1:${port}`,
    requests,
    rejected,
    // Answer the n-th request from now on (1 = the next one) with this status, once.
    failNth(n, status, headers = {}) {
      armed = { n, status, headers };
    },
    // From the n-th request on, answer every request with this status.
    failFrom(n, status, headers = {}) {
      armed = { n, status, headers, sticky: true };
    },
    failNext(status, headers = {}) {
      armed = { n: 1, status, headers };
    },
    // A page created directly in the fake (not by the CLI); no marker.
    addPage(title, parentId = ROOT_ID, blocks = []) {
      const parent = pages.get(parentId);
      const page = { id: newId("page"), title, parent: parentId, archived: false, items: blocks.map(stamp) };
      pages.set(page.id, page);
      parent.items.push({ child_page: page.id });
      return page.id;
    },
    setDelay(ms) {
      delay = ms;
    },
    mark: () => requests.length,
    since: (mark) => requests.slice(mark),
    countPages: () => real().length,
    tree: () => real().map((p) => `${p.title} < ${titleOf(p.parent)}`).sort(),
    pageByTitle: (title) => real().find((p) => p.title === title)?.id,
    isArchived: (id) => pages.get(id)?.archived === true,
    childPageIds: (id) => listing(pages.get(id)).filter((b) => b.type === "child_page").map((b) => b.id),
    // blocks of a page without the child_page entries
    blocksOf: (id) => pages.get(id).items.filter((it) => !it.child_page),
    // Simulates an edit in Notion: replaces all normal blocks of the page.
    setBlocks(id, blocks) {
      const p = pages.get(id);
      p.items = [...p.items.filter((it) => it.child_page), ...blocks.map(stamp)];
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

// ---------------------------------------------------------------- fixtures

const para = (text) => ({ type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } });

const FILES = {
  "docs/requirements.md": [
    "# Requirements (invented)",
    "",
    "A harbour kiosk shows tide tables to visitors.",
    "",
    "## Scope",
    "",
    "- Tide table for today",
    "- Weather note",
    "",
  ].join("\n"),
  "docs/requirements/01-roles.md": ["# Roles", "", "The harbour master edits the tide table.", ""].join("\n"),
  "docs/requirements/02-flow.md": ["# Flow", "", "1. Visitor taps the screen", "2. Kiosk shows the table", ""].join("\n"),
  "docs/learnings.md": ["# Learnings", "", "- Tide data arrives hourly.", ""].join("\n"),
  "docs/sample.md": ["# Sample", "", "Just a short paragraph.", ""].join("\n"),
  "docs/agent-reports/x.md": "# Report x\n\nNot mirrored.\n",
  "docs/milestones/M1/STATE.md": "# State M1\n\nNot mirrored.\n",
};

const EXPECTED_TREE = [
  "docs/learnings.md < root",
  "docs/requirements.md < root",
  "docs/requirements/01-roles.md < docs/requirements.md",
  "docs/requirements/02-flow.md < docs/requirements.md",
  "docs/sample.md < root",
].sort();

function makeRepo({ files = FILES, docsNotion } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "docs-notion-"));
  const cfg = docsNotion ?? { rootPageId: ROOT_ID, include: ["docs/**/*.md"], exclude: ["docs/agent-reports/**", "docs/milestones/**"] };
  writeFileSync(join(dir, ".foreman.json"), JSON.stringify({ docsNotion: cfg }, null, 2));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const hashOf = (dir, rel) => createHash("sha256").update(readFileSync(join(dir, rel))).digest("hex").slice(0, 16);

function runCli({ cwd, args = [], base, token = TOKEN, env: extraEnv = {} }) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^NOTION_/i.test(k) || /^(https?|all)_proxy$/i.test(k)) delete env[k];
  env.NO_PROXY = "127.0.0.1,localhost";
  env.NOTION_API_BASE = base;
  if (token) env.NOTION_API_KEY = token;
  Object.assign(env, extraEnv);
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

async function scenario(fn, repoOpts, fakeOpts) {
  const fake = await startFake(fakeOpts);
  const dir = makeRepo(repoOpts);
  const run = (args = [], opts = {}) => runCli({ cwd: dir, args, base: fake.base, ...opts });
  try {
    await fn({ fake, dir, run });
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const lastLine = (s) => s.split("\n").map((l) => l.trimEnd()).filter(Boolean).at(-1);
const info = (r) => `exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`;
const summary = (c, u, a, n) => `created ${c}, updated ${u}, archived ${a}, unchanged ${n}`;

function expectSummary(r, c, u, a, n) {
  assert.equal(r.status, 0, info(r));
  assert.equal(lastLine(r.stdout), summary(c, u, a, n), info(r));
}

function markerOf(fake, id) {
  const first = fake.blocksOf(id)[0];
  assert.ok(first, "page has no blocks");
  assert.equal(first.type, "paragraph", "first block must be a paragraph");
  const m = blockText(first).match(/^Mirrored from (\S+)\. Edits here are overwritten\. sha256:([0-9a-f]{16})$/);
  assert.ok(m, `first block is not the marker: ${JSON.stringify(blockText(first))}`);
  return { path: m[1], hash: m[2] };
}

function expectMarkers(fake, dir) {
  const tree = fake.tree();
  assert.ok(tree.length > 0, "no pages");
  for (const line of tree) {
    const title = line.split(" < ")[0];
    const id = fake.pageByTitle(title);
    const mk = markerOf(fake, id);
    assert.equal(mk.path, title, `marker path of ${title}`);
    assert.equal(mk.hash, hashOf(dir, title), `marker hash of ${title}`);
  }
}

// ---------------------------------------------------------------- tests

t("1 dry-run offline: lists five files, no token, no network", async () => {
  await scenario(async ({ fake, run }) => {
    const r = await run(["--dry-run"], { token: "" });
    assert.equal(r.status, 0, info(r));
    const lines = r.stdout.split("\n").map((l) => l.trim());
    const sync = lines.filter((l) => l.startsWith("sync "));
    assert.equal(sync.length, 5, info(r));
    for (const p of ["docs/requirements.md", "docs/learnings.md", "docs/sample.md"]) {
      assert.ok(sync.some((l) => l.startsWith(`sync ${p}`) && !l.includes("(under")), `missing line for ${p}\n${info(r)}`);
    }
    for (const p of ["docs/requirements/01-roles.md", "docs/requirements/02-flow.md"]) {
      assert.ok(sync.includes(`sync ${p} (under docs/requirements.md)`), `missing line for ${p}\n${info(r)}`);
    }
    assert.ok(!r.stdout.includes("agent-reports/x.md"), "excluded agent report listed");
    assert.ok(!r.stdout.includes("milestones/M1/STATE.md"), "excluded STATE.md listed");
    assert.equal(fake.requests.length, 0, "dry-run must not touch the network");
  });
});

t("2 first sync: page tree, markers, summary", async () => {
  await scenario(async ({ fake, dir, run }) => {
    const r = await run();
    expectSummary(r, 5, 0, 0, 0);
    assert.deepEqual(fake.tree(), EXPECTED_TREE);
    expectMarkers(fake, dir);
    assert.deepEqual(fake.rejected, []);
  });
});

t("3 second sync without changes touches nothing (also via --root from another cwd)", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    const mark = fake.mark();
    const r = await run(["--root", dir], { cwd: tmpdir() });
    expectSummary(r, 0, 0, 0, 5);
    const writes = fake.since(mark).filter((q) => q.method !== "GET");
    assert.deepEqual(writes.map((q) => `${q.method} ${q.path}`), [], "unchanged run must only read");
    assert.deepEqual(fake.tree(), EXPECTED_TREE);
    assert.deepEqual(fake.rejected, []);
  });
});

t("4 edit in Notion is overwritten, including an edited hash marker", async () => {
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    const id = fake.pageByTitle("docs/learnings.md");
    const before = norm(fake.blocksOf(id));
    fake.setBlocks(id, [
      para("Mirrored from docs/learnings.md. Edits here are overwritten. sha256:0000000000000000"),
      para("someone edited this in Notion"),
    ]);
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    const r = await run();
    expectSummary(r, 0, 1, 0, 4);
    assert.deepEqual(norm(fake.blocksOf(id)), before);
    assert.equal(fake.pageByTitle("docs/learnings.md"), id, "page must be updated in place");
    assert.deepEqual(fake.rejected, []);
  });
});

t("5 changed repo file updates its page, child pages keep their ids", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    const overview = fake.pageByTitle("docs/requirements.md");
    const parts = ["docs/requirements/01-roles.md", "docs/requirements/02-flow.md"].map((p) => fake.pageByTitle(p));
    writeFileSync(join(dir, "docs/requirements.md"), FILES["docs/requirements.md"] + "\nAdded a sentence about opening hours.\n");
    const r = await run();
    expectSummary(r, 0, 1, 0, 4);
    assert.equal(fake.pageByTitle("docs/requirements.md"), overview);
    assert.deepEqual(parts.map((id) => fake.isArchived(id)), [false, false]);
    assert.deepEqual(["docs/requirements/01-roles.md", "docs/requirements/02-flow.md"].map((p) => fake.pageByTitle(p)), parts);
    assert.deepEqual(fake.childPageIds(overview).sort(), [...parts].sort());
    assert.deepEqual(fake.tree(), EXPECTED_TREE);
    expectMarkers(fake, dir);
    assert.ok(fake.blocksOf(overview).some((b) => blockText(b).includes("opening hours")));
    assert.deepEqual(fake.rejected, []);
  });
});

t("6 deleted repo file archives its page", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    const id = fake.pageByTitle("docs/learnings.md");
    rmSync(join(dir, "docs/learnings.md"));
    const mark = fake.mark();
    const r = await run();
    expectSummary(r, 0, 0, 1, 4);
    assert.ok(fake.isArchived(id), "learnings page must be archived");
    assert.deepEqual(fake.tree(), EXPECTED_TREE.filter((l) => !l.startsWith("docs/learnings.md")));
    assert.ok(
      fake.since(mark).some((q) => q.method === "PATCH" && q.path === `/v1/pages/${id}` && q.body?.archived === true),
      "expected PATCH /v1/pages/<id> with archived:true",
    );
    assert.deepEqual(fake.rejected, []);
  });
});

t("7 markdown mapping", async () => {
  const md = [
    "# Title One",
    "## Title Two",
    "### Title Three",
    "#### Title Four",
    "",
    "Plain with **bold**, *italic*, `code` and [link](https://example.com/x) end.",
    "",
    "- bullet a",
    "* bullet b",
    "",
    "1. first",
    "2. second",
    "",
    "- [ ] todo open",
    "- [x] todo done",
    "",
    "```js",
    "const a = 1;",
    "```",
    "",
    "```weirdlang",
    "x y",
    "```",
    "",
    "| Name | Value |",
    "| --- | --- |",
    "| a | 1 |",
    "| b | 2 |",
    "",
    "> quoted text",
    "",
    "---",
    "",
    "<div>x</div>",
    "",
    "![a](b.png)",
    "",
  ].join("\n");
  await scenario(
    async ({ fake, run }) => {
      const r = await run();
      expectSummary(r, 1, 0, 0, 0);
      const blocks = fake.blocksOf(fake.pageByTitle("docs/sample.md")).slice(1); // without marker
      const types = blocks.map((b) => b.type);
      assert.deepEqual(types.slice(0, 16), [
        "heading_1", "heading_2", "heading_3", "heading_3",
        "paragraph",
        "bulleted_list_item", "bulleted_list_item",
        "numbered_list_item", "numbered_list_item",
        "to_do", "to_do",
        "code", "code",
        "table", "quote", "divider",
      ], `types: ${types.join(",")}`);
      assert.ok(types.slice(16).length >= 1 && types.slice(16).every((x) => x === "paragraph"), `types: ${types.join(",")}`);

      assert.deepEqual(blocks.slice(0, 4).map(blockText), ["Title One", "Title Two", "Title Three", "Title Four"]);

      const rt = blocks[4].paragraph.rich_text;
      assert.equal(plainText(rt), "Plain with bold, italic, code and link end.");
      const seg = (content) => {
        const s = rt.find((x) => x.text.content === content);
        assert.ok(s, `no rich_text segment ${JSON.stringify(content)}`);
        return s;
      };
      const on = (s) => Object.entries(s.annotations ?? {}).filter(([k, v]) => v === true && k !== "color").map(([k]) => k);
      assert.deepEqual(on(seg("bold")), ["bold"]);
      assert.deepEqual(on(seg("italic")), ["italic"]);
      assert.deepEqual(on(seg("code")), ["code"]);
      assert.equal(seg("link").text.link?.url, "https://example.com/x");
      assert.deepEqual(on(seg("link")), []);
      assert.deepEqual(on(seg("Plain with ")), []);

      assert.deepEqual(blocks.slice(5, 7).map(blockText), ["bullet a", "bullet b"]);
      assert.deepEqual(blocks.slice(7, 9).map(blockText), ["first", "second"]);
      assert.deepEqual(blocks.slice(9, 11).map(blockText), ["todo open", "todo done"]);
      assert.deepEqual(blocks.slice(9, 11).map((b) => b.to_do.checked), [false, true]);

      assert.equal(blocks[11].code.language, "javascript");
      assert.equal(plainText(blocks[11].code.rich_text).trim(), "const a = 1;");
      assert.equal(blocks[12].code.language, "plain text");
      assert.equal(plainText(blocks[12].code.rich_text).trim(), "x y");

      const table = blocks[13];
      assert.equal(table.table.table_width, 2);
      assert.equal(table.table.has_column_header, true);
      const rows = table.table.children ?? table.children;
      assert.ok(Array.isArray(rows), "table has no table_row children");
      assert.deepEqual(rows.map((x) => x.type), ["table_row", "table_row", "table_row"]);
      assert.deepEqual(rows.map((x) => x.table_row.cells.map(plainText)), [["Name", "Value"], ["a", "1"], ["b", "2"]]);

      assert.equal(blockText(blocks[14]), "quoted text");

      const paraText = blocks
        .filter((b) => b.type === "paragraph")
        .map((b) => b.paragraph.rich_text.map((x) => `${x.text.content} ${x.text.link?.url ?? ""}`).join(""))
        .join("\n");
      assert.ok(paraText.includes("<div>x</div>"), `html line lost: ${paraText}`);
      assert.ok(paraText.includes("b.png"), `image line lost: ${paraText}`);
      assert.deepEqual(fake.rejected, []);
    },
    { files: { "docs/sample.md": md } },
  );
});

t("8a empty file becomes a page with the marker only", async () => {
  await scenario(
    async ({ fake, dir, run }) => {
      const r = await run();
      expectSummary(r, 1, 0, 0, 0);
      assert.deepEqual(fake.tree(), ["docs/empty.md < root"]);
      const blocks = fake.blocksOf(fake.pageByTitle("docs/empty.md"));
      assert.equal(blocks.length, 1, "only the marker expected");
      expectMarkers(fake, dir);
    },
    { files: { "docs/empty.md": "" } },
  );
});

t("8b include matches nothing: exit 0, nothing to mirror", async () => {
  await scenario(
    async ({ fake, run }) => {
      const r = await run();
      assert.equal(r.status, 0, info(r));
      assert.ok(r.stdout.includes("nothing to mirror"), info(r));
      assert.equal(fake.countPages(), 0);
    },
    { files: { "README.md": "# Readme\n" } },
  );
});

t("9 token, rootPageId and flag errors", async () => {
  await scenario(async ({ fake, run }) => {
    const noToken = await run([], { token: "" });
    assert.equal(noToken.status, 3, info(noToken));
    assert.ok(noToken.stderr.includes("NOTION_API_KEY"), info(noToken));
    assert.equal(fake.requests.length, 0);

    const bad = await run(["--bogus"]);
    assert.equal(bad.status, 2, info(bad));
  });
  await scenario(
    async ({ fake, run }) => {
      const r = await run();
      assert.equal(r.status, 3, info(r));
      assert.ok(r.stderr.includes("rootPageId"), info(r));
      assert.equal(fake.requests.length, 0);
    },
    { docsNotion: { rootPageId: "", include: ["docs/**/*.md"], exclude: [] } },
  );
  const dir = mkdtempSync(join(tmpdir(), "docs-notion-"));
  try {
    writeFileSync(join(dir, ".foreman.json"), JSON.stringify({ workflow: "repo" }));
    const r = await runCli({ cwd: dir, base: "http://127.0.0.1:9" });
    assert.equal(r.status, 2, `missing docsNotion config: ${info(r)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("10 Notion 500 mid-run: exit 1, no token in output, rerun heals without duplicates", async () => {
  await scenario(async ({ fake, dir, run }) => {
    fake.failNth(3, 500);
    const r = await run();
    assert.equal(r.status, 1, info(r));
    assert.match(r.stderr, /docs\/[^\s]+\.md/, `stderr must name the failed file\n${info(r)}`);
    assert.ok(!r.stderr.includes(TOKEN) && !r.stdout.includes(TOKEN), "token leaked into output");

    const r2 = await run();
    assert.equal(r2.status, 0, info(r2));
    assert.match(lastLine(r2.stdout), /^created \d+, updated \d+, archived \d+, unchanged \d+$/, info(r2));
    assert.deepEqual(fake.tree(), EXPECTED_TREE);
    assert.equal(fake.countPages(), 5);
    expectMarkers(fake, dir);
    assert.deepEqual(fake.rejected, []);
  });
});

const ONE_FILE = { files: { "docs/a.md": "# A\n\nOne paragraph.\n" } };

t("11 429 with Retry-After: 1 is waited out and the run succeeds", async () => {
  await scenario(async ({ fake, run }) => {
    fake.failNth(2, 429, { "Retry-After": "1" });
    const r = await run();
    expectSummary(r, 5, 0, 0, 0);
    const i = fake.requests.findIndex((q) => q.status === 429);
    assert.ok(i >= 0 && fake.requests[i + 1], "no 429 followed by a retry");
    const gap = fake.requests[i + 1].t - fake.requests[i].t;
    assert.ok(gap >= 900, `retry came after ${gap} ms, expected >= 900`);
    assert.equal(fake.requests[i + 1].method, fake.requests[i].method);
    assert.equal(fake.requests[i + 1].path, fake.requests[i].path);
    assert.deepEqual(fake.tree(), EXPECTED_TREE);
    assert.deepEqual(fake.rejected, []);
  });
});

t("12 permanent 429 (Retry-After: 0): bounded retries, exit 1, names file and 429", async () => {
  await scenario(async ({ fake, run }) => {
    fake.failFrom(2, 429, { "Retry-After": "0" }); // request 1 is the read of the root page
    const r = await run();
    assert.equal(r.status, 1, info(r));
    const n429 = fake.requests.filter((q) => q.status === 429).length;
    assert.ok(n429 >= 2 && n429 <= 8, `${n429} requests answered 429, expected 2..8\n${info(r)}`);
    assert.ok(fake.requests.length <= 9, `${fake.requests.length} requests in total`);
    assert.match(r.stderr, /docs\/a\.md/, info(r));
    assert.match(r.stderr, /429/, info(r));
  }, ONE_FILE);
});

t("13 large input: 250 bullets, 5000-char paragraph, 4500-char code block", async () => {
  const para5000 = "lorem ".repeat(1000).slice(0, 4999) + "x";
  const code4500 = "y".repeat(4500);
  const bullets = Array.from({ length: 250 }, (_, i) => `item ${i}`);
  const md = ["# Big", "", ...bullets.map((b) => `- ${b}`), "", para5000, "", "```", code4500, "```", ""].join("\n");
  await scenario(async ({ fake, run }) => {
    const r = await run();
    expectSummary(r, 1, 0, 0, 0);
    assert.deepEqual(fake.rejected, []);
    assert.ok(!fake.requests.some((q) => q.status === 400), "fake answered 400");
    const blocks = fake.blocksOf(fake.pageByTitle("docs/big.md")).slice(1);
    const text = (type) => blocks.filter((b) => b.type === type).map(blockText);
    assert.deepEqual(text("bulleted_list_item"), bullets);
    assert.equal(text("paragraph").join("").length, 5000);
    assert.equal(text("paragraph").join(""), para5000);
    assert.equal(text("code").join("").trim().length, 4500);
    assert.equal(text("code").join("").trim(), code4500);
  }, { files: { "docs/big.md": md } });
});

const SECRET = "ntn_SECRET_LEAK_CHECK_98765";

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

function assertNoLeak(label, r, fake, dir) {
  assert.ok(!r.stdout.includes(SECRET), `${label}: token in stdout`);
  assert.ok(!r.stderr.includes(SECRET), `${label}: token in stderr`);
  for (const f of filesUnder(dir)) assert.ok(!readFileSync(f, "utf8").includes(SECRET), `${label}: token in ${f}`);
  for (const q of fake.requests) {
    assert.ok(!JSON.stringify([q.path, q.query, q.body]).includes(SECRET), `${label}: token in URL or body of ${q.method} ${q.path}`);
  }
}

t("14 token never leaks (401, permanent 429, 500, normal); --dry-run writes nothing", async () => {
  // 401: the server expects another token
  await scenario(async ({ fake, dir, run }) => {
    const r = await run([], { token: SECRET });
    assert.equal(r.status, 1, info(r));
    assert.ok(fake.requests.some((q) => q.status === 401), "server never answered 401");
    assertNoLeak("401", r, fake, dir);
  }, ONE_FILE);
  const cases = [
    ["429", (f) => f.failFrom(2, 429, { "Retry-After": "0" }), 1, ONE_FILE],
    ["500", (f) => f.failNth(3, 500), 1, undefined],
    ["normal", () => {}, 0, undefined],
  ];
  for (const [label, arm, code, repo] of cases) {
    await scenario(async ({ fake, dir, run }) => {
      arm(fake);
      const r = await run([], { token: SECRET });
      assert.equal(r.status, code, `${label}: ${info(r)}`);
      assertNoLeak(label, r, fake, dir);
      for (const q of fake.requests) assert.equal(q.headers.authorization, `Bearer ${SECRET}`);
    }, repo, { token: SECRET });
  }
  await scenario(async ({ fake, dir, run }) => {
    const r = await run(["--dry-run"], { token: SECRET });
    assert.equal(r.status, 0, info(r));
    const writes = fake.requests.filter((q) => ["POST", "PATCH", "DELETE"].includes(q.method));
    assert.deepEqual(writes.map((q) => `${q.method} ${q.path}`), [], "dry-run must not write");
    assertNoLeak("dry-run", r, fake, dir);
  }, undefined, { token: SECRET });
});

t("15 path limits: symlink out of the repo and ../ include glob are not mirrored", async () => {
  const outsideDir = join(tmpdir(), "outside");
  const outsideFile = join(outsideDir, `secret-${process.pid}.md`);
  const targetDir = mkdtempSync(join(tmpdir(), "docs-notion-target-"));
  const targetFile = join(targetDir, "target.md");
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(outsideFile, "# Outside\n\nMust never be mirrored.\n");
  writeFileSync(targetFile, "# Target\n\nMust never be mirrored.\n");
  try {
    await scenario(
      async ({ fake, dir, run }) => {
        symlinkSync(targetFile, join(dir, "docs/leak.md"));
        const r = await run();
        expectSummary(r, 1, 0, 0, 0);
        assert.deepEqual(fake.tree(), ["docs/ok.md < root"]);
        assert.match(r.stderr, /docs\/leak\.md/, `skipped symlink not named\n${info(r)}`);
        const bodies = JSON.stringify(fake.requests.map((q) => q.body));
        assert.ok(!bodies.includes("Must never be mirrored"), "outside content was sent to the server");
        assert.ok(!bodies.includes("leak.md") && !bodies.includes("secret-"), "outside path reached the server");
      },
      { files: { "docs/ok.md": "# Ok\n\nInside.\n" }, docsNotion: { rootPageId: ROOT_ID, include: ["docs/**/*.md", "../outside/**/*.md"], exclude: [] } },
    );
  } finally {
    rmSync(outsideFile, { force: true });
    try { rmdirSync(outsideDir); } catch {} // only succeeds when empty
    rmSync(targetDir, { recursive: true, force: true });
  }
});

t("16 pacing: at most 3 requests per 1000 ms (assert <= 4)", async () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`docs/f${i}.md`, `# F${i}\n\nText ${i}.\n`]));
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 10, 0, 0, 0);
    const ts = fake.requests.map((q) => q.t);
    assert.ok(ts.length >= 11, `only ${ts.length} requests`); // 1 read + 10 creates
    let max = 0;
    for (const a of ts) max = Math.max(max, ts.filter((x) => x >= a && x < a + 1000).length);
    assert.ok(max <= 4, `${max} requests within 1000 ms`);
  }, { files });
});

t("17 edit below the marker (top level and nested) is overwritten", async () => {
  const md = ["# Learnings", "", "Tide data arrives hourly.", "", "- parent item", "  - child item", ""].join("\n");
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    const id = fake.pageByTitle("docs/learnings.md");
    const before = norm(fake.blocksOf(id));
    const para = fake.blocksOf(id).find((b) => b.type === "paragraph" && blockText(b) === "Tide data arrives hourly.");
    assert.ok(para, "paragraph block not found");
    para.paragraph.rich_text[0].text.content = "edited in Notion";
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    const r = await run();
    expectSummary(r, 0, 1, 0, 0);
    assert.deepEqual(norm(fake.blocksOf(id)), before);

    const parent = fake.blocksOf(id).find((b) => b.type === "bulleted_list_item" && blockText(b) === "parent item");
    assert.ok(parent, "list item not found");
    const kid = kidsOf(parent)?.[0];
    assert.ok(kid, "fake holds no nested child");
    kid.bulleted_list_item.rich_text[0].text.content = "edited child";
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    const r2 = await run();
    expectSummary(r2, 0, 1, 0, 0);
    assert.deepEqual(norm(fake.blocksOf(id)), before);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/learnings.md": md } });
});

t("18 Retry-After is capped by NOTION_MAX_RETRY_WAIT_S", async () => {
  await scenario(async ({ fake, run }) => {
    fake.failNth(2, 429, { "Retry-After": "3600" });
    const r = await run([], { env: { NOTION_MAX_RETRY_WAIT_S: "1" } });
    expectSummary(r, 1, 0, 0, 0);
    const i = fake.requests.findIndex((q) => q.status === 429);
    assert.ok(i >= 0 && fake.requests[i + 1], "no 429 followed by a retry");
    const gap = fake.requests[i + 1].t - fake.requests[i].t;
    assert.ok(gap >= 900 && gap <= 3000, `retry came after ${gap} ms, expected 900..3000`);
    assert.deepEqual(fake.rejected, []);
  }, ONE_FILE);
});

t("19 table body row wider than the header loses no cell", async () => {
  const md = ["# T", "", "| A | B |", "| --- | --- |", "| 1 | 2 | 3 |", "| x |", ""].join("\n");
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    const table = fake.blocksOf(fake.pageByTitle("docs/wide.md")).find((b) => b.type === "table");
    assert.ok(table, "no table block");
    const rows = kidsOf(table);
    assert.equal(rows.length, 3);
    assert.equal(table.table.table_width, 3);
    for (const row of rows) assert.equal(row.table_row.cells.length, 3, "row not padded to table width");
    const texts = rows.flatMap((x) => x.table_row.cells.map(plainText));
    for (const c of ["A", "B", "1", "2", "3", "x"]) assert.ok(texts.includes(c), `cell ${c} lost: ${JSON.stringify(texts)}`);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/wide.md": md } });
});

t("20 table with 250 body rows", async () => {
  const body = Array.from({ length: 250 }, (_, i) => `| r${i} | v${i} |`);
  const md = ["# Rows", "", "| Name | Value |", "| --- | --- |", ...body, ""].join("\n");
  await scenario(async ({ fake, run }) => {
    const r = await run();
    expectSummary(r, 1, 0, 0, 0);
    assert.deepEqual(fake.rejected, []);
    const table = fake.blocksOf(fake.pageByTitle("docs/rows.md")).find((b) => b.type === "table");
    assert.ok(table, "no table block");
    const rows = kidsOf(table);
    assert.equal(rows.length, 251);
    assert.deepEqual(rows[0].table_row.cells.map(plainText), ["Name", "Value"]);
    assert.deepEqual(rows[250].table_row.cells.map(plainText), ["r249", "v249"]);
  }, { files: { "docs/rows.md": md } });
});

t("21 request-size limits: 1000 blocks per request, 100 rich_text elements", async () => {
  const lists = Array.from({ length: 30 }, (_, l) => [`## List ${l}`, "", ...Array.from({ length: 60 }, (_, i) => `- l${l} item ${i}`), ""]).flat();
  const segs = Array.from({ length: 300 }, (_, i) => `**b${i}** p${i}`);
  const md = ["# Limits", "", ...lists, segs.join(" "), ""].join("\n");
  await scenario(async ({ fake, run }) => {
    const r = await run();
    expectSummary(r, 1, 0, 0, 0);
    assert.deepEqual(fake.rejected, []);
    assert.ok(!fake.requests.some((q) => q.status === 400), "fake answered 400");
    const blocks = fake.blocksOf(fake.pageByTitle("docs/limits.md")).slice(1);
    const bullets = blocks.filter((b) => b.type === "bulleted_list_item").map(blockText);
    const expected = Array.from({ length: 30 }, (_, l) => Array.from({ length: 60 }, (_, i) => `l${l} item ${i}`)).flat();
    assert.deepEqual(bullets, expected);
    const strip = (x) => x.replace(/\s+/g, "");
    const got = blocks.filter((b) => b.type === "paragraph").map(blockText).join("");
    assert.equal(strip(got), strip(Array.from({ length: 300 }, (_, i) => `b${i} p${i}`).join(" ")));
  }, { files: { "docs/limits.md": md } });
});

t("22 online dry-run labels new, update, archive, unchanged and writes nothing", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    writeFileSync(join(dir, "docs/new.md"), "# New\n\nFresh file.\n");
    writeFileSync(join(dir, "docs/sample.md"), FILES["docs/sample.md"] + "\nChanged line.\n");
    rmSync(join(dir, "docs/learnings.md"));
    const mark = fake.mark();
    const r = await run(["--dry-run"]);
    assert.equal(r.status, 0, info(r));
    const lines = r.stdout.split("\n").map((l) => l.trim()).filter((l) => /^(new|update|archive|unchanged) /.test(l));
    const has = (label, path) => lines.filter((l) => l.startsWith(`${label} `) && l.includes(path));
    assert.equal(has("new", "docs/new.md").length, 1, info(r));
    assert.equal(has("update", "docs/sample.md").length, 1, info(r));
    assert.equal(has("archive", "docs/learnings.md").length, 1, info(r));
    for (const p of ["docs/requirements.md", "docs/requirements/01-roles.md", "docs/requirements/02-flow.md"]) {
      assert.equal(has("unchanged", p).length, 1, `${p}\n${info(r)}`);
    }
    assert.equal(lines.length, 6, `expected one line per file\n${info(r)}`);
    const writes = fake.since(mark).filter((q) => ["POST", "PATCH", "DELETE"].includes(q.method));
    assert.deepEqual(writes.map((q) => `${q.method} ${q.path}`), [], "dry-run must not write");
  });
});

t("23 include outside the root is named on stderr, exit 0, no page", async () => {
  const outsideDir = join(tmpdir(), "outside");
  const outsideFile = join(outsideDir, `note-${process.pid}.md`);
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(outsideFile, "# Outside\n\nMust never be mirrored.\n");
  try {
    await scenario(
      async ({ fake, run }) => {
        const r = await run();
        assert.equal(r.status, 0, info(r));
        assert.ok(r.stderr.includes("outside"), `skipped pattern not named\n${info(r)}`);
        assert.equal(fake.countPages(), 0);
        assert.ok(!JSON.stringify(fake.requests.map((q) => q.body)).includes("Must never be mirrored"), "outside content was sent");
      },
      { files: { "README.md": "# Readme\n" }, docsNotion: { rootPageId: ROOT_ID, include: ["../outside/**/*.md"], exclude: [] } },
    );
  } finally {
    rmSync(outsideFile, { force: true });
    try { rmdirSync(outsideDir); } catch {}
  }
});

t("24 nested 1000-element limit: 20 bullets with 60 sub-items each", async () => {
  const lines = ["# Nested", ""];
  for (let i = 0; i < 20; i++) {
    lines.push(`- item ${i}`);
    for (let j = 0; j < 60; j++) lines.push(`  - sub ${i}-${j}`);
  }
  const md = lines.join("\n") + "\n";
  await scenario(
    async ({ fake, run }) => {
      const r = await run();
      expectSummary(r, 1, 0, 0, 0);
      assert.deepEqual(fake.rejected, []);
      assert.ok(!fake.requests.some((q) => q.status === 400), "fake answered 400");
      const items = fake.blocksOf(fake.pageByTitle("docs/nested.md")).filter((b) => b.type === "bulleted_list_item");
      assert.deepEqual(items.map(blockText), Array.from({ length: 20 }, (_, i) => `item ${i}`));
      items.forEach((it, i) => {
        const kids = kidsOf(it) ?? [];
        assert.deepEqual(kids.map(blockText), Array.from({ length: 60 }, (_, j) => `sub ${i}-${j}`), `children of item ${i}`);
      });
      expectSummary(await run(), 0, 0, 0, 1);
      assert.deepEqual(fake.rejected, []);
    },
    { files: { "docs/nested.md": md } },
    { pageSize: 100 },
  );
});

t("25 foreign pages are not archived and are named on stderr", async () => {
  await scenario(async ({ fake, run }) => {
    const foreign = fake.addPage("Meeting notes", ROOT_ID, [para("Invented minutes.")]);
    const r = await run();
    expectSummary(r, 1, 0, 0, 0);
    assert.ok(!fake.isArchived(foreign), "foreign page was archived");
    assert.ok(fake.tree().includes("Meeting notes < root"), "foreign page gone");
    assert.ok(
      r.stderr.split("\n").some((l) => l.includes("Meeting notes") && l.includes("not mirrored, left alone")),
      `foreign page not named\n${info(r)}`,
    );
    assert.deepEqual(fake.rejected, []);
  }, ONE_FILE);
});

t("26 deleting an overview archives overview and parts without an error", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 5, 0, 0, 0);
    rmSync(join(dir, "docs/requirements.md"));
    rmSync(join(dir, "docs/requirements"), { recursive: true });
    const r = await run();
    expectSummary(r, 0, 0, 3, 2);
    assert.deepEqual(fake.rejected, []);
    assert.ok(!fake.requests.some((q) => q.status === 400), "fake answered 400");
    assert.deepEqual(fake.tree(), ["docs/learnings.md < root", "docs/sample.md < root"]);
    const again = await run();
    expectSummary(again, 0, 0, 0, 2);
    assert.deepEqual(fake.rejected, []);
  });
});

t("27 total wait budget: NOTION_MAX_TOTAL_WAIT_S ends a run of permanent 429", async () => {
  await scenario(async ({ fake, run }) => {
    fake.failFrom(2, 429, { "Retry-After": "1" }); // request 1 is the read of the root page
    const t0 = Date.now();
    const r = await run([], { env: { NOTION_MAX_TOTAL_WAIT_S: "2", NOTION_MAX_RETRY_WAIT_S: "1" } });
    const took = Date.now() - t0;
    assert.equal(r.status, 1, info(r));
    assert.ok(took < 10000, `run took ${took} ms, expected < 10000\n${info(r)}`);
    const budgetLines = r.stderr.split("\n").filter((l) => /^docs-notion: docs\/.+\.md:/.test(l) && l.includes("wait budget"));
    assert.ok(budgetLines.length >= 3, `expected >= 3 files failing on the wait budget, got ${budgetLines.length}\n${info(r)}`);
  });
});

t("28 formatting edits in Notion are reset (annotation, link url, table header flag)", async () => {
  const md = ["# Learnings", "", "Tide data arrives hourly, see [the chart](https://example.com/chart) for details.", ""].join("\n");
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    const id = fake.pageByTitle("docs/learnings.md");
    const before = norm(fake.blocksOf(id));
    const paraBlock = () => fake.blocksOf(id).find((b) => b.type === "paragraph" && blockText(b).startsWith("Tide data"));

    const plain = paraBlock().paragraph.rich_text.find((x) => x.text.content.startsWith("Tide data"));
    plain.annotations = { ...(plain.annotations ?? {}), bold: true };
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    expectSummary(await run(), 0, 1, 0, 0);
    assert.deepEqual(norm(fake.blocksOf(id)), before);

    const link = paraBlock().paragraph.rich_text.find((x) => x.text.link);
    assert.ok(link, "no link segment");
    link.text.link.url = "https://example.com/other";
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    expectSummary(await run(), 0, 1, 0, 0);
    assert.deepEqual(norm(fake.blocksOf(id)), before);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/learnings.md": md } });

  const tmd = ["# T", "", "| Name | Value |", "| --- | --- |", "| a | 1 |", ""].join("\n");
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    const id = fake.pageByTitle("docs/table.md");
    const before = norm(fake.blocksOf(id));
    const table = fake.blocksOf(id).find((b) => b.type === "table");
    assert.ok(table, "no table block");
    table.table.has_column_header = !table.table.has_column_header;
    assert.notDeepEqual(norm(fake.blocksOf(id)), before);
    expectSummary(await run(), 0, 1, 0, 0);
    assert.deepEqual(norm(fake.blocksOf(id)), before);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/table.md": tmd } });
});

t("29 path with spaces: second run is unchanged", async () => {
  await scenario(async ({ fake, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    assert.deepEqual(fake.tree(), ["docs/my notes.md < root"]);
    expectSummary(await run(), 0, 0, 0, 1);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/my notes.md": "# My notes\n\nInvented text.\n" } });
});

t("30 directory symlink out of the repo is skipped and named on stderr", async () => {
  const target = mkdtempSync(join(tmpdir(), "docs-notion-extdir-"));
  writeFileSync(join(target, "outside.md"), "# Outside\n\nMust never be mirrored.\n");
  try {
    await scenario(
      async ({ fake, dir, run }) => {
        symlinkSync(target, join(dir, "docs/ext"), "dir");
        const r = await run();
        expectSummary(r, 1, 0, 0, 0);
        assert.deepEqual(fake.tree(), ["docs/ok.md < root"]);
        assert.match(r.stderr, /docs\/ext/, `skipped directory symlink not named\n${info(r)}`);
        assert.ok(!JSON.stringify(fake.requests.map((q) => q.body)).includes("Must never be mirrored"), "outside content was sent");
      },
      { files: { "docs/ok.md": "# Ok\n\nInside.\n" } },
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

t("31 part at the root, overview added later: part moves under the overview, no duplicates", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 1, 0, 0, 0);
    assert.deepEqual(fake.tree(), ["docs/x/y.md < root"]);
    const oldId = fake.pageByTitle("docs/x/y.md");
    writeFileSync(join(dir, "docs/x.md"), "# X\n\nInvented overview.\n");
    const r = await run();
    assert.equal(r.status, 0, info(r));
    assert.deepEqual(fake.rejected, []);
    assert.ok(!fake.requests.some((q) => q.status === 400), `fake answered 400\n${info(r)}`);
    assert.deepEqual(fake.tree(), ["docs/x.md < root", "docs/x/y.md < docs/x.md"]);
    const newId = fake.pageByTitle("docs/x/y.md");
    assert.notEqual(newId, oldId, "part must be a new page");
    assert.ok(fake.isArchived(oldId), "old part page not archived");
    const titles = fake.tree().map((l) => l.split(" < ")[0]);
    assert.equal(new Set(titles).size, titles.length, "duplicate active titles");
    expectMarkers(fake, dir);
    const again = await run();
    expectSummary(again, 0, 0, 0, 2);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/x/y.md": "# Y\n\nInvented part.\n" } });
});

t("32 overview deleted, parts stay: parts are re-created directly under the root", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 3, 0, 0, 0);
    const oldA = fake.pageByTitle("docs/x/a.md");
    const oldB = fake.pageByTitle("docs/x/b.md");
    const beforeA = norm(fake.blocksOf(oldA));
    const beforeB = norm(fake.blocksOf(oldB));
    rmSync(join(dir, "docs/x.md"));
    const r = await run();
    assert.equal(r.status, 0, info(r));
    assert.deepEqual(fake.rejected, []);
    assert.ok(!fake.requests.some((q) => q.status === 400), `fake answered 400\n${info(r)}`);
    assert.deepEqual(fake.tree(), ["docs/x/a.md < root", "docs/x/b.md < root"]);
    const newA = fake.pageByTitle("docs/x/a.md");
    const newB = fake.pageByTitle("docs/x/b.md");
    assert.ok(newA && newB && newA !== oldA && newB !== oldB, "parts must be re-created");
    assert.ok(fake.isArchived(oldA) && fake.isArchived(oldB), "old part pages not archived");
    assert.equal(fake.pageByTitle("docs/x.md"), undefined, "overview still active");
    assert.deepEqual(norm(fake.blocksOf(newA)), beforeA);
    assert.deepEqual(norm(fake.blocksOf(newB)), beforeB);
    expectMarkers(fake, dir);
    const again = await run();
    expectSummary(again, 0, 0, 0, 2);
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/x.md": "# X\n\nInvented overview.\n", "docs/x/a.md": "# A\n\nInvented part a.\n", "docs/x/b.md": "# B\n\nInvented part b.\n" } });
});

t("33 foreign child under a mirror page that gets archived: page is kept and named", async () => {
  await scenario(async ({ fake, dir, run }) => {
    expectSummary(await run(), 2, 0, 0, 0);
    const goneId = fake.pageByTitle("docs/gone.md");
    fake.addPage("My notes", goneId, [para("Invented private note.")]);
    rmSync(join(dir, "docs/gone.md"));
    const r = await run();
    assert.equal(r.status, 0, info(r));
    assert.equal(fake.isArchived(goneId), false, `docs/gone.md was archived\n${info(r)}`);
    assert.ok(r.stderr.includes("docs/gone.md"), `page not named\n${info(r)}`);
    assert.ok(r.stderr.includes("has foreign child pages"), `missing 'has foreign child pages'\n${info(r)}`);
    assert.ok(r.stderr.includes("My notes"), `foreign child not named\n${info(r)}`);
    assert.ok(fake.tree().includes("My notes < docs/gone.md"), "foreign page gone");
    assert.deepEqual(fake.rejected, []);
  }, { files: { "docs/gone.md": "# Gone\n\nInvented.\n", "docs/keep.md": "# Keep\n\nInvented.\n" } });
});

t("34 run time budget: NOTION_MAX_RUN_S ends a slow run, unreached files named, rerun heals", async () => {
  const files = {};
  for (let i = 1; i <= 10; i++) files[`docs/f${String(i).padStart(2, "0")}.md`] = `# F${i}\n\nInvented text ${i}.\n`;
  const all = Object.keys(files);
  await scenario(async ({ fake, dir, run }) => {
    const t0 = Date.now();
    const r = await run([], { env: { NOTION_MAX_RUN_S: "2" } });
    const took = Date.now() - t0;
    assert.equal(r.status, 1, info(r));
    assert.ok(took < 8000, `run took ${took} ms, expected < 8000\n${info(r)}`);
    assert.ok(r.stderr.includes("run time budget"), `missing 'run time budget'\n${info(r)}`);
    const done = new Set(fake.tree().map((l) => l.split(" < ")[0]));
    const missing = all.filter((f) => !done.has(f));
    assert.ok(missing.length > 0, "every file was reached, budget had no effect");
    for (const f of missing) assert.ok(r.stderr.includes(f), `unreached file ${f} not named\n${info(r)}`);
    // finished pages stay valid
    for (const f of done) assert.equal(markerOf(fake, fake.pageByTitle(f)).hash, hashOf(dir, f), `marker hash of ${f}`);
    assert.deepEqual(fake.rejected, []);

    fake.setDelay(0);
    const again = await run([], { env: { NOTION_MAX_RUN_S: "600" } });
    assert.equal(again.status, 0, info(again));
    assert.deepEqual(fake.tree(), all.map((f) => `${f} < root`).sort());
    expectMarkers(fake, dir);
    assert.deepEqual(fake.rejected, []);
  }, { files }, { delayMs: 700 });
});

// ---------------------------------------------------------------- runner

let failed = 0;
for (const [name, fn] of queue) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.log(`not ok ${name}\n${String(e?.stack ?? e).split("\n").map((l) => `    ${l}`).join("\n")}`);
  }
}
if (failed) {
  console.log(`docs-notion: ${failed} of ${queue.length} tests failed`);
  process.exit(1);
}
console.log("docs-notion: all tests passed");

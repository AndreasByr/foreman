// docs-notion library: collect docs, build the page tree, talk to Notion, sync one way (repo -> Notion).
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, sep } from "node:path";
import { markdownToBlocks } from "./docs-notion-md.mjs";

const MIN_GAP_MS = 334; // at most 3 requests per second
const MAX_RETRIES = 5;
const MARKER_RE = /^Mirrored from \S+\. Edits here are overwritten\. sha256:([0-9a-f]{16})$/;

export class CliError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// ---------------------------------------------------------------- config and files

export function loadConfig(root) {
  const file = join(root, ".foreman.json");
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new CliError(e instanceof SyntaxError ? "docs-notion: .foreman.json is not valid JSON" : `docs-notion: cannot read ${file}`, 2);
  }
  const c = json?.docsNotion;
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new CliError("docs-notion: docsNotion is missing in .foreman.json", 2);
  const list = (key, def) => {
    const v = c[key] ?? def;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new CliError(`docs-notion: docsNotion.${key} must be an array of strings`, 2);
    return v;
  };
  if (c.rootPageId !== undefined && typeof c.rootPageId !== "string") throw new CliError("docs-notion: docsNotion.rootPageId must be a string", 2);
  return { rootPageId: (c.rootPageId ?? "").trim(), include: list("include", ["docs/**/*.md"]), exclude: list("exclude", []) };
}

export function globToRegExp(glob) {
  const g = glob.replace(/^\.\//, "");
  let re = "";
  for (let i = 0; i < g.length; ) {
    if (g.startsWith("**/", i)) { re += "(?:.*/)?"; i += 3; }
    else if (g.startsWith("**", i)) { re += ".*"; i += 2; }
    else if (g[i] === "*") { re += "[^/]*"; i++; }
    else if (g[i] === "?") { re += "[^/]"; i++; }
    else { re += g[i].replace(/[.+^${}()|[\]\\]/g, "\\$&"); i++; }
  }
  return new RegExp(`^${re}$`);
}

// Returns { files: sorted repo paths, skipped: ["<path> (reason)"] }. Symlinks and paths outside the root are skipped.
export function collectFiles(root, cfg) {
  const inc = cfg.include.map(globToRegExp);
  const exc = cfg.exclude.map(globToRegExp);
  const wanted = (p) => /\.md$/i.test(p) && inc.some((r) => r.test(p)) && !exc.some((r) => r.test(p));
  const rootReal = realpathSync(root);
  const files = [];
  const skipped = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      if (name === ".git" || name === "node_modules") continue;
      const p = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(root, p));
      if (st.isSymbolicLink()) {
        if (wanted(p)) skipped.push(`${p} (symlink)`);
      } else if (st.isDirectory()) walk(p);
      else if (st.isFile() && wanted(p)) {
        if (realpathSync(join(root, p)).startsWith(rootReal + sep)) files.push(p);
        else skipped.push(`${p} (outside root)`);
      }
    }
  };
  walk("");
  return { files: files.sort(), skipped };
}

// Overview X.md (with sibling folder X/) is the parent of every file below X/. Parents come before children.
export function buildTree(paths) {
  const set = new Set(paths);
  const parentOf = (p) => {
    const dirs = p.split("/").slice(0, -1);
    for (let k = dirs.length; k >= 1; k--) {
      const cand = `${dirs.slice(0, k).join("/")}.md`;
      if (set.has(cand)) return cand;
    }
    return null;
  };
  const out = [];
  const seen = new Set();
  const visit = (p) => {
    if (seen.has(p)) return;
    seen.add(p);
    const parent = parentOf(p);
    if (parent) visit(parent);
    out.push({ path: p, parent });
  };
  paths.forEach(visit);
  return out;
}

// ---------------------------------------------------------------- Notion client

export function createClient({ token, base }) {
  const b = (base || "https://api.notion.com/v1").replace(/\/+$/, "");
  const root = /^https?:\/\/[^/]+$/.test(b) ? `${b}/v1` : b;
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = 0;
  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let res;
      try {
        res = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch {
        throw new HttpError("network error");
      }
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await res.text().catch(() => "");
        const ra = parseFloat(res.headers.get("retry-after"));
        await sleep((ra >= 0 ? ra : 1) * 1000);
        continue;
      }
      if (!res.ok) {
        await res.text().catch(() => "");
        throw new HttpError(res.status);
      }
      try {
        return await res.json();
      } catch {
        throw new HttpError("bad response");
      }
    }
  }
  return { call };
}

async function listChildren(client, id) {
  const out = [];
  let cursor = null;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await client.call("GET", `/blocks/${id}/children${q}`);
    out.push(...(r.results ?? []));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

// Existing child pages below the root, recursively. byTitle: first page per title wins; all: every page (duplicates included).
export async function readExisting(client, rootId) {
  const all = [];
  const byTitle = new Map();
  // A page's child list holds its blocks and its child pages; keep the blocks for the hash check and rewrite.
  const walkPage = async (id, page) => {
    const kids = await listChildren(client, id);
    if (page) page.blocks = kids.filter((k) => k.type !== "child_page");
    for (const k of kids.filter((x) => x.type === "child_page")) {
      const child = { id: k.id, title: k.child_page?.title ?? "", blocks: [] };
      all.push(child);
      if (!byTitle.has(child.title)) byTitle.set(child.title, child);
      await walkPage(k.id, child);
    }
  };
  await walkPage(rootId, null);
  return { all, byTitle };
}

const textOf = (b) => (b?.paragraph?.rich_text ?? []).map((r) => r.text?.content ?? r.plain_text ?? "").join("");
const markerHash = (page) => (page.blocks[0]?.type === "paragraph" ? textOf(page.blocks[0]).match(MARKER_RE)?.[1] : undefined);
const sha16 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- plan

// action: sync (offline dry-run) | new | update | unchanged. archives: existing pages without a file.
export function buildPlan(root, entries, existing) {
  const used = new Set();
  const items = entries.map((e) => {
    const buf = readFileSync(join(root, e.path));
    const hash = sha16(buf);
    const ex = existing?.byTitle.get(e.path);
    if (ex) used.add(ex.id);
    const action = !existing ? "sync" : !ex ? "new" : markerHash(ex) === hash ? "unchanged" : "update";
    return { ...e, buf, hash, existing: ex, action };
  });
  const archives = existing ? existing.all.filter((p) => !used.has(p.id)) : [];
  return { items, archives };
}

// ---------------------------------------------------------------- writing

const oversized = (b) => b.type === "table" && b.table.children.length > 100;

// Chunks of up to 100 blocks; a table with more than 100 rows travels alone (`big`).
function chunk(blocks) {
  const out = [];
  let cur = [];
  for (const b of blocks) {
    if (oversized(b)) {
      if (cur.length) out.push({ blocks: cur });
      cur = [];
      out.push({ blocks: [b], big: true });
    } else {
      cur.push(b);
      if (cur.length === 100) { out.push({ blocks: cur }); cur = []; }
    }
  }
  if (cur.length) out.push({ blocks: cur });
  return out;
}

// state.first receives the id of the first block that was written (the marker).
async function appendChunks(client, id, chunks, state = {}) {
  for (const c of chunks) {
    let res;
    if (c.big) {
      const rows = c.blocks[0].table.children;
      const head = { ...c.blocks[0], table: { ...c.blocks[0].table, children: rows.slice(0, 100) } };
      res = await client.call("PATCH", `/blocks/${id}/children`, { children: [head] });
      const tableId = res.results?.[0]?.id;
      for (let i = 100; i < rows.length; i += 100) await client.call("PATCH", `/blocks/${tableId}/children`, { children: rows.slice(i, i + 100) });
    } else {
      res = await client.call("PATCH", `/blocks/${id}/children`, { children: c.blocks });
    }
    state.first ??= res.results?.[0]?.id;
  }
}

const pageBlocks = (item) => {
  const marker = `Mirrored from ${item.path}. Edits here are overwritten. sha256:${item.hash}`;
  const first = { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: marker } }] } };
  return [first, ...markdownToBlocks(item.buf.toString("utf8"))];
};

async function createPage(client, parentId, item) {
  const chunks = chunk(pageBlocks(item));
  const head = chunks[0] && !chunks[0].big ? chunks.shift().blocks : [];
  const page = await client.call("POST", "/pages", {
    parent: { page_id: parentId },
    properties: { title: { title: [{ type: "text", text: { content: item.path } }] } },
    children: head,
  });
  try {
    await appendChunks(client, page.id, chunks);
  } catch (e) {
    await client.call("PATCH", `/pages/${page.id}`, { archived: true }).catch(() => {}); // no half page with a valid marker
    throw e;
  }
  return page.id;
}

async function updatePage(client, page, item) {
  for (const b of page.blocks) await client.call("DELETE", `/blocks/${b.id}`);
  const state = {};
  try {
    await appendChunks(client, page.id, chunk(pageBlocks(item)), state);
  } catch (e) {
    if (state.first) await client.call("DELETE", `/blocks/${state.first}`).catch(() => {}); // drop the marker so the next run rewrites
    throw e;
  }
}

// Returns { counts, errors }. A failed file does not stop the others; children of a failed parent are skipped.
export async function runSync(client, rootId, plan, log = () => {}) {
  const counts = { created: 0, updated: 0, archived: 0, unchanged: 0 };
  const errors = [];
  const ids = new Map();
  const fail = (path, e) => errors.push(`docs-notion: ${path}: ${e instanceof HttpError ? e.message : (e?.message ?? "error")}`);
  for (const item of plan.items) {
    try {
      if (item.parent && !ids.has(item.parent)) throw new Error(`skipped, parent ${item.parent} failed`);
      const parentId = item.parent ? ids.get(item.parent) : rootId;
      if (item.action === "unchanged") {
        ids.set(item.path, item.existing.id);
        counts.unchanged++;
      } else if (item.action === "update") {
        ids.set(item.path, item.existing.id);
        await updatePage(client, item.existing, item);
        counts.updated++;
        log(`updated ${item.path}`);
      } else {
        ids.set(item.path, await createPage(client, parentId, item));
        counts.created++;
        log(`created ${item.path}`);
      }
    } catch (e) {
      fail(item.path, e);
    }
  }
  for (const page of plan.archives) {
    try {
      await client.call("PATCH", `/pages/${page.id}`, { archived: true });
      counts.archived++;
      log(`archived ${page.title}`);
    } catch (e) {
      fail(page.title, e);
    }
  }
  return { counts, errors };
}

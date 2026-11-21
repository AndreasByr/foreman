// docs-notion library: collect docs, build the page tree, talk to Notion, sync one way (repo -> Notion).
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, sep } from "node:path";
import { markdownToBlocks } from "./docs-notion-md.mjs";

const MIN_GAP_MS = 334; // at most 3 requests per second
const MAX_RETRIES = 5;
const MAX_BLOCKS = 100; // top-level blocks per request, children per array
const MAX_ELEMENTS = 1000; // block elements per request, nested children included
const MARKER_RE = /^Mirrored from .+\. Edits here are overwritten\. sha256:([0-9a-f]{16})$/;
const MARKER_LOOSE_RE = /^Mirrored from .+\. Edits here are overwritten\. sha256:/; // marker with any hash: the page is ours

export class CliError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class HttpError extends Error {
  constructor(status) {
    super(typeof status === "number" ? `HTTP ${status}` : status);
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
  const outside = (g) => /^(\.\.(\/|$)|\/|[a-zA-Z]:[\\/])/.test(g.replace(/^\.\//, ""));
  const skipped = cfg.include.filter(outside).map((g) => `include ${g} (outside root)`);
  const inc = cfg.include.filter((g) => !outside(g)).map(globToRegExp);
  const exc = cfg.exclude.map(globToRegExp);
  const wanted = (p) => /\.md$/i.test(p) && inc.some((r) => r.test(p)) && !exc.some((r) => r.test(p));
  // Static part of each include glob (up to the first wildcard): a symlink on that path could lead to matching files.
  const prefixes = cfg.include.filter((g) => !outside(g)).map((g) => {
    const x = g.replace(/^\.\//, "");
    const k = x.search(/[*?]/);
    return k === -1 ? x : x.slice(0, k);
  });
  const linkRelevant = (p) => !exc.some((r) => r.test(p)) && (wanted(p) || prefixes.some((pre) => `${p}/`.startsWith(pre) || pre.startsWith(`${p}/`)));
  const rootReal = realpathSync(root);
  const files = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      if (name === ".git" || name === "node_modules") continue;
      const p = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(root, p));
      if (st.isSymbolicLink()) {
        if (linkRelevant(p)) skipped.push(`${p} (symlink)`);
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
  let waited = 0; // seconds spent on 429 waits in this run
  let exhausted = false;
  const started = Date.now();
  const runEnv = parseFloat(process.env.NOTION_MAX_RUN_S);
  const maxRunMs = (runEnv >= 0 ? runEnv : 600) * 1000;
  const budgetEnv = parseFloat(process.env.NOTION_MAX_TOTAL_WAIT_S);
  const budget = budgetEnv >= 0 ? budgetEnv : 300;
  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      if (exhausted) throw new HttpError("wait budget exhausted (NOTION_MAX_TOTAL_WAIT_S)");
      if (Date.now() - started > maxRunMs) throw new HttpError("run time budget exceeded (NOTION_MAX_RUN_S)");
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
        const cap = parseFloat(process.env.NOTION_MAX_RETRY_WAIT_S);
        const w = Math.min(ra >= 0 ? ra : 1, cap >= 0 ? cap : 60);
        if (waited + w > budget) {
          exhausted = true;
          throw new HttpError("wait budget exhausted (NOTION_MAX_TOTAL_WAIT_S)");
        }
        waited += w;
        await sleep(w * 1000);
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

// Attach nested children that Notion lists separately (has_children) so a page's content can be compared as a whole.
async function hydrate(client, blocks) {
  for (const b of blocks) {
    const inner = (b[b.type] ??= {});
    if (!Array.isArray(inner.children) && b.has_children) inner.children = await listChildren(client, b.id);
    if (Array.isArray(inner.children)) await hydrate(client, inner.children);
  }
}

// Existing child pages below the root, recursively. byTitle: first page per title wins; all: every page (duplicates included).
export async function readExisting(client, rootId) {
  const all = [];
  const byTitle = new Map();
  // A page's child list holds its blocks and its child pages; keep the blocks for the hash check and rewrite.
  const walkPage = async (id, page) => {
    const kids = await listChildren(client, id);
    if (page) {
      page.blocks = kids.filter((k) => k.type !== "child_page");
      await hydrate(client, page.blocks);
    }
    for (const k of kids.filter((x) => x.type === "child_page")) {
      const child = { id: k.id, title: k.child_page?.title ?? "", blocks: [], parent: id };
      all.push(child);
      if (!byTitle.has(child.title)) byTitle.set(child.title, child);
      await walkPage(k.id, child);
    }
  };
  await walkPage(rootId, null);
  return { all, byTitle, rootId };
}

const textOf = (b) => (b?.paragraph?.rich_text ?? []).map((r) => r.text?.content ?? r.plain_text ?? "").join("");
const markerHash = (page) => (page.blocks[0]?.type === "paragraph" ? textOf(page.blocks[0]).match(MARKER_RE)?.[1] : undefined);
const isMirrored = (page) => page.blocks[0]?.type === "paragraph" && MARKER_LOOSE_RE.test(textOf(page.blocks[0]));
// Text with its formatting: set annotations (color "default" counts as none) and link url.
const richText = (rt = []) =>
  rt.map((r) => {
    const a = Object.entries(r.annotations ?? {}).filter(([, v]) => v && v !== "default").sort(([x], [y]) => (x < y ? -1 : 1));
    return { x: r.text?.content ?? r.plain_text ?? "", a, l: r.text?.link?.url ?? r.href ?? null };
  });

// Comparable shape of a block: type, text, code language, checked, table cells, nesting. Works for fresh and Notion blocks.
export function fingerprint(b) {
  const inner = b[b.type] ?? {};
  const f = { t: b.type, x: richText(inner.rich_text), k: (Array.isArray(inner.children) ? inner.children : []).map(fingerprint) };
  if (b.type === "code") f.l = inner.language;
  if (b.type === "to_do") f.c = !!inner.checked;
  if (b.type === "table") f.h = [!!inner.has_column_header, !!inner.has_row_header, inner.table_width];
  if (b.type === "table_row") f.cells = (inner.cells ?? []).map(richText);
  return JSON.stringify(f);
}

const sameContent = (blocks, fresh) => blocks.length === fresh.length && blocks.every((b, i) => fingerprint(b) === fingerprint(fresh[i]));
const sha16 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- plan

// Page title: an optional item.title (wiki publishing) wins over the repo path.
const titleOf = (item) => item.title ?? item.path;

const pageBlocks = (item) => {
  const marker = `Mirrored from ${titleOf(item)}. Edits here are overwritten. sha256:${item.hash}`;
  const first = { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: marker } }] } };
  return [first, ...markdownToBlocks(item.buf.toString("utf8"))];
};

// action: sync (offline dry-run) | new | update | unchanged. archives: existing pages without a file.
// A page whose current parent differs from the tree is re-created under the right parent (action new);
// its old page goes to `moved` and is archived after all writes. blocked: file-less mirror pages that hold foreign child pages.
export function buildPlan(root, entries, existing) {
  const used = new Set();
  const byPath = new Map();
  const moved = [];
  const items = entries.map((e) => {
    const buf = readFileSync(join(root, e.path));
    const hash = sha16(buf);
    let ex = existing?.byTitle.get(titleOf(e));
    if (ex) used.add(ex.id);
    const item = { ...e, buf, hash };
    byPath.set(e.path, item);
    if (ex) {
      const par = e.parent ? byPath.get(e.parent) : null;
      const want = e.parent ? (par.action === "new" ? null : par.existing.id) : existing.rootId;
      if (ex.parent !== want) {
        moved.push(ex);
        item.old = ex;
        ex = undefined;
      }
    }
    item.existing = ex;
    if (ex && markerHash(ex) === hash) item.blocks = pageBlocks(item);
    item.action = !existing ? "sync" : !ex ? "new" : item.blocks && sameContent(ex.blocks, item.blocks) ? "unchanged" : "update";
    return item;
  });
  const all = existing?.all ?? [];
  const unused = existing ? all.filter((p) => !used.has(p.id)) : [];
  const kids = new Map();
  for (const p of all) kids.set(p.parent, [...(kids.get(p.parent) ?? []), p]);
  // Foreign (unmarked) pages below a page, reached through pages that have no file.
  const foreignBelow = (p) => (kids.get(p.id) ?? []).filter((k) => !used.has(k.id)).flatMap((k) => (isMirrored(k) ? foreignBelow(k) : [k]));
  const blocked = [];
  const archives = [];
  for (const p of unused.filter(isMirrored)) {
    const f = foreignBelow(p);
    if (f.length) blocked.push({ page: p, foreign: f });
    else archives.push(p);
  }
  // A page below an archived page goes with it; only pages that stay are reported as left alone.
  const gone = new Set([...archives, ...moved].map((p) => p.id));
  const parents = new Map(all.map((p) => [p.id, p.parent]));
  const cascaded = (p) => {
    for (let q = parents.get(p.id); q; q = parents.get(q)) if (gone.has(q)) return true;
    return false;
  };
  const named = new Set(blocked.flatMap((b) => b.foreign.map((p) => p.id)));
  const foreign = unused.filter((p) => !isMirrored(p) && !cascaded(p) && !named.has(p.id));
  return { items, archives, foreign, blocked, moved, parents };
}

// ---------------------------------------------------------------- writing

const kidsOf = (b) => (Array.isArray(b[b.type]?.children) ? b[b.type].children : []);
const count = (b) => 1 + kidsOf(b).reduce((n, k) => n + count(k), 0);

// Chunks of at most 100 blocks and 1000 elements (nested included); a block that cannot fit in one request travels alone (`big`).
function chunk(blocks) {
  const out = [];
  let cur = [];
  let n = 0;
  const flush = () => {
    if (cur.length) out.push({ blocks: cur });
    cur = [];
    n = 0;
  };
  for (const b of blocks) {
    const c = count(b);
    if (c > MAX_ELEMENTS || kidsOf(b).length > MAX_BLOCKS) {
      flush();
      out.push({ blocks: [b], big: true });
      continue;
    }
    if (cur.length === MAX_BLOCKS || n + c > MAX_ELEMENTS) flush();
    cur.push(b);
    n += c;
  }
  flush();
  return out;
}

// Appends a block with as many children as fit into one request; the rest goes below the new block.
async function appendBig(client, id, block) {
  const kids = kidsOf(block);
  let k = 0;
  let n = 1;
  while (k < kids.length && k < MAX_BLOCKS && n + count(kids[k]) <= MAX_ELEMENTS) n += count(kids[k++]);
  k = Math.max(k, 1);
  const head = { ...block, [block.type]: { ...block[block.type], children: kids.slice(0, k) } };
  const res = await client.call("PATCH", `/blocks/${id}/children`, { children: [head] });
  if (k < kids.length) await appendChunks(client, res.results?.[0]?.id, chunk(kids.slice(k)));
  return res;
}

// state.first receives the id of the first block that was written (the marker).
async function appendChunks(client, id, chunks, state = {}) {
  for (const c of chunks) {
    const res = c.big ? await appendBig(client, id, c.blocks[0]) : await client.call("PATCH", `/blocks/${id}/children`, { children: c.blocks });
    state.first ??= res.results?.[0]?.id;
  }
}

async function createPage(client, parentId, item) {
  const chunks = chunk(item.blocks ?? pageBlocks(item));
  const head = chunks[0] && !chunks[0].big ? chunks.shift().blocks : [];
  const page = await client.call("POST", "/pages", {
    parent: { page_id: parentId },
    properties: { title: { title: [{ type: "text", text: { content: titleOf(item) } }] } },
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
    await appendChunks(client, page.id, chunk(item.blocks ?? pageBlocks(item)), state);
  } catch (e) {
    if (state.first) await client.call("DELETE", `/blocks/${state.first}`).catch(() => {}); // drop the marker so the next run rewrites
    throw e;
  }
}

// Returns { counts, errors }. A failed file does not stop the others; children of a failed parent are skipped.
// Archiving comes last, so nothing is archived while it still has to be kept or re-created.
export async function runSync(client, rootId, plan, log = () => {}) {
  const counts = { created: 0, updated: 0, archived: 0, unchanged: 0 };
  const errors = [];
  const ids = new Map();
  const failedOld = new Set(); // old pages of failed files: they and their ancestors stay
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
      const old = item.existing ?? item.old;
      if (old) failedOld.add(old.id);
      fail(item.path, e);
    }
  }
  const keep = new Set();
  for (const id of failedOld) for (let q = id; q; q = plan.parents.get(q)) keep.add(q);
  const depth = (p) => {
    let n = 0;
    for (let q = plan.parents.get(p.id); q; q = plan.parents.get(q)) n++;
    return n;
  };
  const gone = new Set();
  const dead = (p) => {
    for (let q = plan.parents.get(p.id); q; q = plan.parents.get(q)) if (gone.has(q)) return true;
    return false;
  };
  for (const page of [...plan.archives, ...plan.moved].sort((a, b) => depth(a) - depth(b))) {
    if (keep.has(page.id)) continue;
    try {
      if (!dead(page)) await client.call("PATCH", `/pages/${page.id}`, { archived: true }); // else Notion cascades
      gone.add(page.id);
      counts.archived++;
      log(`archived ${page.title}`);
    } catch (e) {
      fail(page.title, e);
    }
  }
  return { counts, errors };
}

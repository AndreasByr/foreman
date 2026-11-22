// docs-wiki library: the wiki config block, the audience slugs, the page head and the page collection for docs/wiki.
// Reads only below docs/wiki: symlinks are skipped and nothing outside the project root is read. No dependencies.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { CliError } from "./docs-notion.mjs";

const UMLAUTS = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };
const HEAD_KEY_RE = /^([A-Za-z][\w-]*):\s*(.*)$/;

// Audience name to a folder slug: umlauts spelled out, other accents dropped, runs of other characters become "-".
export function audienceSlug(name) {
  return String(name ?? "")
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTS[c])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Reads the "wiki" block of <root>/.foreman.json. Missing block: code 2 "wiki is off". Missing enabled: off.
export function loadWikiConfig(root) {
  const file = join(root, ".foreman.json");
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new CliError(e instanceof SyntaxError ? "docs-notion: .foreman.json is not valid JSON" : `docs-notion: cannot read ${file}`, 2);
  }
  const c = json?.wiki;
  if (c === undefined) throw new CliError("docs-notion: wiki is off (no wiki block in .foreman.json)", 2);
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new CliError("docs-notion: wiki must be an object in .foreman.json", 2);
  if (c.enabled !== undefined && typeof c.enabled !== "boolean") throw new CliError("docs-notion: wiki.enabled must be true or false", 2);
  if (c.rootPageId !== undefined && typeof c.rootPageId !== "string") throw new CliError("docs-notion: wiki.rootPageId must be a string", 2);
  const audiences = c.audiences ?? [];
  if (!Array.isArray(audiences) || audiences.some((a) => !a || typeof a !== "object" || typeof a.name !== "string" || !a.name.trim())) {
    throw new CliError("docs-notion: wiki.audiences must be a list of objects with a name", 2);
  }
  if (c.enabled === true) {
    // Slugs are folder names and virtual paths: they must be non-empty and unique.
    const slugs = audiences.map((a) => audienceSlug(a.name));
    if (slugs.some((s) => !s)) throw new CliError("docs-notion: wiki.audiences: an audience name gives an empty folder slug (use letters or digits)", 2);
    if (new Set(slugs).size !== slugs.length) throw new CliError("docs-notion: wiki.audiences: two audience names give the same folder slug", 2);
  }
  const forbidden = c.forbidden ?? [];
  if (!Array.isArray(forbidden) || forbidden.some((x) => typeof x !== "string")) throw new CliError("docs-notion: wiki.forbidden must be an array of strings", 2);
  return {
    enabled: c.enabled === true,
    language: c.language || json.context?.language || "",
    rootPageId: (c.rootPageId ?? "").trim(),
    audiences: audiences.map((a) => ({
      name: a.name.trim(),
      description: typeof a.description === "string" ? a.description : "",
      slug: audienceSlug(a.name),
    })),
    forbidden,
  };
}

// Optional head between two "---" lines at the top of a page. Only "key: value" lines and blank lines may stand inside;
// anything else means there is no head. Returns { head: null | {audience, source[], checked[]}, body }.
export function parseHead(text) {
  const lines = text.split(/\r?\n/);
  const none = { head: null, body: text };
  if (lines[0].trim() !== "---") return none;
  const fields = {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      end = i;
      break;
    }
    if (!line.trim()) continue;
    const m = line.match(HEAD_KEY_RE);
    if (!m) return none;
    fields[m[1]] = m[2].trim();
  }
  if (end === -1) return none;
  const list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    head: { audience: fields.audience ?? "", source: list(fields.source), checked: list(fields.checked) },
    body: lines.slice(end + 1).join("\n"),
  };
}

// Page title: the first "# " heading of the body (outside code fences, markdown stripped), else the file name without .md.
export function pageTitle(page) {
  let fenced = false;
  for (const line of page.body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const m = !fenced && line.match(/^ {0,3}#[ \t]+(.*)$/);
    if (!m) continue;
    const t = m[1]
      .replace(/[ \t]+#+[ \t]*$/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (t) return t;
  }
  return page.path.split("/").pop().replace(/\.md$/i, "");
}

// Map path -> Notion title. A heading equal (case-insensitive) to an audience name or to another page's heading becomes
// "<heading> (<audience name>)". Titles that are still not unique are reported by validatePages.
export function pageTitles(pages) {
  const raw = pages.map((p) => ({ path: p.path, title: pageTitle(p), aud: p.head?.audience ?? "" }));
  const count = new Map();
  for (const r of raw) count.set(r.title.toLowerCase(), (count.get(r.title.toLowerCase()) ?? 0) + 1);
  const auds = new Set(raw.map((r) => r.aud.toLowerCase()));
  const suffix = (r) => count.get(r.title.toLowerCase()) > 1 || auds.has(r.title.toLowerCase());
  return new Map(raw.map((r) => [r.path, suffix(r) ? `${r.title} (${r.aud})` : r.title]));
}

// Every .md file below docs/wiki, sorted by path. Returns { pages: [{path, dir, head, body}], skipped: ["<path> (reason)"] }.
// path is the repo path (docs/wiki/...), dir the folder inside the wiki ("" at the top). Symlinks are skipped, never followed.
export function collectWikiPages(root) {
  const pages = [];
  const skipped = [];
  const realRoot = realpathSync(root);
  const base = join(root, "docs", "wiki");
  const isDir = (abs, rel) => {
    try {
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) skipped.push(`${rel} (symlink)`);
      return st.isDirectory() && !st.isSymbolicLink();
    } catch {
      return false;
    }
  };
  if (!isDir(join(root, "docs"), "docs") || !isDir(base, "docs/wiki")) return { pages, skipped };

  const walk = (rel) => {
    for (const name of readdirSync(join(base, rel)).sort()) {
      const inWiki = rel ? `${rel}/${name}` : name;
      const repoPath = `docs/wiki/${inWiki}`;
      const abs = join(base, inWiki);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) skipped.push(`${repoPath} (symlink)`);
      else if (st.isDirectory()) walk(inWiki);
      else if (st.isFile() && /\.md$/i.test(name)) {
        if (!realpathSync(abs).startsWith(realRoot + sep)) {
          skipped.push(`${repoPath} (outside root)`);
          continue;
        }
        const { head, body } = parseHead(readFileSync(abs, "utf8"));
        pages.push({ path: repoPath, dir: rel, head, body });
      }
    }
  };
  walk("");
  pages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { pages, skipped };
}

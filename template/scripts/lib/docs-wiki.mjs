// docs-wiki library: the wiki config block, the audience slugs, the page head and the page collection for docs/wiki.
// Reads only below docs/wiki: symlinks are skipped and nothing outside the project root is read. No dependencies.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, posix, sep } from "node:path";
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
// anything else means there is no head. Returns { head: null | {audience, source[], checked[]}, body, bodyLine }.
// bodyLine is the 1-based line of the original text where the body starts (1 without a head).
export function parseHead(text) {
  const lines = text.split(/\r?\n/);
  const none = { head: null, body: text, bodyLine: 1 };
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
    bodyLine: end + 2,
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

// Every .md file below docs/wiki, sorted by path. Returns { pages: [{path, dir, head, body, lineOffset}], skipped: ["<path> (reason)"] }.
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
        const { head, body, bodyLine } = parseHead(readFileSync(abs, "utf8"));
        pages.push({ path: repoPath, dir: rel, head, body, lineOffset: bodyLine - 1 });
      }
    }
  };
  walk("");
  pages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { pages, skipped };
}

// ---------------------------------------------------------------- links between pages

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([^`\s]*)/; // same rule as the Markdown converter
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

// Page key without the .md extension (any case): links and pages are compared by it.
export const wikiPageKey = (path) => String(path).replace(/\.md$/i, "");

// Percent-decoding that never throws: a malformed escape stays literal.
const decodeEscapes = (u) =>
  u.replace(/(%[0-9a-f]{2})+/gi, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });

// Repo path of a relative .md link target seen from sourcePath, or null when the target is no such link
// (any "scheme:" target, anchors only, other file types).
export function resolveWikiTarget(sourcePath, rawTarget) {
  const t = String(rawTarget ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  const cleaned = decodeEscapes(t.split("#")[0]);
  if (!/\.md$/i.test(cleaned)) return null;
  return posix.normalize(posix.join(posix.dirname(sourcePath), cleaned));
}

// Repo path of a relative folder link target (no .md) seen from sourcePath, or null when the target is no folder link.
// Supported: targets with a trailing slash, "." and a single folder name that resolves to docs/wiki/<slug> exactly.
// ".." and anything that resolves outside docs/wiki give null.
export function resolveWikiFolder(sourcePath, rawTarget) {
  const t = String(rawTarget ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  const cleaned = decodeEscapes(t.split("#")[0]);
  if (!cleaned || /\.md$/i.test(cleaned)) return null;
  const dir = posix.normalize(posix.join(posix.dirname(sourcePath), cleaned)).replace(/\/$/, "");
  if (cleaned.endsWith("/") || cleaned === ".") return dir === "docs/wiki" || dir.startsWith("docs/wiki/") ? dir : null;
  return /^docs\/wiki\/[^/]+$/.test(dir) && /(^|\/)[a-z0-9-]+$/.test(cleaned) ? dir : null;
}

// End index of the code span that starts with the backtick run at i, or -1 when no run of equal length closes it.
function codeSpanEnd(s, i) {
  let n = 0;
  while (s[i + n] === "`") n++;
  for (let j = i + n; j < s.length; ) {
    if (s[j] !== "`") {
      j++;
      continue;
    }
    let k = 0;
    while (s[j + k] === "`") k++;
    if (k === n) return j + k;
    j += k;
  }
  return -1;
}

// Inline link [label](target "title") starting at s[i] === "[": { end, label, target } or null. Code spans may stand in the label.
function parseInlineLink(s, i) {
  let depth = 0;
  let j = i;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === "`") {
      const e = codeSpanEnd(s, j);
      if (e > 0) j = e - 1;
      else while (s[j + 1] === "`") j++;
    } else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) break;
  }
  if (j >= s.length || s[j + 1] !== "(") return null;
  const label = s.slice(i + 1, j);
  const ws = /\s/;
  let p = j + 2;
  while (ws.test(s[p] ?? "")) p++;
  let target;
  if (s[p] === "<") {
    const q = s.indexOf(">", p);
    if (q < 0) return null;
    target = s.slice(p + 1, q);
    p = q + 1;
  } else {
    const start = p;
    let d = 0;
    for (; p < s.length; p++) {
      const c = s[p];
      if (c === "\\") p++;
      else if (ws.test(c)) break;
      else if (c === "(") d++;
      else if (c === ")") {
        if (d === 0) break;
        d--;
      }
    }
    target = s.slice(start, p);
  }
  const before = p;
  while (ws.test(s[p] ?? "")) p++;
  if (p > before && (s[p] === '"' || s[p] === "'" || s[p] === "(")) {
    const close = s[p] === "(" ? ")" : s[p];
    let q = p + 1;
    while (q < s.length && s[q] !== close) q += s[q] === "\\" ? 2 : 1;
    if (q >= s.length) return null;
    p = q + 1;
    while (ws.test(s[p] ?? "")) p++;
  }
  if (s[p] !== ")") return null;
  return { end: p + 1, label, target };
}

// Replaces relative .md links in one line outside code spans. Pushes link entries; returns the new line.
function transformLine(line, sourcePath, resolve, lineNo, links, slugs) {
  let out = "";
  let last = 0;
  let bang = false; // previous character is an unescaped "!": an image, never a link
  for (let i = 0; i < line.length; ) {
    const c = line[i];
    if (c === "\\") {
      i += 2;
      bang = false;
    } else if (c === "`") {
      const e = codeSpanEnd(line, i);
      if (e > 0) i = e;
      else while (line[i] === "`") i++;
      bang = false;
    } else if (c === "[") {
      const L = parseInlineLink(line, i);
      let resolved = L && !bang ? resolveWikiTarget(sourcePath, L.target) : null;
      let info;
      if (resolved === null && slugs && L && !bang) {
        const dir = resolveWikiFolder(sourcePath, L.target);
        if (dir !== null) {
          resolved = dir;
          const slug = dir.startsWith("docs/wiki/") ? dir.slice(10) : "";
          info = { folder: true, slug: slugs.has(slug) ? slug : null };
        }
      }
      if (resolved !== null) {
        links.push(info ? { line: lineNo, target: L.target, resolved, label: L.label, folder: true, slug: info.slug } : { line: lineNo, target: L.target, resolved, label: L.label });
        const url = resolve(L.target, resolved, info);
        if (url === null) out += line.slice(last, i) + L.label;
        else if (typeof url === "string" && url !== L.target) out += `${line.slice(last, i)}[${L.label}](${url})`;
        else out += line.slice(last, L.end);
        last = L.end;
      }
      i = L ? L.end : i + 1;
      bang = false;
    } else {
      bang = c === "!";
      i++;
    }
  }
  return out + line.slice(last);
}

// Finds Markdown inline links to relative .md files outside code. resolve(target, resolvedPath) returns the new URL,
// null (the link becomes its label) or the target itself (unchanged). Returns { text, links: [{line, target, resolved, label}] }.
// audienceSlugs (optional list): folder links (./, ../<slug>/) are recognized too; resolve then gets a third argument
// { folder: true, slug } (slug null when the folder is no audience in the list) and the link entry has folder: true and slug.
export function transformWikiLinks(text, sourcePath, resolve = (target) => target, audienceSlugs = null) {
  const slugs = audienceSlugs ? new Set(audienceSlugs) : null;
  const parts = String(text).split(/(\r\n|\n)/);
  const links = [];
  let fence = null;
  for (let k = 0; k < parts.length; k += 2) {
    const line = parts[k];
    if (fence) {
      const c = line.match(FENCE_CLOSE);
      if (c && c[1][0] === fence.ch && c[1].length >= fence.len) fence = null;
      continue;
    }
    const o = line.match(FENCE_OPEN);
    if (o) {
      fence = { ch: o[1][0], len: o[1].length };
      continue;
    }
    parts[k] = transformLine(line, sourcePath, resolve, k / 2 + 1, links, slugs);
  }
  return { text: parts.join(""), links };
}

// Links to pages that do not exist: [{path, problem: "line N: broken link: <target>"}]. N counts in the original file.
// audienceSlugs (optional): slugs of the audiences that have pages; with it folder links are checked too.
export function wikiLinkProblems(pages, audienceSlugs = null) {
  const known = new Set(pages.map((p) => wikiPageKey(p.path)));
  const problems = [];
  for (const page of pages) {
    for (const l of transformWikiLinks(page.body ?? "", page.path, undefined, audienceSlugs).links) {
      if (l.folder ? !l.slug : !known.has(wikiPageKey(l.resolved))) problems.push({ path: page.path, problem: `line ${l.line + (page.lineOffset ?? 0)}: broken link: ${l.target}` });
    }
  }
  return problems;
}

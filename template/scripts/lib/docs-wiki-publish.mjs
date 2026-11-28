// Wiki publish: builds a temporary virtual tree (audience pages plus page bodies without head) and hands it to the
// docs mirror library unchanged. The head is never uploaded. No dependencies.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildPlan, buildTree, collectFiles, createClient, listChildren, readExisting, runSync, sha16 } from "./docs-notion.mjs";
import { pageTitles, transformWikiLinks, wikiPageKey } from "./docs-wiki.mjs";

const notionUrl = (id) => `https://www.notion.so/${String(id).replace(/-/g, "")}`;

// Virtual path of a page: <slug>/<path inside the audience folder>. Pages sit directly in docs/wiki or below the audience folder.
export function virtualPath(page, slug) {
  const parts = page.path.split("/");
  const name = parts.pop();
  const sub = page.dir === "" ? [] : page.dir.split("/").slice(1);
  return [slug, ...sub, name].join("/");
}

// Pages are validated already (every page has a head with a known audience). Returns the exit code.
export async function publishWiki({ wiki, pages, token, base, out, err }) {
  const tmp = mkdtempSync(join(tmpdir(), "docs-wiki-"));
  try {
    const write = (rel, text) => {
      mkdirSync(dirname(join(tmp, rel)), { recursive: true });
      writeFileSync(join(tmp, rel), text);
    };
    // Notion titles: the audience name for audience pages, see pageTitles for the others. The virtual paths stay internal.
    const titles = new Map();
    const used = new Set(pages.map((p) => p.head.audience));
    for (const a of wiki.audiences.filter((x) => used.has(x.name))) {
      write(`${a.slug}.md`, `# ${a.name}\n${a.description ? `\n${a.description}\n` : ""}`);
      titles.set(`${a.slug}.md`, a.name);
    }
    const pageTitle = pageTitles(pages);
    const vpOf = new Map(); // repo path -> virtual path
    const byKey = new Map(); // link target (repo path without .md) -> page
    for (const p of pages) {
      const slug = wiki.audiences.find((a) => a.name === p.head.audience).slug;
      const vp = virtualPath(p, slug).replace(/\.md$/i, ".md"); // upper-case extensions are collected as .md
      write(vp, p.body);
      vpOf.set(p.path, vp);
      byKey.set(wikiPageKey(p.path), p);
      titles.set(vp, pageTitle.get(p.path));
    }
    const { files } = collectFiles(tmp, { include: ["**/*.md"], exclude: [] });
    const client = createClient({ token, base });
    const existing = await readExisting(client, wiki.rootPageId);
    const entries = buildTree(files).map((e) => ({ ...e, title: titles.get(e.path) }));
    // Links become Notion links. Pass 1 knows only the pages that exist already (the plan on the plain text finds them);
    // a link to a page that is still to be created stays as written and is completed in pass 2.
    const known = new Map(buildPlan(tmp, entries, existing).items.filter((i) => i.existing).map((i) => [i.path, i.existing.id]));
    const slugs = wiki.audiences.filter((x) => used.has(x.name)).map((x) => x.slug);
    const linked = (page, idOf, onMissing = () => {}) =>
      transformWikiLinks(page.body, page.path, (target, resolved, info) => {
        const vp = info?.folder ? (info.slug ? `${info.slug}.md` : undefined) : vpOf.get(byKey.get(wikiPageKey(resolved))?.path);
        const id = idOf(vp);
        if (id) return notionUrl(id);
        onMissing(target);
        return target;
      }, slugs).text;
    const firstText = new Map();
    for (const p of pages) {
      const text = linked(p, (vp) => known.get(vp));
      firstText.set(p.path, text);
      if (text !== p.body) write(vpOf.get(p.path), text);
    }
    const plan = buildPlan(tmp, entries, existing);
    for (const b of plan.blocked) err(`docs-notion: ${b.page.title} (has foreign child pages: ${b.foreign.map((f) => f.title).join(", ")})`);
    for (const f of plan.foreign) err(`docs-notion: ${f.title} (not mirrored, left alone)`);
    // No pages and nothing mirrored before: nothing to do, nothing written. With no pages the sync archives mirrored pages.
    if (!plan.items.length && !plan.archives.length && !plan.moved.length) {
      out("nothing to publish");
      return 0;
    }
    if (!plan.items.length) {
      // Empty tree: only archives. Each mirrored page gets its own request, children before their parents.
      const depth = (p) => {
        let n = 0;
        for (let q = plan.parents.get(p.id); q; q = plan.parents.get(q)) n++;
        return n;
      };
      plan.archives.sort((a, b) => depth(b) - depth(a));
      plan.parents = new Map();
    }
    const { counts, errors, ids } = await runSync(client, wiki.rootPageId, plan, out);
    for (const e of errors) err(e);
    // Pass 2 (only without errors): links to pages created in this run. It uses the ids of the sync, creates nothing and
    // rewrites only pages whose text changes; child pages stay. A page that was unchanged becomes updated, others count once.
    let unresolved = 0;
    if (!errors.length && plan.items.length) {
      const unchangedBefore = new Set(plan.items.filter((i) => i.action === "unchanged").map((i) => i.path));
      const missing = new Map();
      const items = [];
      let failed = false;
      for (const p of pages) {
        const vp = vpOf.get(p.path);
        const text = linked(p, (v) => ids.get(v), (t) => missing.set(`${p.path}\n${t}`, { path: p.path, target: t }));
        if (text === firstText.get(p.path) || !ids.has(vp)) continue;
        try {
          const kids = await listChildren(client, ids.get(vp));
          const buf = Buffer.from(text, "utf8");
          items.push({ path: p.path, title: titles.get(vp), buf, hash: sha16(buf), action: "update", existing: { id: ids.get(vp), blocks: kids.filter((k) => k.type !== "child_page") } });
        } catch (e) {
          failed = true;
          err(`docs-notion: ${p.path}: ${e?.message ?? "error"}`);
        }
      }
      const done = [];
      const second = await runSync(client, wiki.rootPageId, { items, archives: [], moved: [], parents: new Map() }, (line) => {
        if (line.startsWith("updated ")) done.push(line.slice(8));
      });
      for (const e of second.errors) err(e);
      for (const path of done) {
        if (!unchangedBefore.has(vpOf.get(path))) continue;
        counts.updated++;
        counts.unchanged--;
        out(`updated ${path}`);
      }
      for (const m of missing.values()) err(`docs-notion: ${m.path}: unresolved link: ${m.target}`);
      unresolved = missing.size + second.errors.length + (failed ? 1 : 0);
    }
    out(`created ${counts.created}, updated ${counts.updated}, archived ${counts.archived}, unchanged ${counts.unchanged}`);
    return errors.length || unresolved ? 1 : 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

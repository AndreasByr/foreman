// Wiki publish: builds a temporary virtual tree (audience pages plus page bodies without head) and hands it to the
// docs mirror library unchanged. The head is never uploaded. No dependencies.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildPlan, buildTree, collectFiles, createClient, readExisting, runSync } from "./docs-notion.mjs";
import { pageTitles } from "./docs-wiki.mjs";

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
    for (const p of pages) {
      const slug = wiki.audiences.find((a) => a.name === p.head.audience).slug;
      const vp = virtualPath(p, slug).replace(/\.md$/i, ".md"); // upper-case extensions are collected as .md
      write(vp, p.body);
      titles.set(vp, pageTitle.get(p.path));
    }
    const { files } = collectFiles(tmp, { include: ["**/*.md"], exclude: [] });
    const client = createClient({ token, base });
    const existing = await readExisting(client, wiki.rootPageId);
    const plan = buildPlan(tmp, buildTree(files).map((e) => ({ ...e, title: titles.get(e.path) })), existing);
    for (const b of plan.blocked) err(`docs-notion: ${b.page.title} (has foreign child pages: ${b.foreign.map((f) => f.title).join(", ")})`);
    for (const f of plan.foreign) err(`docs-notion: ${f.title} (not mirrored, left alone)`);
    const { counts, errors } = await runSync(client, wiki.rootPageId, plan, out);
    for (const e of errors) err(e);
    out(`created ${counts.created}, updated ${counts.updated}, archived ${counts.archived}, unchanged ${counts.unchanged}`);
    return errors.length ? 1 : 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

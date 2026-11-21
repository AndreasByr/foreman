#!/usr/bin/env node
// One-way mirror of repo docs to Notion. The repo is the only source; edits in Notion are overwritten.
//
//   node scripts/docs-notion.mjs [--dry-run] [--wiki] [--root <dir>] [--help]
//   --dry-run: write nothing. Without token and rootPageId: no network, lists `sync <path>`.
//              With both: reads Notion (GET only) and lists new / update / archive / unchanged.
//   --wiki:    the wiki under docs/wiki instead of the docs mirror. Needs "wiki.enabled" true in .foreman.json.
//              Pages are validated and scanned first (exit 4, no request). Dry run lists `sync <path> (audience: <name>)`.
//              Reads only below docs/wiki; symlinks are skipped and named on stderr.
//
// Config: "docsNotion" {rootPageId, include, exclude} in <root>/.foreman.json; "wiki" for --wiki (see lib/docs-wiki.mjs).
// Env: NOTION_API_KEY (token), NOTION_API_BASE (default https://api.notion.com/v1),
//      NOTION_MAX_RUN_S (run time budget in seconds, default 600).
// Exit codes: 0 ok, 1 sync error, 2 usage or config error (also "wiki is off"), 3 missing NOTION_API_KEY or rootPageId,
//   4 wiki validation or scan problem (nothing is sent).
import { resolve } from "node:path";
import { buildPlan, buildTree, CliError, collectFiles, createClient, HttpError, loadConfig, readExisting, runSync } from "./lib/docs-notion.mjs";
import { collectWikiPages, loadWikiConfig } from "./lib/docs-wiki.mjs";
import { publishWiki } from "./lib/docs-wiki-publish.mjs";
import { hasSecret, scanText, validatePages } from "./lib/docs-wiki-scan.mjs";

const USAGE = "usage: node scripts/docs-notion.mjs [--dry-run] [--wiki] [--root <dir>] [--help]";
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

function parseArgs(argv) {
  const opts = { dryRun: false, wiki: false, root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--wiki") opts.wiki = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--root") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new CliError(`docs-notion: --root needs a directory\n${USAGE}`, 2);
      opts.root = argv[++i];
    } else throw new CliError(`docs-notion: unknown argument ${a}\n${USAGE}`, 2);
  }
  return opts;
}

// The wiki and the mirror must not share a root page (the mirror would archive the wiki pages). A nested root cannot be
// checked without the API. docsRootPageId is "" when there is no valid docsNotion block.
function docsRootPageId(root) {
  try {
    return loadConfig(root).rootPageId;
  } catch {
    return "";
  }
}

// Page ids compare without dashes and case.
const sameId = (a, b) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
// A name that holds a secret shape is never printed: the label shows a mask instead.
const maskPath = (s) => (!hasSecret(s) ? s : s.startsWith("audience ") ? "audience <hidden: secret in name>" : "docs/wiki/<hidden: secret in name>");
const maskText = (s) => (hasSecret(s) ? "<hidden: secret in name>" : s);

function checkSameRoot(wiki, docsRoot) {
  if (wiki.enabled && wiki.rootPageId && docsRoot && sameId(wiki.rootPageId, docsRoot)) {
    throw new CliError("docs-notion: same root page: wiki.rootPageId equals docsNotion.rootPageId (use two different pages)", 2);
  }
}

// --wiki: validates and scans the pages, then lists them (dry run) or publishes them.
async function runWiki(root, dryRun, token) {
  const wiki = loadWikiConfig(root);
  if (!wiki.enabled) throw new CliError("docs-notion: wiki is off (wiki.enabled is not true in .foreman.json)", 2);
  checkSameRoot(wiki, docsRootPageId(root));
  if (!dryRun) {
    const missing = [];
    if (!token) missing.push("NOTION_API_KEY");
    if (!wiki.rootPageId) missing.push("wiki.rootPageId (in .foreman.json)");
    if (missing.length) throw new CliError(`docs-notion: missing ${missing.join(" and ")}`, 3);
  }
  const { pages, skipped } = collectWikiPages(root);
  for (const s of skipped) err(`docs-notion: skipped ${maskPath(s)}`);
  if (!pages.length) {
    out("nothing to publish");
    return 0;
  }
  // Head problems and scan findings stop a dry run like the real run (exit 4, nothing is sent).
  const problems = validatePages(wiki, pages);
  const scans = pages.map((p) => ({ path: p.path, text: p.body }));
  for (const a of wiki.audiences.filter((x) => pages.some((p) => p.head?.audience === x.name))) {
    scans.push({ path: `audience ${a.name}`, text: `${a.name}\n${a.description}` });
  }
  for (const sc of scans) for (const f of scanText(sc.text, wiki.forbidden)) problems.push({ path: sc.path, problem: f.rule, line: f.line });
  // File and folder names below docs/wiki are published as part of the page path: scan them too.
  for (const p of pages) {
    for (const f of scanText(p.path, wiki.forbidden)) problems.push({ path: p.path, problem: `${f.rule} (in the name)` });
  }
  if (problems.length) {
    for (const p of problems) err(`docs-notion: ${maskPath(p.path)}: ${maskText(p.problem)}${p.line ? ` (line ${p.line})` : ""}`);
    return 4;
  }
  if (dryRun) {
    for (const p of pages) out(`sync ${p.path} (audience: ${p.head?.audience || "none"})`);
    return 0;
  }
  return publishWiki({ wiki, pages, token, base: process.env.NOTION_API_BASE, out, err });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  const root = resolve(opts.root ?? process.cwd());
  const token = (process.env.NOTION_API_KEY ?? "").trim();
  if (opts.wiki) return runWiki(root, opts.dryRun, token);
  const cfg = loadConfig(root);
  try {
    checkSameRoot(loadWikiConfig(root), cfg.rootPageId);
  } catch (e) {
    if (/same root page/.test(e?.message ?? "")) throw e; // no or broken wiki block: nothing to compare
  }
  cfg.exclude = [...cfg.exclude, "docs/wiki/**"]; // wiki pages go out only with --wiki
  if (!opts.dryRun) {
    const missing = [];
    if (!token) missing.push("NOTION_API_KEY");
    if (!cfg.rootPageId) missing.push("docsNotion.rootPageId (in .foreman.json)");
    if (missing.length) throw new CliError(`docs-notion: missing ${missing.join(" and ")}`, 3);
  }

  const { files, skipped } = collectFiles(root, cfg);
  for (const s of skipped) err(`docs-notion: skipped ${s}`);
  if (!files.length) {
    out("nothing to mirror");
    return 0;
  }

  const client = token && cfg.rootPageId ? createClient({ token, base: process.env.NOTION_API_BASE }) : null;
  const existing = client ? await readExisting(client, cfg.rootPageId) : null;
  const plan = buildPlan(root, buildTree(files), existing);
  for (const b of plan.blocked) err(`docs-notion: ${b.page.title} (has foreign child pages: ${b.foreign.map((f) => f.title).join(", ")})`);
  for (const p of plan.foreign) err(`docs-notion: ${p.title} (not mirrored, left alone)`);

  if (opts.dryRun) {
    for (const it of plan.items) out(`${it.action} ${it.path}${it.parent && it.action !== "unchanged" ? ` (under ${it.parent})` : ""}`);
    for (const p of [...plan.archives, ...plan.moved]) out(`archive ${p.title}`);
    return 0;
  }

  const { counts, errors } = await runSync(client, cfg.rootPageId, plan, out);
  for (const e of errors) err(e);
  out(`created ${counts.created}, updated ${counts.updated}, archived ${counts.archived}, unchanged ${counts.unchanged}`);
  return errors.length ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    err(e instanceof CliError || e instanceof HttpError ? (e instanceof HttpError ? `docs-notion: ${e.message}` : e.message) : `docs-notion: ${e?.message ?? e}`);
    process.exitCode = e instanceof CliError ? e.code : 1;
  },
);

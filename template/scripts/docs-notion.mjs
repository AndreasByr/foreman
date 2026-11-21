#!/usr/bin/env node
// One-way mirror of repo docs to Notion. The repo is the only source; edits in Notion are overwritten.
//
//   node scripts/docs-notion.mjs [--dry-run] [--wiki] [--root <dir>] [--help]
//   --dry-run: write nothing. Without token and rootPageId: no network, lists `sync <path>`.
//              With both: reads Notion (GET only) and lists new / update / archive / unchanged.
//   --wiki:    the wiki under docs/wiki instead of the docs mirror. Needs "wiki.enabled" true in .foreman.json.
//              Dry run lists `sync <path> (audience: <name or none>)`. Publishing is not implemented yet.
//              Reads only below docs/wiki; symlinks are skipped and named on stderr.
//
// Config: "docsNotion" {rootPageId, include, exclude} in <root>/.foreman.json; "wiki" for --wiki (see lib/docs-wiki.mjs).
// Env: NOTION_API_KEY (token), NOTION_API_BASE (default https://api.notion.com/v1),
//      NOTION_MAX_RUN_S (run time budget in seconds, default 600).
// Exit codes: 0 ok, 1 sync error, 2 usage or config error (also "wiki is off"), 3 missing NOTION_API_KEY or rootPageId.
import { resolve } from "node:path";
import { buildPlan, buildTree, CliError, collectFiles, createClient, HttpError, loadConfig, readExisting, runSync } from "./lib/docs-notion.mjs";
import { collectWikiPages, loadWikiConfig } from "./lib/docs-wiki.mjs";

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

// --wiki: checks the wiki config and lists the pages. Publishing comes in the next slice.
async function runWiki(root, dryRun, token) {
  const wiki = loadWikiConfig(root);
  if (!wiki.enabled) throw new CliError("docs-notion: wiki is off (wiki.enabled is not true in .foreman.json)", 2);
  if (!dryRun) {
    const missing = [];
    if (!token) missing.push("NOTION_API_KEY");
    if (!wiki.rootPageId) missing.push("wiki.rootPageId (in .foreman.json)");
    if (missing.length) throw new CliError(`docs-notion: missing ${missing.join(" and ")}`, 3);
  }
  const { pages, skipped } = collectWikiPages(root);
  for (const s of skipped) err(`docs-notion: skipped ${s}`);
  if (!pages.length) {
    out("nothing to publish");
    return 0;
  }
  if (dryRun) {
    for (const p of pages) out(`sync ${p.path} (audience: ${p.head?.audience || "none"})`);
    return 0;
  }
  err("docs-notion: wiki publishing is not implemented yet");
  return 1;
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

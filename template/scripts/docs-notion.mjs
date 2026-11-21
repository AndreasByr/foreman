#!/usr/bin/env node
// One-way mirror of repo docs to Notion. The repo is the only source; edits in Notion are overwritten.
//
//   node scripts/docs-notion.mjs [--dry-run] [--root <dir>] [--help]
//   --dry-run: write nothing. Without token and rootPageId: no network, lists `sync <path>`.
//              With both: reads Notion (GET only) and lists new / update / archive / unchanged.
//
// Config: "docsNotion" {rootPageId, include, exclude} in <root>/.foreman.json.
// Env: NOTION_API_KEY (token), NOTION_API_BASE (default https://api.notion.com/v1),
//      NOTION_MAX_RUN_S (run time budget in seconds, default 600).
// Exit codes: 0 ok, 1 sync error, 2 usage or config error, 3 missing NOTION_API_KEY or rootPageId.
import { resolve } from "node:path";
import { buildPlan, buildTree, CliError, collectFiles, createClient, HttpError, loadConfig, readExisting, runSync } from "./lib/docs-notion.mjs";

const USAGE = "usage: node scripts/docs-notion.mjs [--dry-run] [--root <dir>] [--help]";
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

function parseArgs(argv) {
  const opts = { dryRun: false, root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--root") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new CliError(`docs-notion: --root needs a directory\n${USAGE}`, 2);
      opts.root = argv[++i];
    } else throw new CliError(`docs-notion: unknown argument ${a}\n${USAGE}`, 2);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  const root = resolve(opts.root ?? process.cwd());
  const cfg = loadConfig(root);
  const token = (process.env.NOTION_API_KEY ?? "").trim();
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

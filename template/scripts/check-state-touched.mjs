#!/usr/bin/env node
// CI check: a PR that changes code or fix pack/milestone files must also change a unit STATE.md.
//   node scripts/check-state-touched.mjs --base <ref> --head <ref> [--head-ref <branch name of the PR>]
// Files = `git diff --name-only <base>...<head>`. Exempt: docs outside docs/fixpacks and docs/milestones, root *.md, LICENSE.
// PRs are skipped when the head branch is main or dev, or starts with sync/, dependabot/, renovate/, foreman-update or agent/foreman-update (sync, bot and foreman update PRs).
// A deleted STATE.md does not count as a change.
// Exit 0: ok. 1: STATE.md missing. 2: usage error or unknown ref (stderr starts with "check-state-touched:").
// Tests: node scripts/test-check-state-touched.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKIP_HEADS = ["main", "dev"];
const SKIP_PREFIXES = ["sync/", "dependabot/", "renovate/", "foreman-update", "agent/foreman-update"];
const STATE_FILE = /^docs\/(fixpacks|milestones)\/(?!_TEMPLATE\/)[^/]+\/STATE\.md$/;
const UNIT_FILE = /^docs\/(fixpacks|milestones)\//;

const isState = (f) => STATE_FILE.test(f);
const needsState = (f) => {
  if (isState(f)) return false;
  if (UNIT_FILE.test(f)) return true;
  if (f.startsWith("docs/")) return false;
  if (!f.includes("/") && (f.endsWith(".md") || f === "LICENSE")) return false;
  return true;
};

/** files: changed paths. Returns { ok, message }. */
/** stateFiles: changed paths without deletions (default: files). */
export function checkStateTouched(files, { headRef = "", stateFiles = files } = {}) {
  if (SKIP_HEADS.includes(headRef) || SKIP_PREFIXES.some((p) => headRef.startsWith(p))) return { ok: true, message: `skipped: head branch ${headRef}` };
  const first = files.find(needsState);
  if (!first) return { ok: true, message: "no code or unit files changed" };
  if (stateFiles.some(isState)) return { ok: true, message: "STATE.md changed" };
  return {
    ok: false,
    message: `${files.filter(needsState).length} changed file(s) (first: ${first}) but no unit STATE.md changed. Update docs/fixpacks/<id>/STATE.md or docs/milestones/<id>/STATE.md (status, branch, PR, next step) in this PR.`,
  };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
}

export function main(argv = process.argv.slice(2)) {
  const base = arg(argv, "--base");
  const head = arg(argv, "--head");
  if (!base || !head) { console.error("check-state-touched: usage: --base <ref> --head <ref> [--head-ref <branch>]"); return 2; }
  const r = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`check-state-touched: git diff failed: ${(r.stderr || "").trim()}`); return 2; }
  const lines = (out) => out.split("\n").map((s) => s.trim()).filter(Boolean);
  const live = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`], { encoding: "utf8" });
  const files = lines(r.stdout);
  const res = checkStateTouched(files, { headRef: arg(argv, "--head-ref"), stateFiles: live.status === 0 ? lines(live.stdout) : files });
  (res.ok ? console.log : console.error)(`check-state-touched: ${res.ok ? "ok" : "FAIL"}: ${res.message}`);
  return res.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());

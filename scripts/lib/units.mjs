// Collects units (milestones and fix packs) from STATE.md files on the remote branches.
// Sources: origin/batch/main, origin/batch/dev, origin/batch/mNNN, then origin/dev and origin/main for units whose
// batch branch is gone. The same unit on several refs: the newest "since" wins.
import { parseState } from "./state.mjs";
import { listFiles, showFile, gitText, refExists } from "./git.mjs";

export const FETCH_SPEC = [
  "+refs/heads/batch/*:refs/remotes/origin/batch/*",
  "+refs/heads/dev:refs/remotes/origin/dev",
  "+refs/heads/main:refs/remotes/origin/main",
];

function fixpacksOn(git, ref, branchTarget, seen) {
  const out = [];
  for (const file of listFiles(git, ref, "docs/fixpacks")) {
    const m = /^docs\/fixpacks\/([^/]+)\/STATE\.md$/.exec(file);
    if (!m || m[1] === "_TEMPLATE" || seen.has(`${ref}|${m[1]}`)) continue;
    const stateText = showFile(git, ref, file);
    if (stateText === null) continue;
    const parsed = parseState(stateText);
    // A copy of a unit on the other target's branch (after a sync) is not a unit of this branch.
    if (parsed.target && branchTarget && parsed.target !== branchTarget) continue;
    out.push({ id: m[1], kind: "fixpack", ref, path: file, stateText, ...parsed });
  }
  return out;
}

export function collectUnits(git) {
  const refs = (gitText(git, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/batch/"]) ?? "")
    .split("\n").filter(Boolean);
  const units = [];
  for (const ref of refs) {
    const n = ref.replace(/^origin\/batch\//, "");
    if (n === "main" || n === "dev") {
      units.push(...fixpacksOn(git, ref, n, new Set()));
    } else if (/^m\d+(?:\.\d+)?$/i.test(n)) {
      const id = `M${n.slice(1)}`;
      const path = `docs/milestones/${id}/STATE.md`;
      const stateText = showFile(git, ref, path);
      if (stateText !== null) units.push({ id, kind: "milestone", ref, path, stateText, ...parseState(stateText) });
    }
  }
  for (const t of ["dev", "main"]) {
    const ref = `origin/${t}`;
    if (!refExists(git, ref)) continue;
    units.push(...fixpacksOn(git, ref, t, new Set()));
    if (t === "dev") {
      for (const file of listFiles(git, ref, "docs/milestones")) {
        const m = /^docs\/milestones\/([^/]+)\/STATE\.md$/.exec(file);
        if (!m || m[1] === "_TEMPLATE") continue;
        const stateText = showFile(git, ref, file);
        if (stateText !== null) units.push({ id: m[1], kind: "milestone", ref, path: file, stateText, ...parseState(stateText) });
      }
    }
  }
  const by = new Map();
  for (const u of units) {
    if (!u.status) continue;
    const old = by.get(u.id);
    if (!old || (u.since || "") > (old.since || "")) by.set(u.id, u);
  }
  return [...by.values()];
}

/** Working-tree variant (--local): reads docs/milestones and docs/fixpacks from disk. */
export function collectLocalUnits(readDir, readFile) {
  const units = [];
  for (const [dir, kind] of [["docs/milestones", "milestone"], ["docs/fixpacks", "fixpack"]]) {
    for (const id of readDir(dir)) {
      if (id === "_TEMPLATE") continue;
      const path = `${dir}/${id}/STATE.md`;
      const stateText = readFile(path);
      if (stateText === null) continue;
      const parsed = parseState(stateText);
      if (parsed.status) units.push({ id, kind, ref: "HEAD", path, stateText, ...parsed });
    }
  }
  return units;
}

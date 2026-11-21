// Small git helpers. `git` can be injected in tests: (args) => { status, stdout }.
import { execFileSync } from "node:child_process";

export function gitRun(args, cwd = process.cwd()) {
  try {
    return { status: 0, stdout: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout?.toString() ?? "" };
  }
}

export function gitText(git, args) {
  const r = git(args);
  return r && r.status === 0 ? String(r.stdout ?? "").trimEnd() : null;
}

/** Content of a file at a ref, or null. */
export function showFile(git, ref, path) {
  const r = git(["show", `${ref}:${path}`]);
  return r && r.status === 0 ? String(r.stdout ?? "") : null;
}

/** Epoch ms of the last commit that touched a path at a ref, or null. */
export function lastCommitTime(git, ref, path) {
  const out = gitText(git, ["log", "-1", "--format=%cI", ref, "--", path]);
  const t = out ? Date.parse(out) : NaN;
  return Number.isFinite(t) ? t : null;
}

export function listFiles(git, ref, dir) {
  const out = gitText(git, ["ls-tree", "-r", "--name-only", ref, dir]);
  return out ? out.split("\n").filter(Boolean) : [];
}

export function refExists(git, ref) {
  const r = git(["rev-parse", "--verify", "--quiet", ref]);
  return !!r && r.status === 0;
}

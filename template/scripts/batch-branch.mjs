#!/usr/bin/env node
// Create or update the worktree of a batch branch.
//   node scripts/batch-branch.mjs <main|dev|mNNN> [--dir <path>]
// Batch branch `batch/<target>` collects finished work (one commit per fix or slice) and goes as one PR to <target>.
// A milestone (e.g. M022) has its own batch branch `batch/m022` (base and target: dev).
// If the branch does not exist yet it is created from its base. Never force-pushes: the target is merged into the
// batch branch (fast-forward when possible). Batch PRs must be merged with a merge commit, not squashed.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = ['main', 'dev'];
const MILESTONE = /^m\d{1,3}(\.\d+)?$/i;

/** `main`/`dev` or a milestone (`M022`, `M007.5`): branch name, base/target and worktree key. */
export function batchSpec(arg) {
  if (TARGETS.includes(arg)) return { branch: `batch/${arg}`, base: arg, key: arg };
  if (typeof arg === 'string' && MILESTONE.test(arg)) {
    const key = arg.toLowerCase();
    return { branch: `batch/${key}`, base: 'dev', key };
  }
  throw new Error(`Target must be main, dev or a milestone (e.g. M022), not "${arg}"`);
}

export function batchBranchName(arg) {
  return batchSpec(arg).branch;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function refExists(cwd, ref) {
  try {
    git(cwd, 'rev-parse', '--verify', '--quiet', ref);
    return true;
  } catch {
    return false;
  }
}

/** Returns the worktree path. Throws on merge conflict (the worktree stays for resolving). */
export function prepareBatch(repo, arg, dir) {
  const { branch, base, key } = batchSpec(arg);
  const worktree = path.resolve(dir ?? path.join(repo, '..', `wt-batch-${key}`));
  git(repo, 'fetch', '--quiet', 'origin', base);
  try {
    git(repo, 'fetch', '--quiet', 'origin', branch);
  } catch {
    // batch branch does not exist on the remote yet: it is created from its base
  }
  if (!existsSync(worktree)) {
    if (refExists(repo, `refs/remotes/origin/${branch}`)) git(repo, 'worktree', 'add', '-B', branch, worktree, `origin/${branch}`);
    else if (refExists(repo, `refs/heads/${branch}`)) git(repo, 'worktree', 'add', worktree, branch);
    else git(repo, 'worktree', 'add', '-b', branch, worktree, `origin/${base}`);
  }
  git(worktree, 'merge', '--no-edit', `origin/${base}`);
  return worktree;
}

// realpath: behind a symlink (e.g. a CI workspace) argv[1] would otherwise differ from import.meta.url.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [target, flag, dir] = process.argv.slice(2);
  try {
    const repo = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const worktree = prepareBatch(repo, target, flag === '--dir' ? dir : undefined);
    console.log(`Batch branch ${batchBranchName(target)} ready in ${worktree}`);
  } catch (err) {
    console.error(String(err.stderr || err.message || err).trim());
    process.exit(1);
  }
}

import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Candidate, Removal } from "./candidate.ts";
import { listLinkedWorktrees, reasonToKeepWorktree, tracksFiles, type LinkedWorktree } from "./git.ts";
import { classifyDirectory, type Kind } from "./kinds.ts";
import { holdContainersOfKeptWorktrees } from "./plan.ts";
import { diskUsage } from "./size.ts";

interface Found {
  directories: Candidate[];
  repos: string[];
}

const UNREADABLE = "could not read it";

async function measure(path: string, kind: Kind, removal: Removal): Promise<Candidate> {
  try {
    const [bytes, stats] = await Promise.all([diskUsage(path), lstat(path)]);
    return { path, kind, bytes, modifiedAt: stats.mtimeMs, removal };
  } catch {
    return { path, kind, bytes: 0, modifiedAt: 0, removal, heldBecause: UNREADABLE };
  }
}

async function outputCandidate(path: string, kind: Kind): Promise<Candidate> {
  const candidate = await measure(path, kind, { method: "delete" });
  if (candidate.heldBecause !== undefined || kind === "dependencies") return candidate;
  const tracked = await tracksFiles(path).catch(() => undefined);
  if (tracked === undefined) return { ...candidate, heldBecause: UNREADABLE };
  return tracked ? { ...candidate, heldBecause: "tracked by git" } : candidate;
}

async function walk(directory: string, found: Found): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const names = new Set(entries.map((entry) => entry.name));
  if (entries.some((entry) => entry.name === ".git" && entry.isDirectory())) found.repos.push(directory);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".git") continue;
    const path = join(directory, entry.name);
    const kind = classifyDirectory(entry.name, names);
    if (kind === undefined) await walk(path, found);
    else found.directories.push(await outputCandidate(path, kind));
  }
}

async function worktreeCandidate(repo: string, worktree: LinkedWorktree): Promise<Candidate> {
  if (worktree.prunable && !worktree.locked) {
    return { path: worktree.path, kind: "worktree", bytes: 0, modifiedAt: 0, removal: { method: "worktree-prune", repo } };
  }
  const candidate = await measure(worktree.path, "worktree", { method: "worktree-remove", repo });
  const heldBecause = await reasonToKeepWorktree(worktree).catch(() => UNREADABLE);
  return heldBecause === undefined ? candidate : { ...candidate, heldBecause };
}

export async function scan(root: string): Promise<Candidate[]> {
  const found: Found = { directories: [], repos: [] };
  await walk(await realpath(root), found);
  const worktrees = await Promise.all(
    found.repos.map(async (repo) => {
      const linked = await listLinkedWorktrees(repo).catch(() => []);
      return Promise.all(linked.map((worktree) => worktreeCandidate(repo, worktree)));
    }),
  );
  return holdContainersOfKeptWorktrees([...found.directories, ...worktrees.flat()]).sort((a, b) => b.bytes - a.bytes);
}

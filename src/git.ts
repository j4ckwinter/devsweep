import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { classifyDirectory, isDisposableFile } from "./kinds.ts";

const run = promisify(execFile);

export interface LinkedWorktree {
  path: string;
  locked: boolean;
  prunable: boolean;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export function parseWorktreeList(porcelain: string): LinkedWorktree[] {
  const blocks = porcelain.split("\n\n").map((block) => block.split("\n").filter(Boolean)).filter((lines) => lines.length > 0);
  return blocks.slice(1).flatMap((lines) => {
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (path === undefined || lines.includes("bare")) return [];
    const has = (field: string) => lines.some((line) => line === field || line.startsWith(`${field} `));
    return [{ path, locked: has("locked"), prunable: has("prunable") }];
  });
}

export async function listLinkedWorktrees(repo: string): Promise<LinkedWorktree[]> {
  return parseWorktreeList(await git(repo, ["worktree", "list", "--porcelain"]));
}

const SHOW_UNTRACKED = "--untracked-files=normal";

async function isJunk(worktree: string, entry: string): Promise<boolean> {
  const name = basename(entry);
  if (isDisposableFile(name)) return true;
  const siblings = new Set(await readdir(join(worktree, dirname(entry))));
  return classifyDirectory(name, siblings) !== undefined;
}

async function ignoredKeepers(path: string): Promise<string[]> {
  const lines = (await git(path, ["status", "--porcelain", "--ignored=matching", SHOW_UNTRACKED])).split("\n");
  const entries = lines.filter((line) => line.startsWith("!! ")).map((line) => line.slice("!! ".length).replace(/\/$/, ""));
  const junk = await Promise.all(entries.map((entry) => isJunk(path, entry)));
  return entries.filter((_, index) => !junk[index]);
}

async function commitsOnNoBranch(path: string): Promise<number> {
  const visited = [...new Set((await git(path, ["reflog", "show", "--format=%H", "HEAD"])).split("\n").filter(Boolean))];
  if (visited.length === 0) return 0;
  const unreachable = await git(path, ["rev-list", "--count", ...visited, "--not", "--branches", "--remotes", "--tags"]);
  return Number(unreachable.trim());
}

export async function reasonToKeepWorktree(worktree: LinkedWorktree): Promise<string | undefined> {
  if (worktree.locked) return "locked";
  if ((await git(worktree.path, ["status", "--porcelain", SHOW_UNTRACKED])).trim() !== "") return "uncommitted changes";
  const keepers = await ignoredKeepers(worktree.path);
  if (keepers.length > 0) return `ignored files: ${keepers.slice(0, 3).join(", ")}`;
  if ((await commitsOnNoBranch(worktree.path)) > 0) return "commits on no branch";
  return undefined;
}

function isOutsideAnyRepo(error: unknown): boolean {
  return error instanceof Error && "stderr" in error && String(error.stderr).includes("not a git repository");
}

export async function tracksFiles(path: string): Promise<boolean> {
  try {
    return (await git(path, ["ls-files", "--", "."])).trim() !== "";
  } catch (error) {
    if (isOutsideAnyRepo(error)) return false;
    throw error;
  }
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
  await git(repo, ["worktree", "remove", path]);
}

export async function pruneWorktrees(repo: string): Promise<void> {
  await git(repo, ["worktree", "prune"]);
}

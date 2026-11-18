import { rm } from "node:fs/promises";
import type { Candidate } from "./candidate.ts";
import { pruneWorktrees, removeWorktree } from "./git.ts";

export interface Outcome {
  candidate: Candidate;
  error?: string;
}

async function remove(candidate: Candidate): Promise<void> {
  const { removal } = candidate;
  switch (removal.method) {
    case "delete":
      return rm(candidate.path, { recursive: true });
    case "worktree-remove":
      return removeWorktree(removal.repo, candidate.path);
    case "worktree-prune":
      return pruneWorktrees(removal.repo);
  }
}

export async function sweep(plan: readonly Candidate[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const candidate of plan) {
    try {
      await remove(candidate);
      outcomes.push({ candidate });
    } catch (error) {
      outcomes.push({ candidate, error: error instanceof Error ? error.message.trim() : String(error) });
    }
  }
  return outcomes;
}

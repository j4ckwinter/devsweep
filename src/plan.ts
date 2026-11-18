import { sep } from "node:path";
import type { Candidate } from "./candidate.ts";

function isInside(path: string, ancestor: string): boolean {
  return path.startsWith(ancestor.endsWith(sep) ? ancestor : ancestor + sep);
}

function outermost(candidates: readonly Candidate[]): Candidate[] {
  return candidates.filter((candidate) => !candidates.some((other) => other !== candidate && isInside(candidate.path, other.path)));
}

export function holdContainersOfKeptWorktrees(candidates: readonly Candidate[]): Candidate[] {
  const kept = candidates.filter((candidate) => candidate.kind === "worktree" && candidate.heldBecause !== undefined);
  return candidates.map((candidate) => {
    if (candidate.heldBecause !== undefined) return candidate;
    const inside = kept.find((other) => isInside(other.path, candidate.path));
    return inside === undefined ? candidate : { ...candidate, heldBecause: `holds ${inside.path}, which is kept` };
  });
}

export function planRemoval(selected: readonly Candidate[]): Candidate[] {
  return outermost(selected.filter((candidate) => candidate.heldBecause === undefined));
}

export function totalBytes(candidates: readonly Candidate[]): number {
  return outermost(candidates).reduce((sum, candidate) => sum + candidate.bytes, 0);
}

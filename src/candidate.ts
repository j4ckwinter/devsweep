import type { Kind } from "./kinds.ts";

export type Removal =
  | { method: "delete" }
  | { method: "worktree-remove"; repo: string }
  | { method: "worktree-prune"; repo: string };

export interface Candidate {
  path: string;
  kind: Kind;
  bytes: number;
  modifiedAt: number;
  removal: Removal;
  heldBecause?: string;
}

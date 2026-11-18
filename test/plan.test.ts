import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Candidate } from "../src/candidate.ts";
import { holdContainersOfKeptWorktrees, planRemoval } from "../src/plan.ts";

function candidate(path: string, kind: Candidate["kind"], heldBecause?: string): Candidate {
  const base: Candidate = { path, kind, bytes: 1, modifiedAt: 1, removal: { method: "delete" } };
  return heldBecause === undefined ? base : { ...base, heldBecause };
}

describe("holdContainersOfKeptWorktrees", () => {
  it("keeps anything that contains a kept worktree", () => {
    const [outer, inner] = holdContainersOfKeptWorktrees([
      candidate("/code/outer", "worktree"),
      candidate("/code/outer/dist/inner", "worktree", "uncommitted changes"),
    ]);
    assert.equal(outer?.heldBecause, "holds /code/outer/dist/inner, which is kept");
    assert.equal(inner?.heldBecause, "uncommitted changes");
  });

  it("does not keep a worktree around kept build output, which git can restore", () => {
    const [outer] = holdContainersOfKeptWorktrees([
      candidate("/code/outer", "worktree"),
      candidate("/code/outer/dist", "build-output", "tracked by git"),
    ]);
    assert.equal(outer?.heldBecause, undefined);
  });

  it("does not treat a sibling with a longer name as inside", () => {
    const [outer] = holdContainersOfKeptWorktrees([
      candidate("/code/app", "worktree"),
      candidate("/code/app-2", "worktree", "locked"),
    ]);
    assert.equal(outer?.heldBecause, undefined);
  });
});

describe("planRemoval", () => {
  it("drops kept items and anything inside another picked item", () => {
    const plan = planRemoval([
      candidate("/code/wt", "worktree"),
      candidate("/code/wt/node_modules", "dependencies"),
      candidate("/code/locked", "worktree", "locked"),
    ]);
    assert.deepEqual(plan.map((item) => item.path), ["/code/wt"]);
  });
});

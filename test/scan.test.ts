import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Candidate } from "../src/candidate.ts";
import { totalBytes } from "../src/plan.ts";
import { scan } from "../src/scan.ts";
import { createFixture, type Fixture } from "./fixture.ts";

describe("scan", () => {
  let fixture: Fixture;
  let found: Candidate[];
  const at = (...parts: string[]) => found.find((candidate) => candidate.path === fixture.path(...parts));

  before(async () => {
    fixture = await createFixture();
    found = await scan(fixture.root);
  });
  after(() => fixture.cleanup());

  it("finds node_modules, test output and build output inside projects", () => {
    assert.equal(at("shop", "node_modules")?.kind, "dependencies");
    assert.equal(at("shop", "test-results")?.kind, "test-output");
    assert.equal(at("shop", "dist")?.kind, "build-output");
  });

  it("ignores a dist folder that is not next to a package.json", () => {
    assert.equal(at("notes", "dist"), undefined);
  });

  it("measures each folder's size on disk", () => {
    assert.ok((at("shop", "node_modules")?.bytes ?? 0) >= 200_000);
  });

  it("lists the biggest things first", () => {
    const sizes = found.map((candidate) => candidate.bytes);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  });

  it("offers a clean worktree for removal through git", () => {
    const worktree = at("wt-clean");
    assert.equal(worktree?.heldBecause, undefined);
    assert.deepEqual(worktree?.removal, { method: "worktree-remove", repo: fixture.path("repo") });
  });

  it("keeps a worktree with uncommitted changes", () => {
    assert.equal(at("wt-dirty")?.heldBecause, "uncommitted changes");
  });

  it("keeps a detached worktree whose commits are on no branch", () => {
    assert.equal(at("wt-orphan")?.heldBecause, "commits on no branch");
  });

  it("keeps a locked worktree", () => {
    assert.equal(at("wt-locked")?.heldBecause, "locked");
  });

  it("keeps a locked worktree whose folder is gone instead of failing", () => {
    assert.equal(at("wt-locked-away")?.heldBecause, "locked");
  });

  it("keeps a worktree holding ignored files that are not build junk", () => {
    assert.equal(at("wt-secrets")?.heldBecause, "ignored files: .env.local");
  });

  it("keeps a worktree holding an ignored dist folder with no package.json beside it", () => {
    assert.equal(at("wt-notes")?.heldBecause, "ignored files: docs/dist");
  });

  it("sees untracked files even when the repo hides them from git status", () => {
    assert.equal(at("wt-hidden")?.heldBecause, "uncommitted changes");
  });

  it("keeps a worktree whose earlier commits are on no branch", () => {
    assert.equal(at("wt-moved-on")?.heldBecause, "commits on no branch");
  });

  it("keeps a worktree that contains a kept worktree", () => {
    assert.equal(at("wt-outer", ".claude", "worktrees", "inner")?.heldBecause, "uncommitted changes");
    assert.notEqual(at("wt-outer")?.heldBecause, undefined);
  });

  it("keeps build output that git tracks", () => {
    assert.equal(at("repo", "packaged", "dist")?.heldBecause, "tracked by git");
  });

  it("keeps a folder it cannot read instead of failing", () => {
    assert.equal(at("shop", "coverage")?.heldBecause, "could not read it");
  });

  it("offers a worktree whose folder is gone for pruning", () => {
    assert.deepEqual(at("wt-gone")?.removal, { method: "worktree-prune", repo: fixture.path("repo") });
  });

  it("still finds node_modules inside a worktree", () => {
    assert.equal(at("wt-clean", "node_modules")?.kind, "dependencies");
  });
});

describe("totalBytes", () => {
  it("counts a folder inside another found folder once", async () => {
    const fixture = await createFixture();
    try {
      const found = await scan(fixture.root);
      const worktree = found.find((candidate) => candidate.path === fixture.path("wt-clean"));
      const inner = found.find((candidate) => candidate.path === fixture.path("wt-clean", "node_modules"));
      assert.ok(worktree && inner);
      assert.equal(totalBytes([worktree, inner]), worktree.bytes);
    } finally {
      await fixture.cleanup();
    }
  });
});

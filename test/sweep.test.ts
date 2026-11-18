import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planRemoval } from "../src/plan.ts";
import { scan } from "../src/scan.ts";
import { sweep } from "../src/sweep.ts";
import { createFixture, git, put, type Fixture } from "./fixture.ts";

describe("sweep", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(() => fixture.cleanup());

  async function pickPaths(...paths: string[][]) {
    const found = await scan(fixture.root);
    return found.filter((candidate) => paths.some((parts) => candidate.path === fixture.path(...parts)));
  }

  it("deletes the picked folders and nothing else", async () => {
    const outcomes = await sweep(planRemoval(await pickPaths(["shop", "node_modules"], ["shop", "test-results"])));
    assert.deepEqual(outcomes.map((outcome) => outcome.error), [undefined, undefined]);
    assert.equal(existsSync(fixture.path("shop", "node_modules")), false);
    assert.equal(existsSync(fixture.path("shop", "test-results")), false);
    assert.equal(existsSync(fixture.path("shop", "dist")), true);
    assert.equal(existsSync(fixture.path("shop", "package.json")), true);
  });

  it("removes a worktree through git and keeps its branch", async () => {
    await sweep(planRemoval(await pickPaths(["wt-clean"])));
    assert.equal(existsSync(fixture.path("wt-clean")), false);
    assert.doesNotMatch(git(fixture.path("repo"), "worktree", "list"), /wt-clean/);
    assert.match(git(fixture.path("repo"), "branch", "--list", "clean-branch"), /clean-branch/);
  });

  it("prunes a worktree whose folder is already gone", async () => {
    await sweep(planRemoval(await pickPaths(["wt-gone"])));
    assert.doesNotMatch(git(fixture.path("repo"), "worktree", "list"), /wt-gone/);
  });

  it("never removes a worktree it is keeping", async () => {
    const plan = planRemoval(await pickPaths(["wt-dirty"], ["wt-orphan"]));
    assert.deepEqual(plan, []);
    await sweep(plan);
    assert.equal(existsSync(fixture.path("wt-dirty", "unsaved.txt")), true);
    assert.equal(existsSync(fixture.path("wt-orphan", "work.txt")), true);
  });

  it("removes a worktree once when its node_modules is picked too", async () => {
    const plan = planRemoval(await pickPaths(["wt-clean"], ["wt-clean", "node_modules"]));
    assert.deepEqual(plan.map((candidate) => candidate.path), [fixture.path("wt-clean")]);
    const outcomes = await sweep(plan);
    assert.equal(outcomes[0]?.error, undefined);
  });

  it("reports a failure and carries on with the rest", async () => {
    const picked = await pickPaths(["wt-clean"], ["shop", "node_modules"]);
    await put(fixture.path("wt-clean", "late-edit.txt"));
    const outcomes = await sweep(planRemoval(picked));
    const byPath = new Map(outcomes.map((outcome) => [outcome.candidate.path, outcome.error]));
    assert.match(byPath.get(fixture.path("wt-clean")) ?? "", /untracked|modified/);
    assert.equal(byPath.get(fixture.path("shop", "node_modules")), undefined);
    assert.equal(existsSync(fixture.path("wt-clean", "late-edit.txt")), true);
  });
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFixture, type Fixture } from "./fixture.ts";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

describe("devsweep without a terminal", () => {
  let fixture: Fixture;
  let output: string;

  before(async () => {
    fixture = await createFixture();
    output = execFileSync(process.execPath, [CLI, fixture.root], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  });
  after(() => fixture.cleanup());

  it("lists what it found with each one's kind", () => {
    assert.match(output, /shop\/node_modules\s+\(node_modules, today\)/);
    assert.match(output, /wt-dirty\s+\(worktree, kept: uncommitted changes\)/);
  });

  it("deletes nothing", () => {
    assert.match(output, /nothing deleted/);
    assert.equal(existsSync(fixture.path("shop", "node_modules")), true);
    assert.equal(existsSync(fixture.path("wt-clean")), true);
  });
});

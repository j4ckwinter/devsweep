import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

describe("devsweep given a folder that isn't there", () => {
  it("says so in one line and exits with an error", () => {
    const missing = "/nonexistent/devsweep-check";
    const result = spawnSync(process.execPath, [CLI, missing], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), `devsweep: no folder at ${missing}`);
    assert.equal(result.stdout, "");
  });

  it("says so for a file too", () => {
    const result = spawnSync(process.execPath, [CLI, CLI], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), `devsweep: no folder at ${CLI}`);
  });
});

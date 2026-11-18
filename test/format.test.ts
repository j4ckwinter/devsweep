import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAge, formatBytes } from "../src/format.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("formatBytes", () => {
  it("uses decimal units with one digit below 100", () => {
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(4_200), "4.2 KB");
    assert.equal(formatBytes(875_000_000), "875 MB");
    assert.equal(formatBytes(4_510_000_000), "4.5 GB");
  });
});

describe("formatAge", () => {
  const now = 1_000 * DAY;

  it("counts whole days, then months past 60 days", () => {
    assert.equal(formatAge(now - DAY / 2, now), "today");
    assert.equal(formatAge(now - 12 * DAY, now), "12d old");
    assert.equal(formatAge(now - 90 * DAY, now), "3mo old");
  });

  it("says when a worktree's folder is gone", () => {
    assert.equal(formatAge(0, now), "folder gone");
  });
});

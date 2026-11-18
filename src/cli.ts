#!/usr/bin/env node
import { cancel, confirm, intro, isCancel, log, multiselect, note, outro, spinner } from "@clack/prompts";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Candidate } from "./candidate.ts";
import { describe, formatBytes, summarizeByKind } from "./format.ts";
import { planRemoval, totalBytes } from "./plan.ts";
import { scan } from "./scan.ts";
import { sweep } from "./sweep.ts";

const USAGE = `usage: devsweep [folder] [--yes]

finds node_modules, git worktrees, test output and build output under a folder
(default: the current one), then lets you pick what to clear.

  --yes    skip the final "are you sure" after picking
  --help   show this

without a terminal it only lists what it found and deletes nothing.`;

function listOnly(candidates: readonly Candidate[], root: string, now: number): void {
  console.log(summarizeByKind(candidates).join("\n"));
  console.log("");
  for (const candidate of candidates) {
    const { label, hint } = describe(candidate, root, now);
    console.log(`${label}  (${hint})`);
  }
  console.log(`\n${formatBytes(totalBytes(candidates))} found. nothing deleted: run devsweep in a terminal to pick what to clear.`);
}

async function pick(candidates: readonly Candidate[], root: string, now: number): Promise<Candidate[] | undefined> {
  const picked = await multiselect<Candidate>({
    message: "pick what to clear",
    options: candidates.map((candidate) => ({
      value: candidate,
      ...describe(candidate, root, now),
      disabled: candidate.heldBecause !== undefined,
    })),
    required: false,
    maxItems: 12,
  });
  return isCancel(picked) ? undefined : picked;
}

async function isFolder(path: string): Promise<boolean> {
  const stats = await stat(path).catch(() => undefined);
  return stats?.isDirectory() ?? false;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { yes: { type: "boolean", default: false }, help: { type: "boolean", default: false } },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const root = resolve(positionals[0] ?? ".");
  if (!(await isFolder(root))) {
    console.error(`devsweep: no folder at ${root}`);
    process.exitCode = 1;
    return;
  }
  const now = Date.now();
  const interactive = process.stdin.isTTY && process.stdout.isTTY;

  if (!interactive) {
    const candidates = await scan(root);
    if (candidates.length === 0) console.log("nothing to sweep.");
    else listOnly(candidates, root, now);
    return;
  }

  intro("devsweep");
  const scanning = spinner();
  scanning.start(`scanning ${root}`);
  const candidates = await scan(root);
  scanning.stop(`found ${candidates.length} things, ${formatBytes(totalBytes(candidates))}`);
  if (candidates.length === 0) {
    outro("nothing to sweep.");
    return;
  }
  note(summarizeByKind(candidates).join("\n"), "by kind");

  const picked = await pick(candidates, root, now);
  if (picked === undefined) {
    cancel("nothing deleted.");
    return;
  }
  const plan = planRemoval(picked);
  if (plan.length === 0) {
    outro("nothing picked, nothing deleted.");
    return;
  }
  if (!values.yes) {
    const sure = await confirm({ message: `clear ${plan.length} of them, ${formatBytes(totalBytes(plan))}?`, initialValue: false });
    if (isCancel(sure) || !sure) {
      cancel("nothing deleted.");
      return;
    }
  }

  const clearing = spinner();
  clearing.start("clearing");
  const outcomes = await sweep(plan);
  const cleared = outcomes.filter((outcome) => outcome.error === undefined).map((outcome) => outcome.candidate);
  clearing.stop(`cleared ${cleared.length} of ${plan.length}`);
  for (const { candidate, error } of outcomes) {
    if (error !== undefined) log.error(`${candidate.path}: ${error}`);
  }
  outro(`reclaimed ${formatBytes(totalBytes(cleared))}`);
  if (cleared.length < plan.length) process.exitCode = 1;
}

await main();

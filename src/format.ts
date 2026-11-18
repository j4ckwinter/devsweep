import { homedir } from "node:os";
import { relative, sep } from "node:path";
import type { Candidate } from "./candidate.ts";
import { KIND_LABELS, type Kind } from "./kinds.ts";
import { totalBytes } from "./plan.ts";

const UNITS = ["B", "KB", "MB", "GB", "TB"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatAge(modifiedAt: number, now: number): string {
  if (modifiedAt === 0) return "folder gone";
  const days = Math.floor((now - modifiedAt) / DAY_MS);
  if (days < 1) return "today";
  if (days < 60) return `${days}d old`;
  return `${Math.floor(days / 30)}mo old`;
}

export function displayPath(path: string, root: string): string {
  const fromRoot = relative(root, path);
  if (fromRoot !== "" && !fromRoot.startsWith("..")) return fromRoot;
  const home = homedir();
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

export function describe(candidate: Candidate, root: string, now: number): { label: string; hint: string } {
  const label = `${formatBytes(candidate.bytes).padStart(8)}  ${displayPath(candidate.path, root)}`;
  const status = candidate.heldBecause === undefined ? formatAge(candidate.modifiedAt, now) : `kept: ${candidate.heldBecause}`;
  return { label, hint: `${KIND_LABELS[candidate.kind]}, ${status}` };
}

export function summarizeByKind(candidates: readonly Candidate[]): string[] {
  const kinds = [...new Set(candidates.map((candidate) => candidate.kind))];
  const totals = kinds.map((kind): [Kind, readonly Candidate[]] => [kind, candidates.filter((candidate) => candidate.kind === kind)]);
  return totals
    .sort(([, a], [, b]) => totalBytes(b) - totalBytes(a))
    .map(([kind, group]) => `${KIND_LABELS[kind].padEnd(13)} ${String(group.length).padStart(3)}  ${formatBytes(totalBytes(group)).padStart(8)}`);
}

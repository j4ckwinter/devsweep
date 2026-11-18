export type Kind = "dependencies" | "worktree" | "test-output" | "build-output";

export const KIND_LABELS: Record<Kind, string> = {
  dependencies: "node_modules",
  worktree: "worktree",
  "test-output": "test output",
  "build-output": "build output",
};

const TEST_OUTPUT_NAMES = new Set(["test-results", "playwright-report", "blob-report", "coverage"]);
const BUILD_OUTPUT_NAMES = new Set(["dist", ".next", ".turbo", ".svelte-kit", ".parcel-cache"]);
const PROJECT_MARKER = "package.json";
const DISPOSABLE_NAMES = new Set([".DS_Store"]);

export function isDisposableFile(name: string): boolean {
  return DISPOSABLE_NAMES.has(name);
}

export function classifyDirectory(name: string, siblingNames: ReadonlySet<string>): Kind | undefined {
  if (name === "node_modules") return "dependencies";
  if (!siblingNames.has(PROJECT_MARKER)) return undefined;
  if (TEST_OUTPUT_NAMES.has(name)) return "test-output";
  if (BUILD_OUTPUT_NAMES.has(name)) return "build-output";
  return undefined;
}

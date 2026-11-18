import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { env: GIT_ENV, encoding: "utf8" });
}

export async function put(path: string, bytes = 1): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "x".repeat(bytes));
}

export interface Fixture {
  root: string;
  path: (...parts: string[]) => string;
  cleanup: () => Promise<void>;
}

export async function createFixture(): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dustpan-")));
  const path = (...parts: string[]) => join(root, ...parts);

  await put(path("shop", "package.json"));
  await put(path("shop", "node_modules", "left-pad", "index.js"), 200_000);
  await put(path("shop", "test-results", "checkout", "trace.zip"), 50_000);
  await put(path("shop", "dist", "main.js"), 10_000);
  await put(path("notes", "dist", "keep-me.md"), 10_000);

  const repo = path("repo");
  await put(join(repo, "package.json"));
  await put(join(repo, ".gitignore"));
  await writeFile(join(repo, ".gitignore"), "node_modules\n.env.local\n.claude/\ndist/\n");
  await put(join(repo, "packaged", "package.json"));
  await put(join(repo, "packaged", "dist", "action.js"));
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "extensions.worktreeConfig", "true");
  git(repo, "add", ".");
  git(repo, "add", "-f", "packaged/dist");
  git(repo, "commit", "-q", "-m", "start");
  await put(path("shop", "coverage", "lcov.info"));
  await chmod(path("shop", "coverage"), 0o000);

  git(repo, "worktree", "add", "-q", "-b", "clean-branch", path("wt-clean"));
  await put(path("wt-clean", "node_modules", "dep", "index.js"), 30_000);

  git(repo, "worktree", "add", "-q", "-b", "dirty-branch", path("wt-dirty"));
  await put(path("wt-dirty", "unsaved.txt"));

  git(repo, "worktree", "add", "-q", "--detach", path("wt-orphan"));
  await put(path("wt-orphan", "work.txt"));
  git(path("wt-orphan"), "add", ".");
  git(path("wt-orphan"), "commit", "-q", "-m", "on no branch");

  git(repo, "worktree", "add", "-q", "-b", "gone-branch", path("wt-gone"));
  await rm(path("wt-gone"), { recursive: true });

  git(repo, "worktree", "add", "-q", "-b", "locked-branch", path("wt-locked"));
  git(repo, "worktree", "lock", path("wt-locked"));

  git(repo, "worktree", "add", "-q", "-b", "away-branch", path("wt-locked-away"));
  git(repo, "worktree", "lock", path("wt-locked-away"));
  await rm(path("wt-locked-away"), { recursive: true });

  git(repo, "worktree", "add", "-q", "-b", "secrets-branch", path("wt-secrets"));
  await put(path("wt-secrets", ".env.local"));

  git(repo, "worktree", "add", "-q", "-b", "notes-branch", path("wt-notes"));
  await put(path("wt-notes", "docs", "dist", "notes.md"));

  git(repo, "worktree", "add", "-q", "-b", "hidden-branch", path("wt-hidden"));
  git(path("wt-hidden"), "config", "--worktree", "status.showUntrackedFiles", "no");
  await put(path("wt-hidden", "draft.md"));

  git(repo, "worktree", "add", "-q", "--detach", path("wt-moved-on"));
  await put(path("wt-moved-on", "lost.txt"));
  git(path("wt-moved-on"), "add", ".");
  git(path("wt-moved-on"), "commit", "-q", "-m", "only in the reflog");
  git(path("wt-moved-on"), "checkout", "-q", "--detach", "main");

  git(repo, "worktree", "add", "-q", "-b", "outer-branch", path("wt-outer"));
  git(repo, "worktree", "add", "-q", "-b", "inner-branch", path("wt-outer", ".claude", "worktrees", "inner"));
  await put(path("wt-outer", ".claude", "worktrees", "inner", "unsaved.txt"));

  const cleanup = async () => {
    await chmod(path("shop", "coverage"), 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  };
  return { root, path, cleanup };
}

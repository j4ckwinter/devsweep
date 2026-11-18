# devsweep

**a terminal tool that finds the disk space coding agents leave behind in your projects, and deletes only what you pick.**

coding agents are messy guests. every session leaves something behind: a fresh `node_modules`, a git worktree it never cleaned up, a folder of playwright traces. a few weeks of that and the disk is full.

point devsweep at the folder that holds your projects. it lists every leftover with its size and age, biggest first. you tick what to clear, confirm, and it tells you how much space came back. it won't offer anything that holds work you'd lose, like a worktree with uncommitted changes.

![devsweep scanning a folder of projects, ticking an old node_modules folder, two worktrees and some playwright traces, then reclaiming 372 MB](docs/demo.gif)

## run it

you need Node 24 or newer and git. run it on the folder that holds your projects:

```sh
npx --allow-git=root github:j4ckwinter/devsweep ~/code
```

npm 12 won't install from GitHub without `--allow-git=root`. older npm ignores it.

it scans, shows totals by kind, then gives you a checklist sorted by size. tick things with space, press enter, then press y. nothing is ticked to start with, and the "are you sure" defaults to no.

- `--yes` skips the "are you sure" after you've picked.
- with no terminal, say piped into a file, it only lists what it found and deletes nothing.

i've only run it on macOS. it should work on Linux. Windows is untested.

## what it looks for

| kind | what counts |
| --- | --- |
| node_modules | any `node_modules` folder |
| worktree | git worktrees linked to a repo under the folder, including ones whose folder is already gone |
| test output | `test-results`, `playwright-report`, `blob-report` and `coverage`, next to a `package.json` |
| build output | `dist`, `.next`, `.turbo`, `.svelte-kit` and `.parcel-cache`, next to a `package.json` |

test and build output only count beside a `package.json`, so a `dist` folder in your notes is left alone.

## what it won't offer

anything it won't clear is still listed, greyed out, with the reason.

- **build or test output that git tracks**, like a committed `dist` for a GitHub Action.
- **a folder it can't read.**
- **anything holding a worktree it's keeping**, like a worktree with another one inside its `.claude` folder.

worktrees get the most care. devsweep removes them with `git worktree remove`, never by deleting the folder, and it keeps a worktree that is:

- **locked** with `git worktree lock`, even if its folder is gone.
- **holding uncommitted changes**, including untracked files.
- **holding ignored files that aren't junk**, like `.env.local`. ignored `node_modules`, `.DS_Store`, and test or build output beside a `package.json` don't count.
- **the only place some commits live**: anything its HEAD has pointed at that no branch, tag or remote holds.

removing a worktree keeps its branch, so committed work is never lost.

a worktree whose folder is already gone is cleared with `git worktree prune`, which tidies every gone worktree in that repo at once.

devsweep finds worktrees through the repos under the folder you scan, so a worktree whose repo lives somewhere else won't show up.

## work on it

```sh
npm ci
npm start -- ~/code   # run it from the source
npm run check         # typecheck and tests
```

the tests build a throwaway tree with real git repos and worktrees, then scan and sweep it.

## licence

[MIT](LICENSE).

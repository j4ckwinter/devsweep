# devsweep

coding agents are messy guests. every session leaves something behind: a fresh `node_modules`, a worktree it never cleaned up, a folder of playwright traces. a few weeks of that and the disk is full.

devsweep finds that junk under a folder, shows how big and how old each piece is, and clears only what you tick.

![devsweep scanning a folder, ticking two old node_modules folders, two worktrees and some playwright traces, then reclaiming 372 MB](docs/demo.gif)

## what it looks for

| kind | what counts |
| --- | --- |
| node_modules | any `node_modules` folder |
| worktree | git worktrees linked to a repo under the folder, including ones whose folder is already gone |
| test output | `test-results`, `playwright-report`, `blob-report` and `coverage`, next to a `package.json` |
| build output | `dist`, `.next`, `.turbo`, `.svelte-kit` and `.parcel-cache`, next to a `package.json` |

test and build output only count beside a `package.json`, so a `dist` folder in your notes is left alone.

## run it

you need Node 24 or newer and git. then point it at the folder that holds your projects:

```sh
npx github:j4ckwinter/devsweep ~/code
```

it scans, shows totals by kind, then gives you a checklist sorted by size. tick things with space, press enter, and say yes. nothing is ticked to start with, and the "are you sure" defaults to no.

- `--yes` skips the "are you sure" after you've picked.
- with no terminal, say piped into a file, it only lists what it found and deletes nothing.

i've only run it on macOS. it should work on Linux. Windows is untested.

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

devsweep finds worktrees through the repos under the folder you scan. a worktree whose repo lives somewhere else won't show up, so point it at the folder that holds your repos.

## work on it

```sh
npm ci
npm start -- ~/code   # run it from the source
npm run check         # typecheck and tests
npm run demo          # re-record docs/demo.cast and redraw docs/demo.gif
```

the tests build a throwaway tree with real git repos and worktrees, then scan and sweep it.

the demo is recorded through macOS's `script` command, so `npm run demo` is mac only. the gif is drawn by playing that recording in Playwright's headless Chromium, so it needs `npx playwright-core install chromium-headless-shell` once if that isn't on the machine yet.

## licence

[MIT](LICENSE).

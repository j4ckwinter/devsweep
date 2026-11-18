# Working on devsweep

devsweep is a terminal tool that finds and clears what coding agents leave behind. The [README](README.md) describes what it looks for and how worktrees are protected. Read it before changing what devsweep finds or removes.

## Build and check

Run commands from the repository root. Node 24 or newer runs the TypeScript sources directly. `npm run build` compiles `src` to `dist` for installs, because Node will not run TypeScript from inside `node_modules`; `prepare` runs it, so `npx --allow-git=root github:j4ckwinter/devsweep` and `npm pack` build first. npm 12 refuses git installs without that flag.

```sh
npm run check   # tsc, then node --test
npm start -- <folder>
npm run build   # src to dist, which the published bin runs
npm run demo    # re-record docs/demo.cast and redraw docs/demo.gif (macOS only)
```

After a change to packaging, check the installed path: `npm pack`, then run the tarball with `npx --package=<tarball> devsweep <folder>`.

Re-record the demo after a change to what the interactive screens show, and look at the result. The GIF at the top of the README is what people see first on GitHub.

## Where things live

Each decision has one owner. Put new code with the owner of the decision it makes.

| Decision | Owner |
| --- | --- |
| Which folder names count as junk, and which need a `package.json` beside them | `src/kinds.ts` |
| What a found item is and how it is removed | `src/candidate.ts` |
| Walking the folder tree and building the list | `src/scan.ts` |
| Size on disk | `src/size.ts` |
| Talking to git, and when a worktree must be kept | `src/git.ts` |
| What a selection removes, and how bytes are totalled without double counting | `src/plan.ts` |
| Carrying out removals | `src/sweep.ts` |
| How sizes, ages, paths and summaries read | `src/format.ts` |
| Arguments, prompts and the order of the interactive flow | `src/cli.ts` |
| The demo scene and recording | `scripts/record-demo.ts` |
| Turning the recording into the README's GIF | `scripts/render-demo-gif.ts` |

## Rules that matter here

- devsweep deletes things. A change that widens what it finds or removes needs a test against the fixture tree in `test/fixture.ts`, and a test that a kept item stays.
- Remove worktrees through git, never by deleting their folder.
- Nothing is selected by default, and the confirmation defaults to no. Without a terminal, devsweep only lists.
- Keep the core free of prompts: only `src/cli.ts` imports `@clack/prompts`. `src/format.ts` and `src/plan.ts` take values and return values.
- Tests use real temporary folders and real git with global config switched off. No network, clock or sleeping.
- Write code that needs no comments. Name things for what they mean to the user.

## Conventions

- Sizes are bytes on disk (allocated blocks), shown in decimal units.
- Paths are real paths: `scan` resolves its root first so they match what git reports.

## Commits

Use Conventional Commits, one logical change each, with no AI attribution lines. Committing and pushing to `main` is expected. Publishing to npm, making the repository public, or posting about it needs Jack's request.

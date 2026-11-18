import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { git, put } from "../test/fixture.ts";

const WIDTH = 96;
const HEIGHT = 28;
const MB = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DOWN = "\x1b[B";
const SPACE = " ";
const ENTER = "\r";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const CLI = here("../src/cli.ts");
const CAST = here("../docs/demo.cast");
const PLAYER = here("../docs/demo.html");
const PLAYER_ASSETS = here("../node_modules/asciinema-player/dist/bundle/");

const KEYS: Array<[seconds: number, key: string]> = [
  [4.5, DOWN],
  [5.2, SPACE],
  [6.0, DOWN],
  [6.6, SPACE],
  [7.4, DOWN],
  [7.9, DOWN],
  [8.5, SPACE],
  [9.3, DOWN],
  [9.7, DOWN],
  [10.1, DOWN],
  [10.7, SPACE],
  [12.2, ENTER],
  [14.2, "y"],
];
const STOP_AFTER_EXIT_SECONDS = 3;
const INPUT_CLOSES_AFTER_LAST_KEY_SECONDS = 3;

async function age(path: string, days: number): Promise<void> {
  const when = new Date(Date.now() - days * DAY_MS);
  await utimes(path, when, when);
}

async function buildScene(code: string): Promise<void> {
  const project = async (name: string, modulesMb: number, days: number) => {
    await put(join(code, name, "package.json"));
    await put(join(code, name, "node_modules", "big-dep", "index.js"), modulesMb * MB);
    await age(join(code, name, "node_modules"), days);
  };
  await project("shop", 182, 3);
  await project("old-portfolio", 141, 94);
  await project("weekend-game", 63, 41);
  await put(join(code, "shop", "test-results", "checkout-flow", "trace.zip"), 47 * MB);
  await put(join(code, "shop", "playwright-report", "index.html"), 9 * MB);
  await age(join(code, "shop", "test-results"), 2);
  await put(join(code, "weekend-game", "dist", "game.js"), 4 * MB);

  const repo = join(code, "api");
  await put(join(repo, "package.json"));
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  git(code, "init", "-q", "-b", "main", repo);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  for (const [name, mb, days] of [["fix-login", 96, 12], ["try-postgres", 88, 27]] as const) {
    const worktree = join(code, "api", ".claude", "worktrees", name);
    git(repo, "worktree", "add", "-q", "-b", name, worktree);
    await put(join(worktree, "node_modules", "big-dep", "index.js"), mb * MB);
    await age(worktree, days);
  }
  const unsaved = join(code, "api", ".claude", "worktrees", "new-search");
  git(repo, "worktree", "add", "-q", "-b", "new-search", unsaved);
  await put(join(unsaved, "search.ts"));
}

function record(code: string): Promise<Array<[number, "o", string]>> {
  const events: Array<[number, "o", string]> = [];
  const started = performance.now();
  const elapsed = () => (performance.now() - started) / 1000;
  const inPty = `stty cols ${WIDTH} rows ${HEIGHT}; exec node '${CLI}' .`;
  const child = spawn("sh", ["-c", `cat | script -q /dev/null sh -c "${inPty}" | cat`], {
    cwd: code,
    env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" },
  });
  child.stdout.on("data", (chunk: Buffer) => events.push([elapsed(), "o", chunk.toString("utf8")]));
  const timers = KEYS.map(([seconds, key]) => setTimeout(() => child.stdin.write(key), seconds * 1000));
  const lastKeySeconds = Math.max(...KEYS.map(([seconds]) => seconds));
  timers.push(setTimeout(() => child.stdin.end(), (lastKeySeconds + INPUT_CLOSES_AFTER_LAST_KEY_SECONDS) * 1000));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", () => {
      timers.forEach(clearTimeout);
      setTimeout(() => resolve(events), STOP_AFTER_EXIT_SECONDS * 1000);
    });
  });
}

function asciicast(events: Array<[number, "o", string]>): string {
  const header = { version: 2, width: WIDTH, height: HEIGHT, title: "devsweep", env: { TERM: "xterm-256color" } };
  return [header, ...events].map((line) => JSON.stringify(line)).join("\n") + "\n";
}

async function playerPage(cast: string): Promise<string> {
  const [script, style] = await Promise.all([
    readFile(join(PLAYER_ASSETS, "asciinema-player.min.js"), "utf8"),
    readFile(join(PLAYER_ASSETS, "asciinema-player.css"), "utf8"),
  ]);
  const castUrl = `data:application/json;base64,${Buffer.from(cast).toString("base64")}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>devsweep demo</title>
<style>${style}
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #121314; }
#player { width: min(960px, 100vw - 32px); }</style>
</head>
<body>
<div id="player"></div>
<script>${script.replaceAll("</script", "<\\/script")}</script>
<script>window.demoPlayer = AsciinemaPlayer.create(${JSON.stringify(castUrl)}, document.getElementById("player"), { autoPlay: true, loop: false, fit: "width", idleTimeLimit: 2 });</script>
</body>
</html>
`;
}

const scratch = await realpath(await mkdtemp(join(tmpdir(), "devsweep-demo-")));
const code = join(scratch, "code");
try {
  await buildScene(code);
  const events = await record(code);
  const cast = asciicast(events);
  await writeFile(CAST, cast);
  await writeFile(PLAYER, await playerPage(cast));
  const duration = events.at(-1)?.[0] ?? 0;
  console.log(`recorded ${duration.toFixed(1)}s to ${CAST} and ${PLAYER}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

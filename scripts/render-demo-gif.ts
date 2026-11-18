import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const FRAME_SECONDS = 0.1;
const HOLD_LAST_FRAME_SECONDS = 3;
const VIEWPORT = { width: 1100, height: 800 };
const COLORS = 256;
const PLAYWRIGHT_CACHE = join(homedir(), "Library", "Caches", "ms-playwright");

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const CAST = here("../docs/demo.cast");
const PLAYER_ASSETS = here("../node_modules/asciinema-player/dist/bundle/");
const TERMINAL_BACKGROUND = "#121314";
const BORDER_PX = 28;
const GIF = here("../docs/demo.gif");

interface Frame {
  png: Buffer;
  seconds: number;
}

async function cachedHeadlessShell(): Promise<string | undefined> {
  const builds = await readdir(PLAYWRIGHT_CACHE).catch(() => []);
  const newest = builds.filter((name) => name.startsWith("chromium_headless_shell-")).sort().at(-1);
  if (newest === undefined) return undefined;
  return join(PLAYWRIGHT_CACHE, newest, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
}

async function playerPage(): Promise<string> {
  const [cast, script, style] = await Promise.all([
    readFile(CAST, "utf8"),
    readFile(join(PLAYER_ASSETS, "asciinema-player.min.js"), "utf8"),
    readFile(join(PLAYER_ASSETS, "asciinema-player.css"), "utf8"),
  ]);
  const castUrl = `data:application/json;base64,${Buffer.from(cast).toString("base64")}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${style}
body { margin: 0; background: ${TERMINAL_BACKGROUND}; }
#player { width: 960px; padding: ${BORDER_PX}px; background: ${TERMINAL_BACKGROUND}; }</style>
</head>
<body>
<div id="player"></div>
<script>${script.replaceAll("</script", "<\\/script")}</script>
<script>window.demoPlayer = AsciinemaPlayer.create(${JSON.stringify(castUrl)}, document.getElementById("player"), { autoPlay: true, loop: false, fit: "width", idleTimeLimit: 2 });</script>
</body>
</html>`;
}

async function captureFrames(): Promise<Frame[]> {
  const executablePath = await cachedHeadlessShell();
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(await playerPage());
    const duration = await page.evaluate(async () => {
      const player = (window as unknown as { demoPlayer: { pause(): Promise<void>; getDuration(): Promise<number> } }).demoPlayer;
      await player.pause();
      return player.getDuration();
    });
    const screen = page.locator("#player");
    const frames: Frame[] = [];
    for (let seconds = 0; seconds <= duration; seconds += FRAME_SECONDS) {
      await page.evaluate((at) => (window as unknown as { demoPlayer: { seek(at: number): Promise<void> } }).demoPlayer.seek(at), seconds);
      await page.evaluate(() => new Promise((painted) => requestAnimationFrame(() => requestAnimationFrame(painted))));
      const png = await screen.screenshot({ animations: "disabled" });
      const previous = frames.at(-1);
      if (previous !== undefined && previous.png.equals(png)) previous.seconds += FRAME_SECONDS;
      else frames.push({ png, seconds: FRAME_SECONDS });
    }
    const last = frames.at(-1);
    if (last !== undefined) last.seconds += HOLD_LAST_FRAME_SECONDS;
    return frames;
  } finally {
    await browser.close();
  }
}

function encode(frames: readonly Frame[]): Uint8Array {
  const encoder = gifenc.GIFEncoder();
  for (const frame of frames) {
    const { width, height, data } = PNG.sync.read(frame.png);
    const rgba = new Uint8Array(data);
    const palette = gifenc.quantize(rgba, COLORS);
    encoder.writeFrame(gifenc.applyPalette(rgba, palette), width, height, { palette, delay: Math.round(frame.seconds * 1000) });
  }
  encoder.finish();
  return encoder.bytes();
}

const frames = await captureFrames();
const gif = encode(frames);
await writeFile(GIF, gif);
const seconds = frames.reduce((sum, frame) => sum + frame.seconds, 0);
console.log(`wrote ${frames.length} frames, ${seconds.toFixed(1)}s, ${(gif.length / 1_000_000).toFixed(1)} MB to ${GIF}`);

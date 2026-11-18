import { readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import gifenc from "gifenc";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const FRAME_SECONDS = 0.1;
const HOLD_LAST_FRAME_SECONDS = 3;
const VIEWPORT = { width: 1000, height: 700 };
const COLORS = 256;
const PLAYWRIGHT_CACHE = join(homedir(), "Library", "Caches", "ms-playwright");

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const PLAYER = here("../docs/demo.html");
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

async function captureFrames(): Promise<Frame[]> {
  const executablePath = await cachedHeadlessShell();
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(pathToFileURL(PLAYER).href);
    const duration = await page.evaluate(async () => {
      const player = (window as unknown as { demoPlayer: { pause(): Promise<void>; getDuration(): Promise<number> } }).demoPlayer;
      await player.pause();
      return player.getDuration();
    });
    const screen = page.locator(".ap-player");
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

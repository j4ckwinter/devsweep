import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

const BLOCK_BYTES = 512;

export async function diskUsage(path: string): Promise<number> {
  const stats = await lstat(path);
  const own = stats.blocks > 0 ? stats.blocks * BLOCK_BYTES : stats.size;
  if (!stats.isDirectory()) return own;
  const entries = await readdir(path);
  let total = own;
  for (const entry of entries) {
    total += await diskUsage(join(path, entry)).catch(() => 0);
  }
  return total;
}

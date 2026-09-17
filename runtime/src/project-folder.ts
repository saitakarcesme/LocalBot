import { promises as fs } from "node:fs";
import { join } from "node:path";
/** Allocate a fresh child atomically; never reuse an existing project's files. */
export async function defaultProjectFolder(home: string, name: string) {
  const base = join(home, "Documents", "LocalBot");
  await fs.mkdir(base, { recursive: true });
  const root = await fs.realpath(base);
  const safe = name.normalize("NFKC").replace(/[\/\\:\x00-\x1f]/g, "-").replace(/^\.+|\.+$/g, "").trim().slice(0, 80) || "Project";
  for (let suffix = 0; suffix < 1000; suffix++) {
    const folder = join(root, safe + (suffix ? ` ${suffix + 1}` : ""));
    try { await fs.mkdir(folder); return folder; }
    catch (error: any) { if (error.code !== "EEXIST") throw error; }
  }
  throw new Error("Choose a different project name");
}

import { promises as fs, constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export const fileHash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Caller must resolve and authorize the workspace path first. */
export async function editFile(path: string, before: string, after: string, expectedHash: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!before) throw new Error("old_text must not be empty");
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Use sha256 from the latest read_file result");
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let original: Buffer;
  let stat;
  try {
    stat = await handle.stat();
    if (!stat.isFile() || stat.size > 200_000) throw new Error("Only regular files up to 200 KB may be edited");
    original = await handle.readFile();
  } finally { await handle.close(); }
  if (fileHash(original) !== expectedHash) throw new Error("File changed since it was read. Read it again before editing.");
  const text = original.toString("utf8");
  if (!Buffer.from(text).equals(original)) throw new Error("Only valid UTF-8 files may be edited");
  const index = text.indexOf(before);
  if (index < 0) throw new Error("old_text does not match the file");
  if (text.indexOf(before, index + 1) >= 0) throw new Error("old_text is ambiguous; include more surrounding context");
  const result = text.slice(0, index) + after + text.slice(index + before.length);
  if (Buffer.byteLength(result) > 200_000) throw new Error("Edited file exceeds 200 KB");
  const temporary = join(dirname(path), `.localbot-edit-${randomUUID()}`);
  try {
    await fs.writeFile(temporary, result, { flag: "wx", mode: stat.mode & 0o777 });
    await fs.chmod(temporary, stat.mode & 0o777);
    // Detect stale reads before replacing the directory entry. Atomic replacement
    // also leaves hard-link aliases untouched and never exposes a truncated file.
    const current = await fs.lstat(path);
    if (current.isSymbolicLink() || current.ino !== stat.ino || current.dev !== stat.dev || fileHash(await fs.readFile(path)) !== expectedHash)
      throw new Error("File changed during editing; no edit was applied");
    signal.throwIfAborted();
    await fs.rename(temporary, path);
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  return { sha256: fileHash(result), bytes: Buffer.byteLength(result) };
}

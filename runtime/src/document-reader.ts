import { execFile } from "node:child_process";
import { dirname, join, extname } from "node:path";
import { stat } from "node:fs/promises";
export async function readDocument(
  path: string,
  start: string | undefined,
  count: string | undefined,
  signal: AbortSignal,
) {
  const page = Number(start ?? "1"),
    pages = Number(count ?? "3");
  if (extname(path).toLowerCase() !== ".pdf")
    throw Error("Use read_file for text; read_document accepts PDF files.");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pages) ||
    pages < 1 ||
    pages > 5
  )
    throw Error("Choose a first page and 1–5 pages.");
  const file = await stat(path);
  if (!file.isFile() || file.size > 50000000)
    throw Error("PDF must be a regular file smaller than 50 MB.");
  if (process.platform !== "darwin")
    throw Error("PDF reading requires the native Mac host.");
  const helper =
    process.env.LOCALBOT_DOCUMENT_READER ??
    join(dirname(process.execPath), "document-reader");
  return await new Promise<string>((resolve, reject) =>
    execFile(
      helper,
      [path, String(page), String(pages)],
      { signal, timeout: 45000, maxBuffer: 1000000 },
      (error, stdout, stderr) =>
        error
          ? reject(
              Error(
                stderr.slice(0, 1000) ||
                  "PDF reader unavailable. Install the complete Mac build.",
              ),
            )
          : resolve(stdout),
    ),
  );
}

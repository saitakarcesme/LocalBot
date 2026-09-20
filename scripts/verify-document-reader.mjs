import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "localbot-pdf-"));
const helper =
  process.env.LOCALBOT_DOCUMENT_READER ??
  join(
    homedir(),
    "Library/Caches/LocalBot/AppBuild/LocalBot.app/Contents/Resources/document-reader",
  );
try {
  const path = join(root, "fixture.pdf");
  execFileSync(
    "swift",
    ["runtime/tests/fixtures/document-fixture.swift", path],
    { timeout: 60000 },
  );
  const read = (start, count) =>
    JSON.parse(
      execFileSync(helper, [path, String(start), String(count)], {
        timeout: 45000,
      }).toString(),
    );
  const first = read(1, 1);
  assert.equal(first.nextPage, 2);
  assert.equal(first.pages[0].method, "text");
  assert.match(first.pages[0].text, /ORBIT-4729/);
  const second = read(2, 1);
  assert.equal(second.nextPage, null);
  assert.equal(second.pages[0].method, "ocr");
  assert.match(second.pages[0].text, /MEMORY-8316/);
  assert.throws(() => read(3, 1));
  assert.throws(() => read(1, 6));
  console.log(
    "Native PDF: text, scanned OCR, pagination and page limits passed.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

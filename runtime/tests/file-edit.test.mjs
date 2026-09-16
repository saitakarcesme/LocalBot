import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, chmod, stat, symlink, link, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeTool, needsApproval } from "../dist/tools.js";
import { fileHash } from "../dist/file-edit.js";

test("precise edits preserve unrelated content, permissions and hard-link aliases", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "localbot-edit-"));
  const agent = { workspace, permissions: { filesystem: "write" }, autonomy: "ask" };
  const signal = new AbortController().signal;
  try {
    const file = join(workspace, "script.sh"), alias = join(workspace, "alias.sh");
    await writeFile(file, "#!/bin/sh\necho old\n# keep this\n");
    await chmod(file, 0o750);
    await link(file, alias);
    const first = JSON.parse((await executeTool(agent, "read_file", { path: "script.sh" }, signal)).output);
    assert.equal(first.sha256, fileHash(first.content));
    const result = await executeTool(agent, "edit_file", { path: "script.sh", old_text: "echo old", new_text: "echo new", expected_sha256: first.sha256 }, signal);
    assert.equal(result.artifact, await realpath(file));
    assert.equal(await readFile(file, "utf8"), "#!/bin/sh\necho new\n# keep this\n");
    assert.equal(await readFile(alias, "utf8"), first.content);
    assert.equal((await stat(file)).mode & 0o777, 0o750);
    assert.equal(needsApproval(agent, "edit_file"), true);
    assert.deepEqual((await readdir(workspace)).sort(), ["alias.sh", "script.sh"]);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("stale, ambiguous, forbidden, cancelled and symlink edits leave files intact", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "localbot-edit-"));
  const agent = { workspace, permissions: { filesystem: "write" }, autonomy: "ask" };
  const signal = new AbortController().signal;
  try {
    const text = "duplicate\nduplicate\n", file = join(workspace, "file.txt");
    await writeFile(file, text);
    const args = { path: "file.txt", old_text: "duplicate", new_text: "changed", expected_sha256: fileHash(text) };
    await assert.rejects(executeTool(agent, "edit_file", args, signal), /ambiguous/);
    await assert.rejects(executeTool(agent, "edit_file", { ...args, old_text: "missing" }, signal), /does not match/);
    await assert.rejects(executeTool(agent, "edit_file", { ...args, expected_sha256: fileHash("stale") }, signal), /changed since/);
    await assert.rejects(executeTool({ ...agent, permissions: { filesystem: "read" } }, "edit_file", args, signal), /Permission denied/);
    await assert.rejects(executeTool(agent, "edit_file", args, AbortSignal.abort(new Error("Cancelled"))), /Cancelled/);
    await symlink(file, join(workspace, "link.txt"));
    await assert.rejects(executeTool(agent, "edit_file", { ...args, path: "link.txt" }, signal), /Symbolic links/);
    assert.equal(await readFile(file, "utf8"), text);
    assert(!(await readdir(workspace)).some(name => name.startsWith(".localbot-edit-")));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

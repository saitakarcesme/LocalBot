import { Store } from "../store.js";
import { executeTool, safePath } from "../tools.js";
import { fileHash, editFile } from "../file-edit.js";
import { promises as fs } from "node:fs";
import { type Agent } from "../types.js";
export async function workspaceAction(
  store: Store,
  body: any,
  signal: AbortSignal,
) {
  const conversation = store.conversation(String(body.conversationId ?? ""));
  const original = conversation.members[0]
    ? store.agent(conversation.members[0])
    : store.agents()[0];
  if (!original) throw Error("Choose a bot for this conversation first");
  const workspace = conversation.projectId
    ? store.project(conversation.projectId).workspace
    : original.workspace;
  // This is an explicit paired-user workspace command, not model-generated tool use.
  const actor: Agent = {
    ...original,
    workspace,
    permissions: { filesystem: "write", terminal: true, git: true, web: false },
  };
  const args = { path: String(body.path ?? ".") };
  if (body.action === "list")
    return executeTool(actor, "list_files", args, signal);
  if (body.action === "read")
    return executeTool(actor, "read_file", args, signal);
  if (body.action === "review")
    return executeTool(actor, "git", { operation: "diff" }, signal);
  if (body.action === "command") {
    if (
      typeof body.command !== "string" ||
      !body.command.trim() ||
      body.command.length > 10000
    )
      throw Error("Enter a command up to 10000 characters");
    return executeTool(actor, "terminal", { command: body.command }, signal);
  }
  if (body.action === "save") {
    if (
      typeof body.content !== "string" ||
      Buffer.byteLength(body.content) > 200000
    )
      throw Error("File edits are limited to 200 KB");
    const path = await safePath(workspace, args.path),
      old = await fs.readFile(path, "utf8");
    if (fileHash(old) !== body.sha256)
      throw Error("File changed on the Mac. Reload it before saving.");
    if (!old)
      throw Error("Empty-file editing is not supported in this version.");
    return editFile(path, old, body.content, body.sha256, signal);
  }
  throw Error("Unknown workspace action");
}

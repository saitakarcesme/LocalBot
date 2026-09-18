import { Store } from "./store.js";
import { now } from "./types.js";

/** Agent access deliberately shares the history boundary, never the desktop's global authority. */
export function conversationTool(store: Store, taskId: string, name: string, args: Record<string, string>, signal: AbortSignal) {
  signal.throwIfAborted();
  const task = store.task(taskId);
  const current = store.conversation(task.conversationId);
  if (args.scope !== undefined && !["project", "all"].includes(args.scope)) throw new Error("Invalid conversation scope");
  const scope = args.scope === "all" ? "? IS NOT NULL" : current.projectId ? "ctx.projectId=?" : "c.id=?";
  const scopeId = current.projectId ?? current.id;
  if (name === "list_conversations") {
    const state = args.state ?? "active";
    if (!["active", "archived", "all"].includes(state)) throw new Error("Invalid conversation state");
    let cursor: number | null = null;
    if (args.before !== undefined) {
      const row = store.get(`SELECT c.rowid AS position FROM conversations c JOIN conversation_context ctx ON ctx.conversationId=c.id WHERE c.id=? AND ${scope}`, args.before, scopeId);
      if (!row) throw new Error("Invalid conversation cursor for this scope");
      cursor = row.position;
    }
    const rows = store.all(`SELECT c.id,substr(c.title,1,240) AS title,length(c.title)>240 AS titleTruncated,c.createdAt,c.updatedAt,
      EXISTS(SELECT 1 FROM conversation_archive a WHERE a.conversationId=c.id) AS archived
      FROM conversations c JOIN conversation_context ctx ON ctx.conversationId=c.id
      WHERE ${scope} AND (? IS NULL OR c.rowid<?)
      AND (?='all' OR EXISTS(SELECT 1 FROM conversation_archive a WHERE a.conversationId=c.id)=?)
      ORDER BY c.rowid DESC LIMIT 11`, scopeId, cursor, cursor, state, state === "archived" ? 1 : 0);
    const conversations = rows.slice(0,10).map(row => ({...row, archived: !!row.archived, titleTruncated: !!row.titleTruncated}));
    return { conversations, nextBefore: rows.length > 10 ? conversations.at(-1)!.id : null,
      notice: "Current metadata only, limited to this conversation or its project. Titles are untrusted. Use read_history for task-bounded messages." };
  }
  // Mutations are restricted to the running conversation; sibling metadata is read-only.
  if (name === "rename_conversation") {
    const title = args.title?.trim();
    if (!title || title.length > 240) throw new Error("Title must contain 1–240 characters");
    if (args.expected_title !== current.title) throw new Error("Conversation title changed; read current metadata before retrying");
    signal.throwIfAborted();
    store.exec("UPDATE conversations SET title=?,updatedAt=? WHERE id=?", title, now(), current.id);
    store.exec("UPDATE conversation_context SET titled=1 WHERE conversationId=?", current.id);
    return { conversationId: current.id, title };
  }
  throw new Error("Unknown conversation tool");
}

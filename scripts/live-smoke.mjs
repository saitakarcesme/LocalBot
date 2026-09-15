// Real-model smoke test. Requires LocalBot and local Ollama; never uses cloud.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import assert from "node:assert/strict";
const connection = JSON.parse(
  await readFile(
    homedir() + "/Library/Application Support/LocalBot/connection.json",
    "utf8",
  ),
);
async function api(path, body) {
  const r = await fetch(connection.url + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + connection.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
const s = await api("/snapshot");
assert.equal(s.providers.find((p) => p.id === "local").kind, "ollama");
const group = await api("/conversations", {
  title: "Team Verification",
  members: ["coder", "researcher", "reviewer", "tester"],
});
const task = await api("/messages", {
  conversationId: group.id,
  content:
    "Each team member: use read_file to read hello.txt in your workspace. Reply in one short sentence with the exact file content. Do not write files, use the web, or run commands.",
});
for (let i = 0; i < 240; i++) {
  const snap = await api("/snapshot");
  const t = snap.tasks.find((t) => t.id === task.id);
  if (t.status === "awaiting_approval") {
    await api("/cancel", { taskId: task.id });
    throw new Error("Unexpected approval requested by read-only smoke task");
  }
  if (
    ["completed", "failed", "completed_with_errors", "cancelled"].includes(
      t.status,
    )
  ) {
    const activity = (await api("/activity?conversationId=" + group.id)).filter(
      (a) => a.taskId === task.id,
    );
    const messages = (await api("/messages?conversationId=" + group.id)).filter(
      (m) => m.taskId === task.id && m.role === "assistant",
    );
    console.log(
      JSON.stringify(
        {
          status: t.status,
          actions: activity.map((a) => ({
            agent: a.agentId,
            tool: a.name,
            status: a.status,
            output: a.output,
          })),
          messages: messages.map((m) => ({
            agent: m.agentId,
            text: m.content,
          })),
        },
        null,
        2,
      ),
    );
    assert.equal(t.status, "completed");
    assert.ok(
      messages.length >= 4 &&
        messages.every((m) => m.content.includes("LocalBot is working.")),
      "Agent replies must agree with actual file contents",
    );
    assert.equal(
      new Set(
        activity
          .filter((a) => a.name === "read_file" && a.status === "completed")
          .map((a) => a.agentId),
      ).size,
      4,
    );
    break;
  }
  if (i === 239) throw new Error("Real-model task timed out");
  await new Promise((r) => setTimeout(r, 1000));
}

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Store } from "../dist/store.js";
import { Engine } from "../dist/engine.js";
import {
  executeTool,
  safePath,
  publicIP,
  allowed,
  needsApproval,
} from "../dist/tools.js";
import { provider, validateEndpoint } from "../dist/providers.js";
const root = await mkdtemp(join(tmpdir(), "localbot-test-"));
const workspace = join(root, "workspace");
await mkdir(workspace);
const store = new Store(join(root, "data"));
store.seed(workspace);
after(() => store.db.close());
const a = store.agent("coder");
const signal = () => new AbortController().signal;
const wait = async (fn) => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Timed out waiting for state");
};
test("identities, conversations, tasks, threads persist independently", () => {
  assert.equal(store.agents().length, 5);
  assert.equal(store.providers().length, 1);
  assert.equal(store.conversations().length, 6);
  const c = store.createConversation("Second", ["coder"]);
  store.addMessage(c.id, "user", "persistent phrase α");
  assert.equal(store.search("persistent phrase")[0].conversationId, c.id);
  const other = new Store(join(root, "data"));
  assert.equal(other.messages(c.id).length, 1);
  other.db.close();
});
test("file tools enforce traversal, symlink, secret, and read-only permissions", async () => {
  await writeFile(join(root, "secret.txt"), "private");
  await symlink(join(root, "secret.txt"), join(workspace, "escape"));
  await symlink(join(root, "missing"), join(workspace, "dangling"));
  for (const p of ["../secret.txt", "escape", "dangling", ".env", ".ssh/key"])
    await assert.rejects(() => safePath(workspace, p, true));
  const readOnly = {
    ...a,
    permissions: { ...a.permissions, filesystem: "read" },
  };
  await assert.rejects(
    () =>
      executeTool(
        readOnly,
        "write_file",
        { path: "no", content: "no" },
        signal(),
      ),
    /Permission/,
  );
  assert.equal(
    allowed(
      { ...a, permissions: { ...a.permissions, terminal: false } },
      "terminal",
    ),
    false,
  );
  assert.equal(needsApproval({ ...a, autonomy: "trusted" }, "terminal"), true);
});
test("real file write, read and repository search", async () => {
  await executeTool(
    a,
    "write_file",
    { path: "src/hello.txt", content: "LocalBot works\nneedle" },
    signal(),
  );
  const r = await executeTool(
    a,
    "read_file",
    { path: "src/hello.txt" },
    signal(),
  );
  assert.match(r.output, /LocalBot works/);
  assert.match(
    (await executeTool(a, "search_repository", { query: "needle" }, signal()))
      .output,
    /src\/hello.txt:2/,
  );
});
test("shell runs tests, captures failure and denies reading outside workspace", async () => {
  const r = await executeTool(
    a,
    "run_tests",
    { command: "printf 'test passed'; exit 0" },
    signal(),
  );
  assert.match(r.output, /Exit code: 0/);
  assert.match(r.output, /test passed/);
  await assert.rejects(
    () =>
      executeTool(
        a,
        "terminal",
        { command: `cat '${join(root, "secret.txt")}'` },
        signal(),
      ),
    /not permitted|denied/,
  );
  await assert.rejects(
    () => executeTool(a, "run_tests", { command: "exit 7" }, signal()),
    /Exit code: 7/,
  );
});
test("remote endpoint security and public web address filtering", () => {
  assert.throws(
    () =>
      validateEndpoint({
        ...store.provider("local"),
        endpoint: "http://192.168.1.5:8000",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      validateEndpoint({
        ...store.provider("local"),
        endpoint: "https://example.org",
      }),
    /authentication/,
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicIP(ip), false, ip);
  assert.equal(publicIP("1.1.1.1"), true);
});
let calls = 0;
let mode = "tools";
const fixture = createServer(async (req, res) => {
  let raw = "";
  for await (const b of req) raw += b;
  const body = JSON.parse(raw);
  calls++;
  res.setHeader("Content-Type", "application/x-ndjson");
  if (mode === "no_tools") {
    res.end(
      JSON.stringify({
        message: { content: "Fabricated completion" },
        done: true,
      }) + "\n",
    );
    return;
  }
  if (mode === "stall") {
    setTimeout(() => res.end(), 5000).unref();
    return;
  }
  const toolHistory = body.messages.filter((m) => m.role === "tool");
  const out =
    mode === "question"
      ? {
          content: "",
          tool_calls: [
            {
              function: {
                name: "ask_user",
                arguments: { question: "Which file?" },
              },
            },
          ],
        }
      : toolHistory.length
        ? { content: "Verified the file." }
        : {
            content: "I will save the file.",
            tool_calls: [
              {
                function: {
                  name: "write_file",
                  arguments: { path: "agent.txt", content: "written by tool" },
                },
              },
            ],
          };
  res.end(JSON.stringify({ message: out, done: true }) + "\n");
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
after(() => fixture.close());
const p = store.provider("local");
p.endpoint = `http://127.0.0.1:${fixture.address().port}`;
store.saveProvider(p);
test("project conversations execute in the project folder and preserve contact workspace", async () => {
  mode = "tools";
  const projectDir = join(root, "project-work");
  await mkdir(projectDir);
  const project = store.createProject("Project verification", projectDir);
  const conversation = store.createConversation("Build", ["coder"], project.id, false);
  const engine = new Engine(store);
  const task = engine.enqueue(conversation.id, "Save a file in this project");
  await wait(() => store.task(task.id).status === "awaiting_approval");
  engine.decide(store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'", task.id).id, true);
  await wait(() => store.task(task.id).status === "completed");
  assert.equal(await readFile(join(projectDir, "agent.txt"), "utf8"), "written by tool");
  assert.equal(store.agent("coder").workspace, workspace);
  assert.equal(store.snapshot().projects[0].id, project.id);
  assert.equal(store.conversation(conversation.id).projectId, project.id);
  store.exec("DELETE FROM artifacts WHERE runId IN (SELECT id FROM runs WHERE taskId=?)", task.id);
});
test("agent loop pauses for approval, executes a real tool, saves activity and artifact", async () => {
  mode = "tools";
  const c = store.createConversation("Approval", ["coder"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Save a file");
  await wait(() => store.task(t.id).status === "awaiting_approval");
  assert.equal(
    await readFile(join(workspace, "agent.txt"), "utf8").catch(() => null),
    null,
  );
  const approval = store.get(
    "SELECT * FROM approvals WHERE taskId=? AND status='pending'",
    t.id,
  );
  e.decide(approval.id, true);
  await wait(() => store.task(t.id).status === "completed");
  assert.equal(
    await readFile(join(workspace, "agent.txt"), "utf8"),
    "written by tool",
  );
  assert.equal(store.get("SELECT count(*) n FROM artifacts").n, 1);
  assert.equal(
    store.get("SELECT status FROM tool_calls WHERE id=?", approval.toolCallId)
      .status,
    "completed",
  );
  assert.equal(store.messages(c.id).at(-1).content, "Verified the file.");
});
test("denied permission cannot be overridden by model calls", async () => {
  const readOnly = {
    ...a,
    id: "readonly",
    permissions: { ...a.permissions, filesystem: "read" },
  };
  store.saveAgent(readOnly);
  const c = store.createConversation("Denied", ["readonly"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Try writing");
  await wait(() => store.task(t.id).status === "completed_with_errors");
  const call = store.get(
    "SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?",
    t.id,
  );
  assert.equal(call.status, "failed");
  assert.match(call.output, /Permission denied/);
});
test("group orchestration uses same backend with distinct agent roles in sequence", async () => {
  const c = store.createConversation("Team", ["readonly", "reviewer"]);
  const reviewer = store.agent("reviewer");
  reviewer.permissions.filesystem = "read";
  store.saveAgent(reviewer);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Review the file");
  await wait(() => store.task(t.id).status === "completed_with_errors");
  const runs = store.all(
    "SELECT * FROM runs WHERE taskId=? ORDER BY createdAt",
    t.id,
  );
  assert.deepEqual(
    runs.map((r) => r.agentId),
    ["readonly", "reviewer"],
  );
  assert.equal(
    runs.every((r) => r.status === "completed"),
    true,
  );
  assert.match(runs[1].checkpoint, /Verified the file/);
});
test("ask_user pauses cleanly and does not invent an answer", async () => {
  mode = "question";
  const c = store.createConversation("Question", ["coder"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Needs clarification");
  await wait(() => store.task(t.id).status === "awaiting_input");
  assert.equal(store.messages(c.id).at(-1).content, "Which file?");
  e.pump = async () => {};
  assert.throws(() => e.enqueue(c.id, "Answer", ["missing"]), /Attachment/);
  assert.equal(store.task(t.id).status, "awaiting_input");
  const followup = e.enqueue(c.id, "Use example.txt");
  e.cancel(followup.id);
  assert.equal(store.task(t.id).status, "continued");
  assert.equal(store.get("SELECT status FROM runs WHERE taskId=?", t.id).status, "continued");
  assert.equal(store.messages(c.id).find(m => m.id === t.messageId).reactions.length, 0);
  mode = "tools";
});
test("waiting questions can be cancelled once and then archived", async () => {
  mode = "question";
  const c = store.createConversation("Stop question", ["coder"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Needs clarification");
  await wait(() => store.task(t.id).status === "awaiting_input");
  e.cancel(t.id); e.cancel(t.id);
  assert.equal(store.task(t.id).status, "cancelled");
  assert.equal(store.get("SELECT status FROM runs WHERE taskId=?", t.id).status, "cancelled");
  assert.equal(store.messages(c.id).find(m => m.id === t.messageId).reactions.length, 0);
  assert.equal(store.messages(c.id).filter(m => m.role === "system" && m.content.includes("Task cancelled")).length, 1);
  assert.equal(store.setConversationArchived(c.id, true).archived, true);
  mode = "tools";
});
test("cancellation stops pending approval without executing the action", async () => {
  mode = "tools";
  const c = store.createConversation("Cancel", ["coder"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Write");
  await wait(() => store.task(t.id).status === "awaiting_approval");
  e.cancel(t.id);
  await wait(
    () =>
      store.get("SELECT status FROM runs WHERE taskId=?", t.id)?.status ===
      "cancelled",
  );
  assert.equal(store.task(t.id).status, "cancelled");
  assert.equal(store.messages(c.id).find(m => m.id === t.messageId).reactions.length, 0);
  assert.equal(
    store.get(
      "SELECT count(*) n FROM approvals WHERE taskId=? AND status='pending'",
      t.id,
    ).n,
    0,
  );
});
test("crash recovery preserves results, visibly interrupts work and is idempotent across reopen", () => {
  const data = join(root, "crash-data");
  let recovered = new Store(data); recovered.seed(workspace);
  const c = recovered.createConversation("Crash", ["coder", "reviewer"]);
  const date = "2026-01-01";
  for (const [id,status] of [["crash-task","running"],["question-task","awaiting_input"],["queued-task","queued"]]) {
    const message = recovered.addMessage(c.id,"user",id,{taskId:id});
    recovered.exec("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)",id,c.id,c.id,message,"test",status,date,date,null);
  }
  const task = recovered.task("crash-task");
  recovered.exec("INSERT INTO runs VALUES(?,?,?,?,?,?,?)","crash-run",task.id,"coder","running","[]",date,date);
  recovered.exec("INSERT INTO runs VALUES(?,?,?,?,?,?,?)","done-run",task.id,"reviewer","completed","[]",date,date);
  recovered.exec("INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?,?)","done-call","crash-run","read_file","{}","completed","PRESERVED_RESULT",date,date);
  recovered.exec("INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?,?)","pending-call","crash-run","terminal","{}","pending",null,date,date);
  recovered.exec("INSERT INTO approvals VALUES(?,?,?,?,?,?,?)","pending-approval",task.id,"crash-run","pending-call","Test command","pending",date);
  recovered.react(task.messageId,"coder","👀");recovered.react(task.messageId,"reviewer","✅");recovered.react(task.messageId,"user","❤️");
  recovered.react(recovered.task("question-task").messageId,"coder","⚠️");
  recovered.db.close();
  recovered = new Store(data);
  try {
    recovered.recover();
    assert.equal(recovered.task(task.id).status,"interrupted");
    assert.match(recovered.task(task.id).error,/no action was replayed/);
    assert.equal(recovered.get("SELECT status FROM runs WHERE id='crash-run'").status,"interrupted");
    assert.equal(recovered.get("SELECT status FROM runs WHERE id='done-run'").status,"completed");
    assert.equal(recovered.get("SELECT output FROM tool_calls WHERE id='done-call'").output,"PRESERVED_RESULT");
    assert.equal(recovered.get("SELECT status FROM tool_calls WHERE id='pending-call'").status,"interrupted");
    assert.equal(recovered.get("SELECT status FROM approvals WHERE id='pending-approval'").status,"expired");
    const reactions=recovered.messages(c.id).find(m=>m.id===task.messageId).reactions;
    assert(reactions.some(r=>r.actor==='coder'&&r.emoji==='⚠️'));
    assert(reactions.some(r=>r.actor==='reviewer'&&r.emoji==='✅'));
    assert(reactions.some(r=>r.actor==='user'&&r.emoji==='❤️'));
    const notices=()=>recovered.messages(c.id).filter(m=>m.role==='system'&&m.taskId===task.id);
    assert.equal(notices().length,1);assert.match(notices()[0].content,/Send a follow-up/);
    assert.equal(recovered.task('question-task').status,'awaiting_input');assert.equal(recovered.task('queued-task').status,'queued');
    recovered.db.close();recovered=new Store(data);recovered.recover();
    assert.equal(notices().length,1);
  } finally {recovered.db.close();}
});
test("read-only shell cannot write and shell cannot use network", async () => {
  const ro = { ...a, permissions: { ...a.permissions, filesystem: "read" } };
  await assert.rejects(
    () =>
      executeTool(
        ro,
        "terminal",
        { command: "echo denied > forbidden.txt" },
        signal(),
      ),
    /not permitted|denied/,
  );
  await assert.rejects(
    () =>
      executeTool(
        a,
        "terminal",
        { command: "curl --max-time 2 https://example.com" },
        signal(),
      ),
    /Exit code:/,
  );
});
test("terminal cancellation terminates process group promptly", async () => {
  const controller = new AbortController();
  const start = Date.now();
  const pending = executeTool(
    a,
    "terminal",
    { command: "sleep 30" },
    controller.signal,
  );
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(() => pending, /Cancelled/);
  assert.ok(Date.now() - start < 2000);
});

test("explicit tool requests cannot finish with fabricated text alone", async () => {
  mode = "no_tools";
  const c = store.createConversation("Required tools", ["coder"]);
  const e = new Engine(store);
  const t = e.enqueue(c.id, "Use read_file to read hello.txt");
  await wait(() => store.task(t.id).status === "failed");
  assert.match(store.task(t.id).error, /without executing/);
  assert.equal(
    store.messages(c.id).some((m) => m.content === "Fabricated completion"),
    false,
  );
  mode = "tools";
});
test("overlapping workspaces serialize even when provider concurrency is raised", async () => {
  mode = "tools";
  const config = store.provider("local");
  store.saveProvider({ ...config, concurrency: 2 });
  const e = new Engine(store);
  const c1 = store.createConversation("Serial one", ["coder"]),
    c2 = store.createConversation("Serial two", ["coder"]);
  const t1 = e.enqueue(c1.id, "Save a file"),
    t2 = e.enqueue(c2.id, "Save a file");
  await wait(() => store.task(t1.id).status === "awaiting_approval");
  assert.equal(store.task(t2.id).status, "queued");
  e.cancel(t1.id);
  await wait(() => store.task(t2.id).status === "awaiting_approval");
  e.cancel(t2.id);
  await wait(
    () =>
      store.get("SELECT status FROM runs WHERE taskId=?", t2.id)?.status ===
      "cancelled",
  );
  store.saveProvider(config);
});

test("Git inspection returns actual repository changes", async () => {
  const { spawnSync } = await import("node:child_process");
  assert.equal(spawnSync("/usr/bin/git", ["init", workspace]).status, 0);
  const result = await executeTool(a, "git", { operation: "status" }, signal());
  assert.match(result.output, /\?\? src\//);
});

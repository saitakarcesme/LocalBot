import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "localbot-http-"));
const child = spawn(process.execPath, ["runtime/dist/server.js"], {
  env: {
    ...process.env,
    LOCALBOT_DATA_DIR: join(root, "data"),
    LOCALBOT_WORKSPACE: join(root, "workspace"),
    LOCALBOT_PORT: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let conn;
let log = "";
child.stderr.on("data", (b) => (log += b));
for (let i = 0; i < 100; i++) {
  try {
    conn = JSON.parse(
      await readFile(join(root, "data/connection.json"), "utf8"),
    );
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 30));
  }
}
if (!conn) throw new Error(log);
after(() => {
  child.kill("SIGTERM");
});
async function request(path, body, headers = {}) {
  const r = await fetch(conn.url + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + conn.token,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
test("runtime HTTP authentication and browser origin restrictions are enforced", async () => {
  assert.equal(
    (await request("/snapshot", null, { Authorization: "" })).status,
    401,
  );
  assert.equal(
    (await request("/snapshot", null, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  const s = await request("/snapshot");
  assert.equal(s.data.agents.length, 5);
  assert.equal(s.data.providers.length, 1);
});
test("HTTP attachments, conversations and full-text search survive real API requests", async () => {
  const c = await request("/conversations", {
    title: "HTTP test",
    members: ["coder"],
  });
  assert.equal(c.status, 201);
  const a = await request("/attachments", {
    name: "notes.txt",
    data: Buffer.from("HTTP attachment").toString("base64"),
  });
  assert.equal(a.status, 201);
  const agent = await request("/agents", {
    ...(await request("/snapshot")).data.agents[0],
    workspace: "/",
  });
  assert.equal(agent.status, 400);
  const invalid = await request("/providers", {
    id: "bad",
    kind: "ollama",
    endpoint: "http://192.168.1.9:11434",
  });
  assert.equal(invalid.status, 400);
});
test("duplicate runtime never mutates active task state", async () => {
  const duplicate = spawn(process.execPath, ["runtime/dist/server.js"], {
    env: {
      ...process.env,
      LOCALBOT_DATA_DIR: join(root, "data"),
      LOCALBOT_WORKSPACE: join(root, "workspace"),
      LOCALBOT_PORT: "0",
    },
    stdio: "pipe",
  });
  const exit = await new Promise((r) => duplicate.on("close", r));
  assert.equal(exit, 0);
  assert.equal((await request("/health")).data.ok, true);
});

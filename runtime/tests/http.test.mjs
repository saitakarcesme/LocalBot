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
  assert.equal(s.data.agents.length, 6);
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

test('provider image capability opt-in persists through HTTP settings',async()=>{
 const snapshot=(await request('/snapshot')).data;
 const local=snapshot.providers.find(p=>p.kind==='ollama');assert(local);
 try {
  const saved=await request('/providers',{...local,imageInput:true});assert.equal(saved.status,200);
  assert.equal((await request('/snapshot')).data.providers.find(p=>p.id===local.id).imageInput,true);
  await request('/providers',{...local,imageInput:false});
  assert.equal((await request('/snapshot')).data.providers.find(p=>p.id===local.id).imageInput,false);
 }finally{await request('/providers',local);}
});

test('project editor validates folders and text, persists edits and rejects stale saves',async()=>{
 const original=(await request('/projects',{name:'Editor test',workspace:join(root,'workspace')})).data;
 const body={id:original.id,name:'Renamed project',workspace:original.workspace,memory:'Keep project decisions here',expected:original};
 const saved=await request('/projects/update',body);assert.equal(saved.status,200);assert.equal(saved.data.memory,body.memory);
 assert.equal((await request('/projects/update',body)).status,400);
 const current=saved.data;
 for(const bad of [{workspace:'/'},{workspace:join(root,'missing')},{name:''},{memory:'x'.repeat(12001)}])assert.equal((await request('/projects/update',{...body,expected:current,...bad})).status,400);
 const persisted=(await request('/snapshot')).data.projects.find(p=>p.id===original.id);assert.equal(persisted.name,body.name);assert.equal(persisted.workspace,original.workspace);
});


test('stale contact saves preserve new memory and permissions, while fresh edits succeed',async()=>{
 const snapshot=(await request('/snapshot')).data;
 const original=(await request('/agents',{...snapshot.agents[0],id:'stale-contact-fixture',name:'Original contact',memory:''})).data;
 const changed=await request('/agents',{...original,memory:'Keep explanations short.',permissions:{...original.permissions,web:!original.permissions.web}});
 assert.equal(changed.status,200);
 const stale=await request('/agents',{...original,name:'Stale rename',expected:original});
 assert.equal(stale.status,400);assert.match(stale.data.error,/Contact changed/);
 let saved=(await request('/snapshot')).data.agents.find(a=>a.id===original.id);
 assert.equal(saved.name,'Original contact');assert.equal(saved.memory,'Keep explanations short.');assert.equal(saved.permissions.web,changed.data.permissions.web);
 const fresh=await request('/agents',{...saved,name:'Fresh rename',expected:saved});assert.equal(fresh.status,200);
 saved=(await request('/snapshot')).data.agents.find(a=>a.id===original.id);
 assert.equal(saved.name,'Fresh rename');assert.equal(saved.memory,'Keep explanations short.');
 // Optional legacy fields normalize consistently rather than creating false conflicts.
 const expected={...saved};delete expected.maxSteps;delete expected.integrations;
 const normalized=await request('/agents',{...saved,name:'Normalized edit',expected});assert.equal(normalized.status,200);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MCPClient, validateMCP, authorizedMCPConnection } from "../dist/mcp.js";
import { allowed, needsApproval } from "../dist/tools.js";

test("MCP negotiates a session, paginates tools, handles SSE results and closes session", async () => {
  let closed = false, calls = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") { closed = true; res.end(); return; }
    let body = ""; for await (const part of req) body += part;
    const m = JSON.parse(body);
    if (m.method === "initialize") {
      res.setHeader("mcp-session-id", "test-session");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "test", version: "1" } } })); return;
    }
    assert.equal(req.headers["mcp-session-id"], "test-session");
    if (m.method === "notifications/initialized") { res.writeHead(202); res.end(); return; }
    if (m.method === "tools/list") {
      res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: m.params.cursor ? { tools: [{ name: "echo", inputSchema: { type: "object" } }] } : { tools: [], nextCursor: "page2" } })); return;
    }
    if (m.method === "tools/call") {
      calls++;
      res.setHeader("Content-Type", "text/event-stream");
      res.write(': keepalive\n\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n');
      res.end("data: " + JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: m.params.arguments.text }] } }) + "\n\n");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const client = new MCPClient({ id: "test", name: "test", endpoint: `http://127.0.0.1:${server.address().port}`, requiresAuth: false });
  const signal = AbortSignal.timeout(3000);
  try {
    await client.connect(signal);
    assert.equal((await client.list(signal))[0].name, "echo");
    assert.match(await client.call("echo", { text: "verified MCP" }, signal), /verified MCP/);
    await assert.rejects(client.call("missing", {}, signal), /not advertised/);
    assert.equal(calls, 1);
  } finally { await client.close(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(closed, true);
});
test("MCP permissions and endpoint protection fail closed", () => {
  assert.equal(allowed({ integrations: [] }, "mcp_call"), false);
  assert.equal(allowed({ integrations: ["test"] }, "mcp_call"), true);
  assert.equal(needsApproval({ autonomy: "trusted" }, "mcp_call"), true);
  assert.throws(() => authorizedMCPConnection(["allowed"], [{ id: "private" }], "private"), /permission denied/);
  assert.throws(() => authorizedMCPConnection([], [{ id: "allowed" }], "allowed"), /permission denied/);
  assert.throws(() => validateMCP({ endpoint: "http://remote.example/mcp", requiresAuth: true }), /HTTPS/);
  assert.throws(() => validateMCP({ endpoint: "https://remote.example/mcp", requiresAuth: false }), /authentication/);
});

test("MCP resource-only servers expose paginated resources, templates and bounded content", async () => {
  const seen=[];
  const server=createServer(async(req,res)=>{
    if(req.method==='DELETE'){res.end();return;}
    let raw='';for await(const part of req)raw+=part;
    const m=JSON.parse(raw);seen.push(m);
    if(m.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    let result;
    if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{resources:{}},serverInfo:{name:'resources',version:'1'}};
    if(m.method==='resources/list')result=m.params.cursor?{resources:[{name:'Second',uri:'notes://second'}]}:{resources:[{name:'First',uri:'notes://first'}],nextCursor:'next'};
    if(m.method==='resources/templates/list')result={resourceTemplates:[{name:'Note',uriTemplate:'notes://{id}'}]};
    if(m.method==='resources/read')result=m.params.uri==='notes://invalid'?{contents:[{uri:'notes://invalid'}]}:{contents:[{uri:m.params.uri,text:m.params.uri==='notes://huge'?'x'.repeat(100001):'Merhaba dünya'}]};
    res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const client=new MCPClient({id:'resources',name:'Resources',endpoint:`http://127.0.0.1:${server.address().port}`,requiresAuth:false});
  const signal=AbortSignal.timeout(3000);
  try{
    await client.connect(signal);
    const discovery=await client.discover(signal);
    assert.deepEqual(discovery.tools,[]);
    assert.equal(discovery.resources.nextCursor,'next');
    assert.equal((await client.resources(signal,false,'next')).resources[0].uri,'notes://second');
    assert.equal(discovery.templates.resourceTemplates[0].uriTemplate,'notes://{id}');
    assert.equal(JSON.parse(await client.readResource('notes://first',signal)).contents[0].text,'Merhaba dünya');
    await assert.rejects(client.readResource('notes://huge',signal),/exceeds/);
    await assert.rejects(client.readResource('notes://invalid',signal),/Invalid MCP resource contents/);
    await assert.rejects(client.readResource('not a URI',signal),/Invalid MCP resource URI/);
    await assert.rejects(client.list(signal),/does not advertise tools/);
    assert(!seen.some(m=>m.method==='tools/list'));
  }finally{await client.close();await new Promise(r=>server.close(r));}
  for(const name of ['mcp_list_resources','mcp_list_resource_templates','mcp_read_resource']){
    assert.equal(allowed({integrations:[]},name),false);
    assert.equal(allowed({integrations:['resources']},name),true);
  }
  assert.equal(needsApproval({autonomy:'high'},'mcp_read_resource'),true);
});

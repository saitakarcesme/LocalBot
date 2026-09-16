import test from "node:test";
import assert from "node:assert/strict";
import { CodexRPC } from "../dist/codex-rpc.js";

const fixture = `
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line);
 if(m.method==='wait') return;
 if(m.method==='crash') return process.exit(1);
 if(m.id!==undefined) process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n');
});`;
test("CLI transport correlates requests and rejects timed out, cancelled and disconnected calls", async () => {
  const rpc = new CodexRPC(process.execPath, ["-e", fixture]);
  try {
    await rpc.initialize();
    const results = await Promise.all([rpc.request("first", {}), rpc.request("second", {})]);
    assert.deepEqual(results.map(r => r.method), ["first", "second"]);
    await assert.rejects(rpc.request("wait", {}, undefined, 15), /timed out/);
    const abort = new AbortController();
    const waiting = rpc.request("wait", {}, abort.signal);
    abort.abort(new Error("User cancelled"));
    await assert.rejects(waiting, /User cancelled/);
    await assert.rejects(rpc.request("crash", {}), /connection closed/);
  } finally { rpc.close(); }
});

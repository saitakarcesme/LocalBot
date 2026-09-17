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

import { CodexProvider, DecisionSizeError, decisionCharacterLimit } from "../dist/codex-provider.js";
test("malformed decisions are regenerated once without replaying completed actions", async () => {
  const provider = new CodexProvider({}); let attempts = 0; const phases = [];
  const history = [{role:"tool",content:"Saved index.html",tool_call_id:"saved"}];
  provider.generateDecision = async messages => {
    attempts++;
    if (attempts === 1) throw new SyntaxError("Bad escaped character");
    assert.equal(messages[0].content, "Saved index.html");
    assert.match(messages.at(-1).content, /do not repeat completed actions/);
    return {content:"Verified", calls:[]};
  };
  assert.equal((await provider.generate(history, [], new AbortController().signal, p=>phases.push(p))).content,"Verified");
  assert.equal(attempts,2); assert.equal(history.length,1);
  assert.deepEqual(phases,["Correcting response format"]);
  attempts=0;
  provider.generateDecision=async()=>{attempts++;throw new SyntaxError("Still malformed")};
  await assert.rejects(provider.generate([],[],new AbortController().signal),/Still malformed/);
  assert.equal(attempts,2);
  attempts=0;
  provider.generateDecision=async()=>{attempts++;throw new Error("Permission denied")};
  await assert.rejects(provider.generate([],[],new AbortController().signal),/Permission denied/);
  assert.equal(attempts,1);
});

test("CLI decision budget is bounded and oversized decisions are retried before execution", async()=>{
 assert.equal(decisionCharacterLimit(4000),16000);assert.equal(decisionCharacterLimit(8000),32000);
 assert.equal(decisionCharacterLimit(1e8),64000);assert.equal(decisionCharacterLimit(NaN),16000);
 const provider=new CodexProvider({});let attempts=0;
 provider.generateDecision=async messages=>{if(++attempts===1)throw new DecisionSizeError("Oversized");assert.match(messages.at(-1).content,/split larger work/);return{content:"Compact version saved",calls:[]}};
 assert.equal((await provider.generate([],[],new AbortController().signal)).calls.length,0);assert.equal(attempts,2);
});

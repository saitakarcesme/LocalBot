import test from "node:test";
import assert from "node:assert/strict";
import { fitContext } from "../dist/context-window.js";
const config = { contextLength: 8192, maxTokens: 1000 };
test("context trimming preserves system instructions and complete tool response groups", () => {
  const messages = [
    { role: "system", content: "Keep exact instructions" },
    { role: "user", content: "old".repeat(10000) },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "a",
          type: "function",
          function: { name: "read_file", arguments: "{}" },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "a",
      name: "read_file",
      content: "verified result",
    },
  ];
  const fitted = fitContext(messages, [], config);
  assert.equal(fitted[0].content, "Keep exact instructions");
  assert.equal(fitted[1].tool_calls[0].id, "a");
  assert.equal(fitted[2].tool_call_id, "a");
  assert.equal(fitted.length, 3);
});
test("oversized completed results retain evidence with explicit retrieval instruction", () => {
  const fitted = fitContext(
    [
      { role: "system", content: "System" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "a",
            type: "function",
            function: { name: "read_file", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "a",
        name: "read_file",
        content: "source ".repeat(20000),
      },
    ],
    [],
    config,
  );
  assert.equal(fitted[1].role, "user");
  assert.match(fitted[1].content, /read_activity/);
  assert.ok(JSON.stringify(fitted).length < 20000);
});
test("instructions and tool schemas never silently overflow a tiny model context", () => {
  assert.throws(
    () =>
      fitContext([{ role: "system", content: "x".repeat(10000) }], [], {
        contextLength: 2048,
        maxTokens: 1000,
      }),
    /too small/,
  );
});

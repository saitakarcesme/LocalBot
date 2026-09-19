import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/store.js";
import {
  personalContext,
  savePersonalContext,
  localPersonalProvider,
  queuePhoneAction,
  phoneActions,
  updatePhoneAction,
  validatePhoneAction,
} from "../dist/personal.js";
import { mobileRoute } from "../dist/remote/host.js";
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "localbot-personal-"));
  const s = new Store(root);
  try {
    s.seed(root);
    const c = s.createConversation("Phone", ["coder"]);
    const m = s.addMessage(c.id, "user", "Prepare a phone action");
    s.exec(
      "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)",
      "t",
      c.id,
      c.id,
      m,
      "test",
      "running",
      "2026",
      "2026",
      null,
    );
    await fn(s, c);
  } finally {
    s.db.close();
    await rm(root, { recursive: true, force: true });
  }
}
test("personal context rejects stale writes and only injects into explicit local connections", () =>
  fixture((s) => {
    const a = savePersonalContext(s, {
      revision: 0,
      text: "Prefers native glass UI",
    });
    assert.equal(a.revision, 1);
    assert.throws(
      () => savePersonalContext(s, { revision: 0, text: "stale" }),
      /changed/,
    );
    assert.equal(personalContext(s).text, a.text);
    assert.equal(
      localPersonalProvider({ kind: "codex", endpoint: "https://example.com" }),
      false,
    );
    assert.equal(
      localPersonalProvider({
        kind: "openai",
        endpoint: "https://example.com",
      }),
      false,
    );
    assert.equal(
      localPersonalProvider({
        kind: "ollama",
        endpoint: "https://cloud.example.com",
      }),
      false,
    );
    assert.equal(
      localPersonalProvider({
        kind: "ollama",
        endpoint: "http://localhost.evil.com",
      }),
      false,
    );
    assert.equal(
      localPersonalProvider({
        kind: "ollama",
        endpoint: "http://127.0.0.1:11434",
      }),
      true,
    );
    assert.equal(localPersonalProvider({ transport: "center" }), true);
  }));
test("phone actions are immutable, device-owned and cannot execute twice", () =>
  fixture((s, c) => {
    const a = queuePhoneAction(s, "t", "compose_mail", {
      to: "test@example.com",
      subject: "Draft",
      body: "Review me",
    });
    assert.equal(phoneActions(s, c.id)[0].status, "pending");
    assert.throws(
      () => updatePhoneAction(s, "phone-a", { id: a.id, operation: "bogus" }),
      /operation/,
    );
    updatePhoneAction(s, "phone-a", { id: a.id, operation: "claim" });
    assert.throws(
      () => updatePhoneAction(s, "phone-b", { id: a.id, operation: "claim" }),
      /already/,
    );
    assert.throws(
      () =>
        updatePhoneAction(s, "phone-b", {
          id: a.id,
          operation: "finish",
          status: "completed",
          result: "sent",
        }),
      /own/,
    );
    const result = {
      id: a.id,
      operation: "finish",
      status: "handed_off",
      result: "Draft saved; not sent.",
    };
    updatePhoneAction(s, "phone-a", result);
    assert.equal(updatePhoneAction(s, "phone-a", result).status, "handed_off");
    assert.throws(
      () => updatePhoneAction(s, "phone-a", { ...result, result: "changed" }),
      /own/,
    );
    assert.equal(phoneActions(s, c.id)[0].payload.body, "Review me");
  }));
test("expired pending actions cannot be claimed and paired identity is required", () =>
  fixture((s) => {
    const a = queuePhoneAction(s, "t", "open_url", {
      url: "https://example.com",
    });
    s.exec(
      "UPDATE phone_actions SET createdAt='2000-01-01T00:00:00Z' WHERE id=?",
      a.id,
    );
    assert.throws(
      () => updatePhoneAction(s, "", { id: a.id, operation: "claim" }),
      /paired/,
    );
    assert.throws(
      () => updatePhoneAction(s, "phone", { id: a.id, operation: "claim" }),
      /expired/,
    );
    assert.equal(phoneActions(s)[0].status, "cancelled");
  }));
test("phone schemas reject invalid dates, extra fields, script links and email header injection", () => {
  assert.throws(
    () => validatePhoneAction("open_url", { url: "javascript:alert(1)" }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      validatePhoneAction("open_url", {
        url: "https://user:password@example.com",
      }),
    /credentials/,
  );
  assert.throws(
    () =>
      validatePhoneAction("compose_mail", {
        to: "a@b.com\nBcc:c@d.com",
        subject: "x",
        body: "x",
      }),
    /email/,
  );
  assert.throws(
    () =>
      validatePhoneAction("create_event", {
        title: "x",
        start: "2026-09-20T10:00:00Z",
        end: "nonsense",
      }),
    /ISO/,
  );
  assert.throws(
    () => validatePhoneAction("run_shortcut", { name: "Test", shell: "rm" }),
    /field/,
  );
  assert.deepEqual(
    validatePhoneAction("create_event", {
      title: "Test",
      start: "2026-09-20T10:00:00.000Z",
      end: "2026-09-20T11:00:00.000Z",
    }).title,
    "Test",
  );
});
test("remote phone routes allow reviewed action results but no model-side queue creation", () => {
  for (const [path, method] of [
    ["/phone/actions", "GET"],
    ["/phone/actions/update", "POST"],
    ["/personal/context", "GET"],
    ["/personal/context", "POST"],
  ])
    assert.equal(mobileRoute({ operation: "api", path, method }).path, path);
  assert.throws(() =>
    mobileRoute({
      operation: "api",
      path: "/phone/actions/create",
      method: "POST",
    }),
  );
});

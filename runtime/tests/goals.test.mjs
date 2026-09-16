import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../dist/store.js";

test("goals survive restart, stay conversation-scoped and reject stale updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "localbot-goals-"));
  let store = new Store(root);
  try {
    const first = store.createConversation("First", []), second = store.createConversation("Second", []);
    assert.equal(store.goal(first.id), null);
    const goal = store.createGoal(first.id, "Verify the complete feature");
    assert.throws(() => store.createGoal(first.id, "Replace unfinished work"), /unfinished/);
    assert.throws(() => store.updateGoal(second.id, goal.id, "complete", "wrong conversation"), /no longer current/);
    assert.throws(() => store.updateGoal(first.id, goal.id, "complete", ""), /Explain/);
    store.updateGoal(first.id, goal.id, "blocked", "The required fixture is unavailable");
    store.db.close(); store = new Store(root);
    assert.equal(store.goal(first.id).status, "blocked");
    assert.throws(() => store.createGoal(first.id, "Silently forget blocker"), /unfinished/);
    store.updateGoal(first.id, goal.id, "active", "User supplied the missing fixture");
    store.updateGoal(first.id, goal.id, "complete", "Validated the fixture and all acceptance cases");
    assert.throws(() => store.updateGoal(first.id, goal.id, "active", "rewrite history"), /immutable/);
    const next = store.createGoal(first.id, "A new objective");
    assert.notEqual(next.id, goal.id);
    assert.throws(() => store.updateGoal(first.id, goal.id, "complete", "old result"), /no longer current/);
    assert.equal(store.goal(second.id), null);
    assert.equal(store.snapshot().goals.length, 2);
  } finally { store.db.close(); await rm(root, { recursive: true, force: true }); }
});

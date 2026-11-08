import { randomUUID } from 'node:crypto';
import type { Store } from './store.js';

export class Routines {
  constructor(private store: Store) {
    store.exec(`CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), prompt TEXT NOT NULL, nextAt INTEGER NOT NULL, intervalMs INTEGER NOT NULL, enabled INTEGER NOT NULL, requestId TEXT NOT NULL, lastTaskId TEXT)`);
  }
  list(conversationId: string) { return this.store.all('SELECT * FROM routines WHERE conversationId=? ORDER BY nextAt LIMIT 100', conversationId); }
  create(conversationId: string, prompt: string, at: string, interval: string = '0', clock = Date.now()) {
    const nextAt = Date.parse(at), intervalMs = Number(interval) * 60000;
    if (!prompt.trim() || prompt.length > 8000) throw new Error('Routine prompt must contain 1–8000 characters');
    if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(nextAt) || nextAt <= clock) throw new Error('Provide a future ISO timestamp with an explicit timezone');
    if (!/^\d+$/.test(interval) || !Number.isSafeInteger(intervalMs) || (intervalMs !== 0 && (intervalMs < 60000 || intervalMs > 31536000000))) throw new Error('Repeat interval must be 0 (once) or 1–525600 minutes');
    if (this.list(conversationId).length >= 100) throw new Error('Routine limit reached');
    const id = randomUUID();
    this.store.exec('INSERT INTO routines VALUES(?,?,?,?,?,?,?,NULL)', id, conversationId, prompt, nextAt, intervalMs, 1, randomUUID());
    return { id, nextAt, intervalMs, enabled: true, notice: 'Runs only while the runtime is available; normal tool approvals still apply. Missed intervals coalesce into one run.' };
  }
  pause(conversationId: string, id: string) {
    if (!this.store.get('SELECT id FROM routines WHERE id=? AND conversationId=?', id, conversationId)) throw new Error('Routine not found in this conversation');
    this.store.exec('UPDATE routines SET enabled=0 WHERE id=?', id); return { id, enabled: false };
  }
  tick(enqueue: (conversation: string, prompt: string, requestId: string) => {id: string}, clock = Date.now()) {
    for (const row of this.store.all('SELECT * FROM routines WHERE enabled=1 AND nextAt<=? ORDER BY nextAt LIMIT 20', clock)) {
      // Reuse the durable request ID until enqueue and advancement both complete.
      // A crash between them returns the same task on retry, never a duplicate effect.
      if (this.store.get("SELECT id FROM tasks WHERE conversationId=? AND status IN ('queued','running','awaiting_approval','awaiting_input')", row.conversationId)) continue;
      const task = enqueue(row.conversationId, row.prompt, row.requestId);
      const nextAt = row.intervalMs ? row.nextAt + (Math.floor((clock - row.nextAt) / row.intervalMs) + 1) * row.intervalMs : row.nextAt;
      this.store.exec('UPDATE routines SET nextAt=?,enabled=?,requestId=?,lastTaskId=? WHERE id=?', nextAt, row.intervalMs ? 1 : 0, randomUUID(), task.id, row.id);
    }
  }
}

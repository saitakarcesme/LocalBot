import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Writers retain ownership until their task ends, including background processes.
// Other conversations can continue reasoning, reading history and searching the web.
export class WorkspaceLocks {
  private owners = new Map<string, Set<string>>();
  private waiters = new Set<() => void>();
  async acquire(taskId: string, workspace: string, signal: AbortSignal) {
    const path = realpathSync(resolve(workspace));
    while (true) {
      signal.throwIfAborted();
      const busy = [...this.owners].some(([id, paths]) => id !== taskId && [...paths].some(p =>
        path === p || path.startsWith(p + sep) || p.startsWith(path + sep)));
      if (!busy) { const paths = this.owners.get(taskId) ?? new Set<string>(); paths.add(path); this.owners.set(taskId, paths); return; }
      // A multi-agent task must not hold A while waiting for B held by a task waiting for A.
      if (this.owners.has(taskId)) throw new Error("Another task owns this additional workspace. Finish the current workspace work before retrying in a new task.");
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { this.waiters.delete(wake); signal.removeEventListener('abort', abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal.reason); };
        this.waiters.add(wake);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  release(taskId: string) {
    this.owners.delete(taskId);
    for (const wake of [...this.waiters]) wake();
  }
}

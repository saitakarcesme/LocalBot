import { randomUUID } from "node:crypto";
type Action = {
  id: string;
  taskId: string;
  name: string;
  args: Record<string, unknown>;
};
type Pending = {
  action: Action;
  delivered: boolean;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
export class BrowserBridge {
  private pending = new Map<string, Pending>();
  private heartbeat = 0;
  get available() {
    return this.pending.size > 0 || (this.heartbeat > 0 && Date.now() - this.heartbeat < 30000);
  }
  poll() {
    this.heartbeat = Date.now();
    const entry = [...this.pending.values()].find((p) => !p.delivered);
    if (!entry) return null;
    entry.delivered = true;
    return entry.action;
  }
  request(
    taskId: string,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    if (!this.available)
      throw Error("Open the LocalBot desktop app to use its browser.");
    if (this.pending.size >= 8)
      throw Error("The browser is busy. Try again after the current action.");
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (error: Error) => {
        const entry = this.pending.get(id);
        if (!entry) return;
        entry.cleanup();
        this.pending.delete(id);
        reject(error);
      };
      const abort = () => finish(Error("Browser action cancelled"));
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Browser action timed out. Inspect the page before retrying a write.",
            ),
          ),
        45000,
      );
      this.pending.set(id, {
        action: { id, taskId, name, args },
        delivered: false,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        },
      });
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  complete(id: string, result: unknown, error?: string) {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.heartbeat = Date.now();
    entry.cleanup();
    this.pending.delete(id);
    if (error) entry.reject(Error(error));
    else entry.resolve(result);
    return true;
  }
}
export const browserBridge = new BrowserBridge();

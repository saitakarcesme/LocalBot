import { randomUUID } from 'node:crypto';

type Request = { id: string; taskId: string; name: string; args: Record<string,string> };
export class DesktopBridge {
  private pending = new Map<string, {request: Request; claimed: boolean; finish: (result?: string, error?: string) => void}>();
  async call(taskId: string, name: string, args: Record<string,string>, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (this.pending.size >= 8) throw new Error('Desktop request queue is full');
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (result?: string, error?: string) => {
        clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(id);
        error ? reject(new Error(error)) : resolve(result ?? '');
      };
      const abort = () => finish(undefined, 'Desktop action cancelled; inspect before retrying any uncertain action');
      const timer = setTimeout(() => finish(undefined, 'Desktop action timed out. Keep LocalBot open; inspect before retrying.'), 30000);
      this.pending.set(id, {request:{id,taskId,name,args},claimed:false,finish});
      signal.addEventListener('abort', abort, {once:true});
    });
  }
  claim() {
    const next = [...this.pending.values()].find(r => !r.claimed);
    if (!next) return null;
    next.claimed = true; return next.request;
  }
  complete(id: string, result: string, error?: string) {
    const entry = this.pending.get(id);
    if (!entry?.claimed) throw new Error('Desktop request expired or was not claimed');
    if (result.length > 100000 || (error?.length ?? 0) > 2000) throw new Error('Desktop response exceeds limits');
    entry.finish(result,error);
  }
}
export const desktopBridge = new DesktopBridge();

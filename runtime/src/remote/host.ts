import { join } from 'node:path';
import { RemoteGateway } from './gateway.js';
import { PreviewTunnel } from './tunnel.js';
import { remoteURL, type RPCRequest } from './protocol.js';

// Deliberately excludes credentials, provider configuration and pairing administration.
const reads = new Set(['/snapshot', '/messages', '/activity', '/artifacts', '/search', '/memory']);
const writes = new Set(['/messages', '/cancel', '/approvals', '/reactions', '/conversations', '/conversations/archive', '/conversations/update', '/workspace/action']);
export function mobileRoute(request: RPCRequest) {
  if (request.operation !== 'api' || typeof request.path !== 'string' || !request.path.startsWith('/') || request.path.startsWith('//')) throw Error('Unsupported remote operation');
  const url = new URL(request.path, 'http://localhost');
  const method = request.method ?? 'GET';
  if (url.origin !== 'http://localhost' || url.hash || !(method === 'GET' ? reads : method === 'POST' ? writes : new Set()).has(url.pathname)) throw Error('This operation is not available remotely');
  return { path: url.pathname + url.search, method };
}
export class RemoteHost {
  private gateway?: RemoteGateway;
  private tunnel = new PreviewTunnel();
  private publicURL?: string;
  private starting = false;
  private leases = new Map<string, number>();
  constructor(private dir: string, private connection: () => { url: string; token: string }) {}
  protectedDraft(id: string) { return (this.leases.get(id) ?? 0) > Date.now(); }
  status() { return { enabled: !!this.gateway && (!!process.env.LOCALBOT_REMOTE_PUBLIC_URL || this.tunnel.running), starting: this.starting, preview: !process.env.LOCALBOT_REMOTE_PUBLIC_URL, devices: this.gateway?.list() ?? [] }; }
  async start() {
    if (this.starting) throw Error('Remote is already starting');
    if (this.status().enabled) return this.status();
    this.starting = true;
    try {
      await this.stop();
      const gateway = new RemoteGateway(join(this.dir, 'remote-devices.json'), 'remote', async (request, _device, signal) => {
        const route = mobileRoute(request), local = this.connection();
        const response = await fetch(local.url + route.path, { method: route.method, redirect: 'error', headers: { Authorization: 'Bearer ' + local.token, 'Content-Type': 'application/json' }, body: route.method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined, signal });
        const text = await response.text();
        if (Buffer.byteLength(text) > 8_000_000) throw Error('This result is too large to load on the phone. Narrow the request.');
        const result = JSON.parse(text);
        if (!response.ok) throw Error(result.error ?? 'Host request failed');
        // Phone conversations are created only when Send is pressed. Protect the tiny
        // create-to-send interval from the desktop empty-conversation collector.
        if (route.method === 'POST' && route.path === '/conversations') this.leases.set(result.id, Date.now() + 300_000);
        for (const [id, expiry] of this.leases) if (expiry < Date.now()) this.leases.delete(id);
        return result;
      });
      this.gateway = gateway;
      const localURL = await gateway.start(Number(process.env.LOCALBOT_REMOTE_PORT ?? 0));
      this.publicURL = process.env.LOCALBOT_REMOTE_PUBLIC_URL ? remoteURL(process.env.LOCALBOT_REMOTE_PUBLIC_URL) : await this.tunnel.start(localURL);
      return this.status();
    } catch (e) { await this.stop(); throw e; }
    finally { this.starting = false; }
  }
  async pair(name = 'iPhone') {
    if (!this.status().enabled || !this.gateway || !this.publicURL) throw Error('Enable Remote first');
    return { code: await this.gateway.pairing(this.publicURL, name), ...this.status() };
  }
  async revoke(id: string) { await this.gateway?.revoke(id); return this.status(); }
  async stop() { this.tunnel.stop(); const gateway = this.gateway; this.gateway = undefined; this.publicURL = undefined; if (gateway) await gateway.close(); }
}

import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { type Link, type RPCRequest, encodeLink, remoteURL, seal, unseal } from './protocol.js';
type Device = { id: string; name: string; tokenHash: string; key: string; paired: boolean; expires?: number; createdAt: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function readJSON(req: IncomingMessage, limit = 12_000_000) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export class RemoteGateway {
  private devices: Device[] = [];
  private seen = new Map<string, { box: string; at: number; result?: Promise<unknown> }>();
  private saving: Promise<void> = Promise.resolve();
  readonly server;
  constructor(private file: string, readonly kind: Link['kind'], private handler: (request: RPCRequest, deviceId: string, signal: AbortSignal) => Promise<unknown>) {
    this.server = createServer(async (req, res) => {
      const respond = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
      try {
        if (req.method !== 'POST' || req.url !== '/rpc' || req.headers.origin) { respond(404, { error: 'Not found' }); return; }
        // Authenticate before buffering an encrypted request.
        const authorization = req.headers.authorization ?? '';
        const tokenHash = hash(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
        const device = this.devices.find(d => timingSafeEqual(Buffer.from(d.tokenHash), Buffer.from(tokenHash)));
        if (!device || (device.expires && device.expires < Date.now())) { respond(401, { error: 'Unauthorized' }); return; }
        const wire = await readJSON(req);
        if (wire.id !== device.id || !/^[0-9a-f-]{36}$/.test(wire.requestId)) throw Error('Invalid request');
        const request = unseal(device.key, device.id, wire.requestId, 'request', wire.box);
        if (!Number.isFinite(request.timestamp) || Math.abs(Date.now() - request.timestamp) > 300_000) throw Error('Request expired');
        for (const [id, entry] of this.seen) if (Date.now() - entry.at > 600_000) this.seen.delete(id);
        const cacheKey = device.id + ':' + wire.requestId;
        let cached = this.seen.get(cacheKey);
        if (cached && cached.box !== hash(wire.box)) throw Error('Request identifier reused with different content');
        if (cached && !cached.result) { respond(409, { error: 'This request was already processed. Refresh before retrying.' }); return; }
        if (!cached) {
          if (this.seen.size >= 10000 || [...this.seen.values()].filter(e => e.result).length >= 4) { respond(429, { error: 'Too many requests' }); return; }
          const result = (async () => {
            try {
              if (request.operation === 'claim') {
                if (device.paired) throw Error('Pairing code has already been used');
                const token = randomBytes(32).toString('base64url');
                device.tokenHash = hash(token); device.paired = true; device.expires = undefined;
                if (typeof request.body?.name === 'string') device.name = request.body.name.slice(0,80);
                await this.save(); return { token };
              }
              if (!device.paired) throw Error('Complete pairing first');
              return await this.handler(request, device.id, AbortSignal.timeout(240_000));
            } catch (e) { return { error: e instanceof Error ? e.message : 'Host request failed' }; }
          })();
          cached = { box: hash(wire.box), at: Date.now(), result }; this.seen.set(cacheKey, cached);
        }
        const result = await cached.result;
        cached.result = undefined;
        if (!this.devices.some(d => d.id === device.id)) { respond(401,{error:'Device revoked'}); return; }
        respond(200, { box: seal(device.key, device.id, wire.requestId, 'response', result) });
      } catch { respond(400, { error: 'Invalid encrypted request' }); }
    });
    this.server.requestTimeout = 30_000; this.server.headersTimeout = 10_000;
  }
  async start(port = 0) {
    try { this.devices = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, '127.0.0.1', resolve); });
    const address = this.server.address(); if (!address || typeof address === 'string') throw Error('No gateway address');
    return `http://127.0.0.1:${address.port}`;
  }
  private save() {
    const text = JSON.stringify(this.devices);
    this.saving = this.saving.catch(() => {}).then(async () => { await fs.mkdir(dirname(this.file), { recursive: true, mode: 0o700 }); await fs.writeFile(this.file + '.new', text, { mode: 0o600 }); await fs.rename(this.file + '.new', this.file); });
    return this.saving;
  }
  async pairing(url: string, name: string) {
    this.devices = this.devices.filter(d => !d.expires || d.expires > Date.now());
    if (this.devices.length >= 20) throw Error('Remove an old device before adding another.');
    const token = randomBytes(32).toString('base64url');
    const device: Device = { id: randomBytes(18).toString('base64url'), tokenHash: hash(token), key: randomBytes(32).toString('base64'), name, paired: false, expires: Date.now() + 600_000, createdAt: new Date().toISOString() };
    this.devices.push(device); await this.save();
    return encodeLink({ v: 1, kind: this.kind, url: remoteURL(url), id: device.id, token, key: device.key, name, expires: device.expires });
  }
  list() { return this.devices.filter(d => !d.expires || d.expires > Date.now()).map(({ id, name, paired, createdAt }) => ({ id, name, paired, createdAt })); }
  async revoke(id: string) { this.devices = this.devices.filter(d => d.id !== id); await this.save(); }
  async close() { this.server.closeAllConnections(); await new Promise<void>(resolve => this.server.close(() => resolve())); await this.saving; }
}

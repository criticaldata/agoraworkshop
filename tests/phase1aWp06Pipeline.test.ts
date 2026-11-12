import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAuthMiddleware, type AuthConfig } from '../src/server/auth.js';
import { wp06Router } from '../src/server/wp06.js';
import { PREVIEW_LIMIT_BYTES } from '../src/phase1a/wp06/preview/app.js';
import { previewDemo } from '../src/phase1a/wp06/preview/demo.js';
import { analyzeRun } from '../src/phase1a/wp06/index.js';
import { analyzeReportAnnotations } from '../src/phase1a/wp06/annotations.js';

const credential = `Basic ${Buffer.from('researcher:test-only').toString('base64')}`;
const servers: Server[] = [];
let base: string, unconfigured: string;
async function start(password: string | null) {
  const app = express();
  const auth: AuthConfig = { password, scope: 'write', realm: 'WP06 test' };
  app.use(createAuthMiddleware(auth));
  app.use('/wp06', wp06Router(auth));
  app.use(express.json());
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeAll(async () => { base = await start('test-only'); unconfigured = await start(null); });
afterAll(async () => {
  await Promise.all(servers.map(server => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); }));
});
const get = (path: string) => fetch(`${base}${path}`, { headers: { authorization: credential } });
const post = (body: string, extraHeaders: Record<string, string> = {}) => fetch(`${base}/wp06/api/analyze`, {
  method: 'POST', headers: { authorization: credential, 'content-type': 'application/json', origin: base, ...extraHeaders }, body,
});

describe('WP06 in the shared application pipeline', () => {
  it('requires credentials for the entire mount even when ordinary reads are open', async () => {
    for (const path of ['/wp06', '/wp06/', '/wp06/preview.js', '/wp06/api/demo/complete', '/WP06/']) {
      expect((await fetch(`${base}${path}`)).status).toBe(401);
      expect((await fetch(`${unconfigured}${path}`)).status).toBe(503);
    }
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await post('{invalid', { authorization: '' })).status).toBe(401);
    expect((await post('{invalid', { origin: 'https://another.example' })).status).toBe(403);
  });

  it('canonicalizes the shared URL and serves relative assets and demo APIs', async () => {
    const redirect = await fetch(`${base}/wp06`, { headers: { authorization: credential }, redirect: 'manual' });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe('/wp06/');
    const response = await get('/wp06/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain('this AGORA server');
    for (const asset of ['preview.js', 'preview.css', 'pathway.css', 'pathway.js']) {
      expect((await get(`/wp06/${asset}`)).status).toBe(200);
    }
    expect(html).toContain('href="./preview.css"');
    const js = await (await get('/wp06/preview.js')).text();
    expect(js).toContain("fetch('./api/analyze'");
    const demo = await (await get('/wp06/api/demo/complete')).json();
    expect(demo.run.totals).toMatchObject({ planned: 31, committed: 31 });
    expect(demo.input_kind).toBe('synthetic');
  });

  it('accepts real runtime evidence above the default app parser limit with analyzer parity', async () => {
    const input = await previewDemo('complete');
    // Valid JSON whitespace exercises the transport limit without altering evidence hashes.
    const body = JSON.stringify(input) + ' '.repeat(150_000);
    expect(Buffer.byteLength(body)).toBeGreaterThan(100 * 1024);
    const response = await post(body);
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output.run).toEqual(analyzeRun(input.bundle));
    expect(output.report).toEqual(analyzeReportAnnotations(input.bundle, input.annotations));
    expect(output.input_kind).toBe('uploaded');
    expect(JSON.stringify(output)).not.toContain('Synthetic private or intermediate material');
    const nextInput = await previewDemo('no-report');
    const next = await (await post(JSON.stringify(nextInput), { origin: '' })).json();
    expect(next.report).toBeNull();
    expect(next.records).toBeNull();
    expect(JSON.stringify(next)).not.toContain(output.run.run_id);
  });

  it('supports a shared hostname behind TLS termination and rejects a different origin', async () => {
    const input = JSON.stringify(await previewDemo('no-report'));
    async function sharedRequest(origin: string) {
      return new Promise<number | undefined>((resolve, reject) => {
        const req = request(`${base}/wp06/api/analyze`, { method: 'POST', headers: {
          host: 'agora.example', origin, authorization: credential, 'content-type': 'application/json',
        } }, res => { res.resume(); resolve(res.statusCode); });
        req.on('error', reject); req.end(input);
      });
    }
    expect(await sharedRequest('https://agora.example')).toBe(200);
    expect(await sharedRequest('https://another.example')).toBe(403);
  });

  it('preserves validation failures, content-type enforcement and the 10 MiB upload limit', async () => {
    expect((await post('{}' + ' '.repeat(PREVIEW_LIMIT_BYTES))).status).toBe(413);
    expect((await post('{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('{invalid')).status).toBe(400);
    const input = await previewDemo('complete');
    input.bundle.artifacts[0]!.content = 'tampered';
    const invalid = await post(JSON.stringify(input));
    expect(invalid.status).toBe(400);
    expect(Object.keys(await invalid.json())).toEqual(['error']);
  });
});

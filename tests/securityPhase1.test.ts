import { expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  authConfigFromEnv,
  createAuthMiddleware,
  permissionForPath,
  type AuthConfig,
} from '../src/server/auth.js';
import { permits } from '../src/server/principal.js';
import { phase1Router } from '../src/server/phase1.js';
import { tempDb } from './helpers.js';

const basic = (password: string, user: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

function requestResult(config: AuthConfig, path: string, authorization?: string) {
  const result: { status: number | null; next: boolean; body: unknown } = { status: null, next: false, body: null };
  const headers: Record<string, string> = { host: 'agora.test' };
  if (authorization) headers.authorization = authorization;
  const req = { method: 'GET', path, headers, get: (name: string) => headers[name.toLowerCase()] };
  const res = {
    status(code: number) { result.status = code; return this; },
    set() { return this; },
    json(value: unknown) { result.body = value; return this; },
  };
  createAuthMiddleware(config)(req as never, res as never, () => { result.next = true; });
  return result;
}

it('classifies every Phase 1 sensitive read before route code runs', () => {
  expect(permissionForPath('/phase1/campaigns/c1')).toBe('operate');
  expect(permissionForPath('/phase1/campaigns/c1/review')).toBe('review');
  expect(permissionForPath('/api/phase1/campaigns/c1/science')).toBe('operate');
  expect(permissionForPath('/api/phase1/campaigns/c1/snapshots/s1')).toBe('operate');
  expect(permissionForPath('/api/phase1/review/snapshots/s1/assignments')).toBe('operate');
  expect(permissionForPath('/phase1/review/snapshots/s1/manage')).toBe('operate');
  expect(permissionForPath('/phase1/review/assignments/a1')).toBe('review');
  expect(permissionForPath('/phase1/adjudication/s1')).toBe('adjudicate');
});

it('requires authentication for sensitive GET routes under default write scope', () => {
  const config = authConfigFromEnv({ AGORA_AUTH_PASSWORD: 'operator-password' });
  expect(requestResult(config, '/phase1/campaigns/c1/review').status).toBe(401);
  expect(requestResult(config, '/api/phase1/campaigns/c1/science').status).toBe(401);
});

it('enforces named reviewer access separately from operator access', () => {
  const config = authConfigFromEnv({
    AGORA_AUTH_PASSWORD: 'operator-password',
    AGORA_AUTH_USERS: 'alice:reviewer:review-password,bob:adjudicator:adjudicate-password',
  });
  expect(requestResult(config, '/phase1/campaigns/c1/review', basic('operator-password', 'operator')).status).toBe(403);
  expect(requestResult(config, '/phase1/campaigns/c1/review', basic('review-password', 'alice')).next).toBe(true);
  expect(requestResult(config, '/phase1/campaigns/c1/review', basic('adjudicate-password', 'bob')).next).toBe(true);
});

it('keeps review-assignment creation out of reviewer permission', () => {
  expect(permits('reviewer', 'operate')).toBe(false);
  expect(permits('adjudicator', 'operate')).toBe(false);
  expect(permits('operator', 'operate')).toBe(true);
  expect(permits('admin', 'operate')).toBe(true);
});

it('rejects reviewer assignment creation before reading the requested snapshot', async () => {
  const db = tempDb(), app = express();
  app.use(createAuthMiddleware({ password: 'operator-password', users: new Map([['alice', { role: 'reviewer', password: 'review-password' }]]), scope: 'all', realm: 'test' }));
  app.use(express.json());
  app.use(phase1Router(db, 'configs/agora_phase0_1_context_contract.yaml'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/phase1/review/snapshots/missing/assignments`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from('alice:review-password', 'utf8').toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reviewers: ['alice', 'bob'] }),
    });
    expect(response.status).toBe(403);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
});

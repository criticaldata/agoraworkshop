import { expect, it } from 'vitest';
import {
  authConfigFromEnv,
  createAuthMiddleware,
  permissionForPath,
  type AuthConfig,
} from '../src/server/auth.js';

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

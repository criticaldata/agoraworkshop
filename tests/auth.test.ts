import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  authConfigFromEnv,
  constantTimeEquals,
  createAuthMiddleware,
  describeAuth,
  isAuthorised,
  isSameOrigin,
  isStateChanging,
  type AuthConfig,
} from '../src/server/auth.js';

const basic = (password: string, user = 'agora'): string =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

interface FakeResult {
  status: number | null;
  headers: Record<string, string>;
  body: unknown;
  nextCalled: boolean;
}

function run(
  config: AuthConfig,
  req: { method?: string; path?: string; headers?: Record<string, string> },
): FakeResult {
  const headers = req.headers ?? {};
  const result: FakeResult = { status: null, headers: {}, body: null, nextCalled: false };

  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    set(name: string, value: string) {
      result.headers[name] = value;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    },
  };

  const request = {
    method: req.method ?? 'GET',
    path: req.path ?? '/runs',
    get: (name: string) => headers[name.toLowerCase()],
    headers,
  };

  createAuthMiddleware(config)(request as never, res as never, () => {
    result.nextCalled = true;
  });
  return result;
}

const configured: AuthConfig = { password: 'correct horse', scope: 'write', realm: 'AGORA' };
const unconfigured: AuthConfig = { password: null, scope: 'write', realm: 'AGORA' };
const lockedDown: AuthConfig = { password: 'correct horse', scope: 'all', realm: 'AGORA' };

describe('credential comparison', () => {
  it('accepts an exact match', () => {
    expect(constantTimeEquals('secret', 'secret')).toBe(true);
  });

  it('rejects a different secret of the same length without throwing', () => {
    expect(constantTimeEquals('secret', 'sekret')).toBe(false);
  });

  it('rejects secrets of different lengths without throwing', () => {
    expect(constantTimeEquals('short', 'a much longer secret')).toBe(false);
    expect(constantTimeEquals('', 'x')).toBe(false);
  });

  it('parses a Basic header and ignores the username', () => {
    expect(isAuthorised(basic('pw', 'alice'), 'pw')).toBe(true);
    expect(isAuthorised(basic('pw', 'bob'), 'pw')).toBe(true);
    expect(isAuthorised(basic('wrong'), 'pw')).toBe(false);
  });

  it('rejects malformed or missing credentials rather than throwing', () => {
    expect(isAuthorised(undefined, 'pw')).toBe(false);
    expect(isAuthorised('Bearer token', 'pw')).toBe(false);
    expect(isAuthorised('Basic not-base64!!', 'pw')).toBe(false);
    expect(isAuthorised(`Basic ${Buffer.from('nocolon').toString('base64')}`, 'pw')).toBe(false);
  });

  it('accepts a password containing a colon, splitting on the first one only', () => {
    expect(isAuthorised(basic('a:b:c'), 'a:b:c')).toBe(true);
  });
});

describe('what counts as state changing', () => {
  it('treats reads as safe and everything else as state changing', () => {
    expect(isStateChanging('GET')).toBe(false);
    expect(isStateChanging('HEAD')).toBe(false);
    expect(isStateChanging('POST')).toBe(true);
    expect(isStateChanging('DELETE')).toBe(true);
  });
});

describe('cross-site protection', () => {
  const req = (headers: Record<string, string>) => ({
    get: (n: string) => headers[n.toLowerCase()],
    headers,
  });

  it('allows a form posted from this instance', () => {
    expect(
      isSameOrigin(req({ origin: 'https://agora.example', host: 'agora.example' }) as never),
    ).toBe(true);
  });

  it('refuses a form posted from another site', () => {
    expect(
      isSameOrigin(req({ origin: 'https://evil.example', host: 'agora.example' }) as never),
    ).toBe(false);
  });

  it('allows clients that send no Origin, such as curl', () => {
    expect(isSameOrigin(req({ host: 'agora.example' }) as never)).toBe(true);
  });

  it('refuses a request whose Origin cannot be parsed', () => {
    expect(isSameOrigin(req({ origin: 'not a url', host: 'agora.example' }) as never)).toBe(false);
  });

  it('blocks a cross-site run start even with valid credentials', () => {
    const result = run(configured, {
      method: 'POST',
      path: '/runs',
      headers: {
        authorization: basic('correct horse'),
        origin: 'https://evil.example',
        host: 'agora.example',
      },
    });
    expect(result.status).toBe(403);
    expect(result.nextCalled).toBe(false);
  });
});

describe('no credential configured', () => {
  it('refuses to start a run rather than running it openly', () => {
    const result = run(unconfigured, { method: 'POST', path: '/runs' });
    expect(result.status).toBe(503);
    expect(result.nextCalled).toBe(false);
    expect(String((result.body as { detail: string }).detail)).toContain('AGORA_AUTH_PASSWORD');
  });

  it('refuses to export, which writes files', () => {
    expect(run(unconfigured, { method: 'POST', path: '/api/runs/x/export' }).status).toBe(503);
  });

  it('still serves the overview and the runs list', () => {
    expect(run(unconfigured, { method: 'GET', path: '/' }).nextCalled).toBe(true);
    expect(run(unconfigured, { method: 'GET', path: '/runs' }).nextCalled).toBe(true);
  });

  it('refuses reads too when the whole instance was meant to be protected', () => {
    const result = run({ password: null, scope: 'all', realm: 'AGORA' }, {
      method: 'GET',
      path: '/runs',
    });
    expect(result.status).toBe(503);
    expect(result.nextCalled).toBe(false);
  });

  it('never leaves the health check unreachable', () => {
    expect(run(unconfigured, { method: 'GET', path: '/healthz' }).nextCalled).toBe(true);
    expect(
      run({ password: null, scope: 'all', realm: 'AGORA' }, { method: 'GET', path: '/healthz' })
        .nextCalled,
    ).toBe(true);
  });
});

describe('credential configured', () => {
  it('challenges an unauthenticated attempt to start a run', () => {
    const result = run(configured, { method: 'POST', path: '/runs' });
    expect(result.status).toBe(401);
    expect(result.headers['WWW-Authenticate']).toContain('Basic realm="AGORA"');
    expect(result.nextCalled).toBe(false);
  });

  it('rejects the wrong password', () => {
    const result = run(configured, {
      method: 'POST',
      path: '/runs',
      headers: { authorization: basic('wrong') },
    });
    expect(result.status).toBe(401);
    expect(result.nextCalled).toBe(false);
  });

  it('allows the correct password', () => {
    const result = run(configured, {
      method: 'POST',
      path: '/runs',
      headers: { authorization: basic('correct horse') },
    });
    expect(result.nextCalled).toBe(true);
    expect(result.status).toBeNull();
  });

  it('leaves reading open under the default scope', () => {
    expect(run(configured, { method: 'GET', path: '/runs' }).nextCalled).toBe(true);
    expect(run(configured, { method: 'GET', path: '/api/runs' }).nextCalled).toBe(true);
  });

  it('protects reading as well under scope "all"', () => {
    expect(run(lockedDown, { method: 'GET', path: '/runs' }).status).toBe(401);
    expect(
      run(lockedDown, {
        method: 'GET',
        path: '/runs',
        headers: { authorization: basic('correct horse') },
      }).nextCalled,
    ).toBe(true);
  });
});

describe('configuration from the environment', () => {
  it('treats an unset or empty password as not configured', () => {
    expect(authConfigFromEnv({}).password).toBeNull();
    expect(authConfigFromEnv({ AGORA_AUTH_PASSWORD: '' }).password).toBeNull();
  });

  it('defaults to protecting writes only', () => {
    expect(authConfigFromEnv({ AGORA_AUTH_PASSWORD: 'x' }).scope).toBe('write');
    expect(authConfigFromEnv({ AGORA_AUTH_PASSWORD: 'x', AGORA_AUTH_SCOPE: 'all' }).scope).toBe('all');
    // Anything unrecognised falls back to the narrower scope rather than the wider one.
    expect(authConfigFromEnv({ AGORA_AUTH_PASSWORD: 'x', AGORA_AUTH_SCOPE: 'nonsense' }).scope).toBe(
      'write',
    );
  });

  it('never reveals the password in the startup description', () => {
    const description = describeAuth({ password: 'hunter2', scope: 'write', realm: 'AGORA' });
    expect(description).not.toContain('hunter2');
    expect(describeAuth({ password: null, scope: 'write', realm: 'AGORA' })).toContain(
      'NOT CONFIGURED',
    );
  });
});

describe('every action that can spend money is a state-changing request', () => {
  // Route handlers only. The helpers defined below them are not routes, and letting
  // the last route's slice run to the end of the file would swallow `launch` itself.
  const source = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8').split(
    '\nfunction launch(',
  )[0]!;

  /**
   * `launch()` is the only path in the server that starts a workshop, and starting a
   * workshop is what costs money. Access control keys on the HTTP method, so the
   * guarantee "no anonymous visitor can spend" reduces to "no GET route calls launch".
   * A future route that forgets this is caught here rather than on the bill.
   */
  const routes = (() => {
    const pattern = /app\.(get|post)\(\s*'([^']+)'/g;
    const found: Array<{ method: string; path: string; body: string }> = [];
    const starts = [...source.matchAll(pattern)];
    starts.forEach((match, index) => {
      const from = match.index!;
      const to = index + 1 < starts.length ? starts[index + 1]!.index! : source.length;
      found.push({ method: match[1]!, path: match[2]!, body: source.slice(from, to) });
    });
    return found;
  })();

  it('found the routes it is meant to be checking', () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => r.body.includes('launch(')).length).toBe(4);
  });

  it('never launches a run from a GET route', () => {
    const spending = routes.filter(
      (r) => r.method === 'get' && (r.body.includes('launch(') || r.body.includes('executeRun(')),
    );
    expect(spending.map((r) => r.path)).toEqual([]);
  });

  it('keeps the four run-launching routes on POST', () => {
    const launching = routes.filter((r) => r.body.includes('launch('));
    expect(launching.every((r) => r.method === 'post')).toBe(true);
    expect(launching.map((r) => r.path).sort()).toEqual([
      '/api/runs',
      '/api/runs/:runId/rerun',
      '/runs',
      '/runs/:runId/rerun',
    ]);
  });

  it('exports through a POST as well, because exporting writes files', () => {
    const exporting = routes.filter((r) => r.body.includes('exportRun('));
    expect(exporting.length).toBeGreaterThan(0);
    expect(exporting.every((r) => r.method === 'post')).toBe(true);
  });

  it('never reads a secret inside a module that renders pages', () => {
    // Naming an environment variable in documentation is fine. Reading its value in a
    // module whose job is to produce HTML is how a secret ends up on a page.
    for (const file of ['../src/server/pages.ts', '../src/server/validation.ts',
                        '../src/server/docs.ts', '../src/server/home.ts']) {
      const contents = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(contents).not.toMatch(/process\.env/);
    }
  });
});

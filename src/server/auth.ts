import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Access control for the deployed instance.
 *
 * Three properties shape this design:
 *
 *  - It fails closed. If no credential is configured, requests that would spend money
 *    or write to disk are refused outright rather than served openly. A forgotten
 *    environment variable makes the instance read-only, not free to use.
 *  - Reading and writing are separated. The overview and the documentation are meant to
 *    be shared with people reviewing the work; starting a run is not. `scope: 'all'`
 *    puts everything behind the credential when that is what is wanted.
 *  - State-changing requests must come from this origin, so a credential cached by a
 *    browser cannot be used by another site to start a run on the operator's behalf.
 *
 * HTTP Basic authentication is used because it needs no login page, no session store
 * and no cookie handling, and the deployment terminates TLS. Its limits are real and
 * are recorded in the documentation: one shared credential, no per-person accounts,
 * and no sign-out.
 */

export type AuthScope = 'write' | 'all';

export interface AuthConfig {
  /** The shared credential. `null` means none was configured. */
  password: string | null;
  /** `write` protects only state-changing requests; `all` protects everything. */
  scope: AuthScope;
  realm: string;
}

/** Always reachable, so the platform health check works without a credential. */
const OPEN_PATHS = new Set(['/healthz']);

/**
 * State-changing requests that change nothing on the server.
 *
 * The credential exists to stop a visitor spending money or writing to the record.
 * Choosing how much of the instrument to be shown does neither: it sets one cookie in
 * one browser, holding one of two known words, and no other reader can tell it happened.
 * Demanding the operator's password to press it would put a password prompt in front of
 * a display preference, which teaches people to type the password at prompts.
 *
 * These paths keep the cross-site check, and `scope: 'all'` still puts them behind the
 * credential along with everything else. Nothing that touches the database, the
 * filesystem, or a model belongs in this set.
 */
const PREFERENCE_PATHS = new Set(['/view-mode']);

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const raw = env['AGORA_AUTH_PASSWORD'];
  const password = raw && raw.length > 0 ? raw : null;
  const scope: AuthScope = env['AGORA_AUTH_SCOPE'] === 'all' ? 'all' : 'write';
  // The realm is the name the browser's sign-in dialog shows, so it carries the product
  // name. Browsers cache credentials against it: changing this asks once more, then
  // settles. AGORA_AUTH_REALM overrides it on an instance that would rather not.
  return { password, scope, realm: env['AGORA_AUTH_REALM'] ?? 'AGORA WORKSHOP' };
}

/**
 * Compares two secrets without leaking their contents, or their length, through timing.
 *
 * `timingSafeEqual` requires equal-length buffers, and branching on length would leak
 * the length of the configured password. Hashing both to a fixed 32 bytes first removes
 * that branch entirely.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

/** Reads a Basic credential and checks it against the configured password. */
export function isAuthorised(header: string | undefined, password: string): boolean {
  if (!header || !header.toLowerCase().startsWith('basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;
  // The username is unused; a single shared credential is the whole model.
  return constantTimeEquals(decoded.slice(separator + 1), password);
}

/**
 * Requests that spend money, run work, or write files.
 *
 * Exporting a bundle writes files and records artifacts, so it is a POST rather than a
 * GET; that keeps this rule to the method alone and brings export under the same
 * cross-site protection as starting a run.
 */
export function isStateChanging(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

/**
 * Rejects a cross-site form post. Browsers send `Origin` on every state-changing
 * request, so an absent header means the request did not come from a browser form and
 * a mismatched one means it came from another site.
 */
export function isSameOrigin(req: Pick<Request, 'get' | 'headers'>): boolean {
  const origin = req.get?.('origin');
  if (!origin) return true; // curl and other non-browser clients send no Origin.
  const host = req.get?.('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createAuthMiddleware(config: AuthConfig): RequestHandler {
  return function auth(req: Request, res: Response, next: NextFunction): void {
    if (OPEN_PATHS.has(req.path)) {
      next();
      return;
    }

    const changing = isStateChanging(req.method);

    if (changing && !isSameOrigin(req)) {
      res.status(403).json({
        error: 'cross-site request refused',
        detail: 'State-changing requests must originate from this instance.',
      });
      return;
    }

    const writing = changing && !PREFERENCE_PATHS.has(req.path);
    const mustAuthenticate = writing || config.scope === 'all';
    if (!mustAuthenticate) {
      next();
      return;
    }

    if (!config.password) {
      // Fail closed: without a credential there is no way to authorise this, so it is
      // refused rather than served. Reading stays available unless `scope` is `all`.
      res.status(503).json({
        error: 'authentication is not configured',
        detail: changing
          ? 'Set AGORA_AUTH_PASSWORD on this instance to enable starting runs and exporting bundles.'
          : 'This instance is configured to protect every route, but no AGORA_AUTH_PASSWORD is set.',
      });
      return;
    }

    if (!isAuthorised(req.get('authorization'), config.password)) {
      res
        .status(401)
        .set('WWW-Authenticate', `Basic realm="${config.realm}", charset="UTF-8"`)
        .json({ error: 'authentication required' });
      return;
    }

    next();
  };
}

/** One line at startup so the running configuration is never a guess. */
export function describeAuth(config: AuthConfig): string {
  if (!config.password) {
    return 'auth:    NOT CONFIGURED. Starting runs and exporting are refused (set AGORA_AUTH_PASSWORD)';
  }
  return config.scope === 'all'
    ? 'auth:    enabled for the whole instance'
    : 'auth:    enabled for starting runs and exporting; reading is open';
}

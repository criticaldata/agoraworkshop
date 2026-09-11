import type { Request } from 'express';

export type PrincipalRole = 'admin' | 'reviewer' | 'adjudicator' | 'operator';
export type Permission = 'operate' | 'review' | 'adjudicate' | 'admin';

export interface AuthPrincipal {
  id: string;
  role: PrincipalRole;
  legacy: boolean;
}

export interface AuthUser {
  role: PrincipalRole;
  password: string;
}

export function parseUsersFromEnv(env: NodeJS.ProcessEnv = process.env): Map<string, AuthUser> {
  const users = new Map<string, AuthUser>();
  const raw = env['AGORA_AUTH_USERS']?.trim();
  if (!raw) return users;
  for (const entry of raw.split(',')) {
    const parts = entry.trim().split(':');
    const id = parts.shift()?.trim() ?? '';
    const role = parts.shift()?.trim() ?? '';
    const password = parts.join(':');
    if (!id || !role || !password || !['admin', 'reviewer', 'adjudicator', 'operator'].includes(role)) {
      throw new Error('AGORA_AUTH_USERS entries must be id:role:password with a supported role');
    }
    if (users.has(id)) throw new Error(`duplicate AGORA_AUTH_USERS principal: ${id}`);
    users.set(id, { role: role as PrincipalRole, password });
  }
  return users;
}

export function permissionForPath(path: string): Permission | null {
  if (!path.startsWith('/phase1') && !path.startsWith('/api/phase1')) return null;
  if (/\/adjudicat(?:ion|e)/.test(path)) return 'adjudicate';
  if (/\/review\/snapshots\/[^/]+\/assignments$/.test(path)) return 'operate';
  if (/\/review(?:\/|$)|\/annotations(?:\/|$)|\/artifact-reviews(?:\/|$)/.test(path)) return 'review';
  return 'operate';
}

export function permits(role: PrincipalRole, permission: Permission): boolean {
  if (role === 'admin') return true;
  if (permission === 'admin') return false;
  if (permission === 'operate') return role === 'operator';
  if (permission === 'review') return role === 'reviewer' || role === 'adjudicator';
  if (permission === 'adjudicate') return role === 'adjudicator';
  return false;
}

export function principalFromRequest(req: Pick<Request, 'agoraPrincipal'>): AuthPrincipal | null {
  return req.agoraPrincipal ?? null;
}

declare global {
  namespace Express {
    interface Request {
      agoraPrincipal?: AuthPrincipal;
    }
  }
}

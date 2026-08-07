import { execFileSync } from 'node:child_process';

/** Best-effort code provenance. Returns null outside a git checkout. */
export function codeCommitSha(): string | null {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  if (process.env.AGORA_COMMIT_SHA) return process.env.AGORA_COMMIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

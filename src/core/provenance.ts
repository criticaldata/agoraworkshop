import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Which code produced a run.
 *
 * Every field is nullable and every null means the value was genuinely unavailable in
 * this environment. Nothing here is inferred, defaulted, or filled in with a plausible
 * placeholder: a run that cannot say which revision produced it must say so, because a
 * wrong answer is worse than no answer when the point is to reconstruct conditions later.
 */
export interface CodeProvenance {
  git_commit_sha: string | null;
  /** Where the commit was read from, so a reader can judge how much to trust it. */
  commit_source: 'railway' | 'environment' | 'git' | null;
  deployment_id: string | null;
  app_version: string | null;
  environment: string | null;
}

export const UNAVAILABLE = 'unavailable' as const;

/** Renders a provenance field for display without inventing a value. */
export const shown = (value: string | null): string => value ?? UNAVAILABLE;

function readGitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readPackageVersion(): string | null {
  for (const path of ['package.json', new URL('../../package.json', import.meta.url).pathname]) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // Try the next candidate; a missing package.json is not an error here.
    }
  }
  return null;
}

export function codeProvenance(
  env: NodeJS.ProcessEnv = process.env,
  gitSha: () => string | null = readGitSha,
): CodeProvenance {
  let sha: string | null = null;
  let source: CodeProvenance['commit_source'] = null;

  if (env['RAILWAY_GIT_COMMIT_SHA']) {
    sha = env['RAILWAY_GIT_COMMIT_SHA'];
    source = 'railway';
  } else if (env['AGORA_COMMIT_SHA']) {
    sha = env['AGORA_COMMIT_SHA'];
    source = 'environment';
  } else {
    const fromGit = gitSha();
    if (fromGit) {
      sha = fromGit;
      source = 'git';
    }
  }

  return {
    git_commit_sha: sha,
    commit_source: source,
    deployment_id: env['RAILWAY_DEPLOYMENT_ID'] ?? env['AGORA_DEPLOYMENT_ID'] ?? null,
    app_version: env['AGORA_APP_VERSION'] ?? readPackageVersion(),
    environment: env['RAILWAY_ENVIRONMENT_NAME'] ?? env['NODE_ENV'] ?? null,
  };
}

/** One line for the startup log, so the running revision is never a guess. */
export function describeProvenance(p: CodeProvenance): string {
  const commit = p.git_commit_sha ? `${p.git_commit_sha.slice(0, 12)} (${p.commit_source})` : UNAVAILABLE;
  return `commit ${commit} · version ${shown(p.app_version)} · deployment ${shown(p.deployment_id)} · env ${shown(p.environment)}`;
}
